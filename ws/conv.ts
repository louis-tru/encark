/* ***** BEGIN LICENSE BLOCK *****
 * Distributed under the BSD license:
 *
 * Copyright (c) 2015, blue.chu
 * All rights reserved.
 * 
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *     * Redistributions of source code must retain the above copyright
 *       notice, this list of conditions and the following disclaimer.
 *     * Redistributions in binary form must reproduce the above copyright
 *       notice, this list of conditions and the following disclaimer in the
 *       documentation and/or other materials provided with the distribution.
 *     * Neither the name of blue.chu nor the
 *       names of its contributors may be used to endorse or promote products
 *       derived from this software without specific prior written permission.
 * 
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
 * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL blue.chu BE LIABLE FOR ANY
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
	 * @arg {String}   bindServices
	 */
	constructor(req: http.IncomingMessage, upgradeHead: any, bindServices: string) {
		super();

		var server = (req.socket as any).server as http.Server;
		this.server = (server as any).__wrap__ as s.Server;
		this.request = req;
		this.socket = req.socket;

		// initialize
		this._initialize(bindServices).catch(()=>{
			this.close();
			this._safeDestroy(); // 关闭连接
			// console.warn(err);
		});
	}

	private _safeDestroy() {
		try {
			if (this.socket.writable)
				this.socket.end();
			this.socket.destroy(); // 关闭连接
		} catch(err) {
			console.warn('_safeDestroy', err);
		}
		this._safeDestroyService();
	}

	private _safeDestroyService() {
		for (var s of Object.values(this.m_handles)) {
			try {
				(s as wsservice.WSService).destroy();
			} catch(err) {
				console.error(err);
			}
		}
		this.m_handles = {};
	}

	private async _initialize(bind_services: string) {
		var self = this;
		var services = bind_services.split(',');
		utils.assert(services[0], 'Bind Service undefined');
		utils.assert(!self.m_isOpen);

		if (!self._handshakes())
			return self._safeDestroy();  // 关闭连接

		this._initializeSocket();

		self.m_isOpen = true;

		self.onClose.on(function() {
			utils.assert(self.m_isOpen);
			console.log('WS conv close', self.m_token);

			self.m_isOpen = false;
			self._safeDestroyService();
			try {
				self.server.onWSConversationClose.trigger(self);
			} catch(err) {
				console.error(err);
			}
		});

		try {
			self.socket.pause();
			self.onOpen.trigger({});
			self.server.onWSConversationOpen.trigger(self);
			await self.bindServices(services);
			utils.assert(self.m_isOpen, 'The connection has been closed');
		} catch(err) {
			await utils.sleep(5e3); // delay 5s
			throw err;
		} finally {
			self.socket.resume();
		}
	}

	private _initializeSocket() {
		var self = this;
		var socket = self.socket;
		var parser = new PacketParser();

		socket.setNoDelay(true);
		socket.setTimeout(0);
		socket.setKeepAlive(true, KEEP_ALIVE_TIME);

		socket.on('timeout', ()=>self.close());
		socket.on('end', ()=>self.close());
		socket.on('close', ()=>self.close());
		socket.on('data', (e)=>parser.add(buffer.from(e)));
		socket.on('error', e=>(console.warn('web socket error:',e),self.close()));
		socket.on('drain', ()=>(self.m_overflow = false,self.onDrain.trigger({})));

		parser.onText.on(e=>self.handlePacket(e.data, true/*isText*/));
		parser.onData.on(e=>self.handlePacket(e.data, false));
		parser.onPing.on(e=>self.handlePing(e.data));
		parser.onPong.on(e=>self.handlePong(e.data));
		parser.onClose.on(()=>self.close());
		parser.onError.on(e=>(console.warn('web socket parser error:',e.data),self.close()));
	}

	private _handshakes() {
		var req = this.request;
		var key = req.headers['sec-websocket-key'];
		var origin = <string>req.headers['sec-websocket-origin'] || '';
		// var location = (socket.encrypted ? 'wss' : 'ws') + '://' + req.headers.host + req.url;
		var upgrade = req.headers.upgrade;

		if (!upgrade || upgrade.toLowerCase() !== 'websocket') {
			console.warn('connection invalid');
			return false;
		}
		if (!this.verifyOrigin(origin)) {
			console.warn('connection invalid: origin mismatch');
			return false;
		}
		if (!key) {
			console.warn('connection invalid: received no key');
			return false;
		}

		// upgrade response
		var shasum = crypto.createHash('sha1');
		shasum.update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11');
		key = shasum.digest('base64');
		var headers = [
			'HTTP/1.1 101 Switching Protocols',
			'Upgrade: websocket',
			'Connection: Upgrade',
			'Session-Token: ' + this.token,
			'Sec-WebSocket-Accept: ' + key,
			'', '',
		];
		this.socket.write(headers.join('\r\n'));

		return true;
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

			var ser = new cls(self);
			console.log('SW onRequestAuth', this.request.url, this.m_token, ser.headers, ser.params);

			var ok = await utils.timeout(ser.onRequestAuth({ service: name, action: '' }), 2e4, (e)=>console.warn(e));
			if (!ok && self.server.printLog)
				console.log('ILLEGAL ACCESS WSService', ser.pathname, ser.headers, ser.params);
			utils.assert(ok, errno.ERR_REQUEST_AUTH_FAIL);
			self.m_isGzip = ser.headers['use-gzip'] == 'on';

			console.log('SER Loading', this.request.url, this.m_token);

			await utils.timeout(ser.load(), 2e4, function(e) {
				if (e.errno == errno.ERR_EXECUTE_TIMEOUT_AFTER[0])
					ser.destroy();
				console.warn(e);
			});

			if (!self.m_default_service)
				self.m_default_service = name;
			self.m_handles[name] = ser;
			self.m_services_count++;

			await utils.sleep(200); // TODO 在同一个node进程中同时开启多个服务时socket无法写入
			ser._trigger('Load', {token:this.token}).catch((e: any)=>console.warn(e));

			console.log('SER Load', this.request.url, this.m_token);
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
				socket.destroy();
			} catch(err) {
				console.warn('WSConversation#close', err);
			}
			this.onClose.trigger({});
			console.log('Hybi Conversation Close', this.m_token);
		}
	}

}