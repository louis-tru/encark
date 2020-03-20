/* ***** BEGIN LICENSE BLOCK *****
 * Distributed under the BSD license:
 *
 * Copyright (c) 2015, xuewen.chu
 * All rights reserved.
 * 
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *     * Redistributions of source code must retain the above copyright
 *       notice, this list of conditions and the following disclaimer.
 *     * Redistributions in binary form must reproduce the above copyright
 *       notice, this list of conditions and the following disclaimer in the
 *       documentation and/or other materials provided with the distribution.
 *     * Neither the name of xuewen.chu nor the
 *       names of its contributors may be used to endorse or promote products
 *       derived from this software without specific prior written permission.
 * 
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
 * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL xuewen.chu BE LIABLE FOR ANY
 * DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
 * LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
 * ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
 * SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 * 
 * ***** END LICENSE BLOCK ***** */

import utils from '../util';
import service from '../service';
import * as wsservice from './service';
import errno from '../errno';
import buffer, {IBuffer} from '../buffer';
import uuid from '../hash/uuid';
import * as crypto from 'crypto';
import * as http from 'http';
import * as net from 'net';
import * as s from '../_server';
import * as url from 'url';
import {ConversationBasic, KEEP_ALIVE_TIME} from './_conv';
export * from './_conv';

import { PacketParser, sendDataPacket } from './parser';
import { PING_BUFFER, PONG_BUFFER } from './data';

export class WSConversation extends ConversationBasic  {

	protected m_token = uuid();
	readonly server: s.Server;
	readonly request: http.IncomingMessage;
	readonly socket: net.Socket;

	/**
	 * @arg {http.ServerRequest} req
	 * @arg {String}   bind_services
	 */
	constructor(req: http.IncomingMessage, upgradeHead: any, bind_services: string) {
		super();

		var server = <http.Server>(<any>req.socket).server;
		this.server = <s.Server>(<any>server).__wrap__;
		this.request = req;
		this.socket = req.socket;

		// initialize
		this._initialize(bind_services).catch(err=>{
			this.close();
			this._safeDestroy();  // 关闭连接
			// console.warn(err);
		});
	}

	private _safeDestroy() {
		try {
			if (this.socket)
				this.socket.destroy();  // 关闭连接
		} catch(err) {
			console.warn(err);
		}
	}

	private async _initialize(bind_services: string) {
		var self = this;
		var services = bind_services.split(',');
		utils.assert(services[0], 'Bind Service undefined');

		self.socket.pause();

		if (!self.__initialize())
			return self._safeDestroy();  // 关闭连接

		utils.assert(!self.m_isOpen);

		self.m_isOpen = true;

		self.onClose.on(function() {
			utils.assert(self.m_isOpen);

			console.log('WS conv close');

			self.m_isOpen = false;
			// self.request = null;
			// self.socket = null;
			// self.token = '';
			// self.onOpen.off();

			try {
				for (var s of Object.values(self.m_handles)) {
					(s as wsservice.WSService).destroy();
				}
				self.server.onWSConversationClose.trigger(self);
			} catch(err) {
				console.error(err);
			}

			// self.server = null;
			utils.nextTick(()=>self.onClose.off());
		});

		self.onOpen.trigger({});
		self.server.onWSConversationOpen.trigger(self);

		try {
			await self.bindServices(services);
		} catch(err) {
			await utils.sleep(5e3); // delay 5s
			throw err;
		}
		self.socket.resume();
	}

	private __initialize() {
		if (!this._handshakes()) {
			return false;
		}
		var self = this;
		var socket = this.socket;
		var parser = new PacketParser();

		socket.setNoDelay(true);
		socket.setTimeout(0);
		socket.setKeepAlive(true, KEEP_ALIVE_TIME);

		socket.on('timeout', ()=>self.close());
		socket.on('end', ()=>self.close());
		socket.on('close', ()=>self.close());
		socket.on('data', (e)=>parser.add(buffer.from(e)));
		socket.on('error', e=>(console.error('web socket error:',e),self.close()));
		socket.on('drain', ()=>(self.m_overflow = false,self.onDrain.trigger({})));

		parser.onText.on(e=>self.handlePacket(e.data, true/*isText*/));
		parser.onData.on(e=>self.handlePacket(e.data, false));
		parser.onPing.on(e=>self.handlePing(e.data));
		parser.onPong.on(e=>self.handlePong(e.data));
		parser.onClose.on(e=>self.close());
		parser.onError.on(e=>(console.error('web socket parser error:',e.data),self.close()));

		return true;
	}

	private _handshakes() {
		var req = this.request;
		var key = req.headers['sec-websocket-key'];
		var origin = <string>req.headers['sec-websocket-origin'] || '';
		// var location = (socket.encrypted ? 'wss' : 'ws') + '://' + req.headers.host + req.url;
		var upgrade = req.headers.upgrade;

		if (!upgrade || upgrade.toLowerCase() !== 'websocket') {
			console.error('connection invalid');
			return false;
		}
		
		if (!this.verifyOrigin(origin)) {
			console.error('connection invalid: origin mismatch');
			return false;
		}

		if (!key) {
			console.error('connection invalid: received no key');
			return false;
		}

		try {
			this._upgrade();
		} catch(err) {
			console.error(err);
			return false;
		}

		return true;
	}

	private _upgrade() {
		// calc key
		var key = this.request.headers['sec-websocket-key'];
		var shasum = crypto.createHash('sha1');
		shasum.update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11');
		key = shasum.digest('base64');
		var headers = [
			'HTTP/1.1 101 Switching Protocols',
			'Upgrade: websocket',
			'Connection: Upgrade',
			'Session-Token: ' + this.token,
			'Sec-WebSocket-Accept: ' + key,
		];
		this.socket.write(headers.concat('', '').join('\r\n'));
	}

	/**
	 * verifies the origin of a request.
	 * @param  {String} origin
	 * @return {Boolean}
	 */
	verifyOrigin(origin: string) {
		var origins = this.server.origins;
		if (origin == 'null') {
			origin = '*';
		}
		if (origins.indexOf('*:*') != -1) {
			return true;
		}
		if (origin) {
			try {
				var parts = url.parse(origin);
				var ok =
					~origins.indexOf(parts.hostname + ':' + parts.port) ||
					~origins.indexOf(parts.hostname + ':*') ||
					~origins.indexOf('*:' + parts.port);
				if (!ok) {
					console.warn('illegal origin: ' + origin);
				}
				return ok;
			}
			catch (ex) {
				console.warn('error parsing origin');
			}
		} else {
			console.warn('origin missing from websocket call, yet required by config');
		}
		return false;
	}

	/** 
	 * @func bindService() 绑定服务
	*/
	protected async bindServices(services: string[]) {
		var self = this;
		for (var name of services) {
			var cls = service.get(name) as unknown as (typeof wsservice.WSService);
			utils.assert(cls, name + ' not found');
			utils.assert(utils.equalsClass(wsservice.WSService, cls), name + ' Service type is not correct');
			utils.assert(!(name in self.m_handles), 'Service no need to repeat binding');

			console.log('SW requestAuth', this.request.url);

			var ser = new cls(self);
			var ok = await utils.timeout(ser.requestAuth({ service: name, action: '' }), 2e4);
			utils.assert(ok, errno.ERR_REQUEST_AUTH_FAIL);
			self.m_isGzip = ser.headers['use-gzip'] == 'on';

			console.log('SER Loading', this.request.url);

			await utils.timeout(ser.load(), 2e4);

			if (!self.m_default_service)
				self.m_default_service = name;
			self.m_handles[name] = ser;
			self.m_services_count++;
			(<any>ser).m_loaded = true; // TODO ptinate visit
			(<any>ser).name = name;     // TODO ptinate visit 设置服务名称

			await utils.sleep(200); // TODO 在同一个node进程中同时开启多个服务时socket无法写入
			ser._trigger('Load', {token:this.token}).catch((e: any)=>console.error(e));
			console.log('SER Load', this.request.url);
		}
	}

	send(data: IBuffer): Promise<void> {
		utils.assert(this.isOpen, errno.ERR_CONNECTION_CLOSE_STATUS);
		return ConversationBasic.write(this, sendDataPacket, [this.socket, data]);
	}

	ping(): Promise<void> {
		utils.assert(this.isOpen, errno.ERR_CONNECTION_CLOSE_STATUS);
		// return _Conversation.write(this, sendPingPacket, [this.socket]);
		// TODO Browser does not support standard Ping and Pong API, So the extension protocol is used here
		return ConversationBasic.write(this, sendDataPacket, [this.socket, PING_BUFFER]);
	}

	pong(): Promise<void> {
		utils.assert(this.isOpen, errno.ERR_CONNECTION_CLOSE_STATUS);
		// return _Conversation.write(this, sendPongPacket, [this.socket]);
		// TODO Browser does not support standard Ping and Pong API, So the extension protocol is used here
		return ConversationBasic.write(this, sendDataPacket, [this.socket, PONG_BUFFER]);
	}

	close() {
		if (this.isOpen) {
			var socket = this.socket;
			socket.removeAllListeners('timeout');
			socket.removeAllListeners('end');
			socket.removeAllListeners('close');
			socket.removeAllListeners('error');
			socket.removeAllListeners('data');
			socket.removeAllListeners('drain');
			try {
				if (socket.writable) 
					socket.end();
			} catch(err) {
				console.error(err);
			}
			this.onClose.trigger({});
			console.log('Hybi Conversation Close');
		}
	}

}