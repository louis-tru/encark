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

import utils from '../../util';
import request from '../../request';
import buffer, {IBuffer} from '../../buffer';
import errno from '../../errno';
import * as net from 'net';
import * as http from 'http';
import * as https from 'https';
import * as crypto from 'crypto';
import {
	PacketParser, sendDataPacket,
	sendPingPacket, sendPongPacket } from '../parser';
import _conv, {WSConversation,KEEP_ALIVE_TIME} from './conv';

// Node implementation
export default class NodeConversation extends WSConversation {

	private m_req: http.ClientRequest | null = null;
	private m_socket: net.Socket | null = null; // web socket connection

	initialize() {
		utils.assert(!this.m_req, 'No need to repeat open');

		if (_conv.USE_GZIP_DATA)
			this.setGzip(true); // use gzip

		var self = this;
		var url = this.m_url;
		var bind_services = Object.keys(this.m_handles).join(',');

		url.setParam('bind_services', bind_services);

		var isSSL = url.protocol == 'wss:';
		var port = url.port || (isSSL ? 443: 80);
		var lib = isSSL ? https: http;
		var path = url.path;
		var origin = '127.0.0.1:' + port;
		var key = Date.now();

		var headers: http.OutgoingHttpHeaders = Object.assign({}, this.getRequestHeaders(), {
			'User-Agent': request.userAgent,
			'Connection': 'Upgrade',
			'Upgrade': 'websocket',
			'Origin': origin,
			'Sec-Websocket-Origin': origin,
			'Sec-Websocket-Version': 13,
			'Sec-Websocket-Key': key,
			'Use-Gzip': this.isGzip ? 'on': 'off',
		});

		if (this.m_signer) {
			Object.assign(headers, this.m_signer.sign(path));
		}

		var options: https.RequestOptions = {
			hostname: url.hostname,
			port: port,
			path: path,
			headers: headers,
			rejectUnauthorized: false,
		};

		if (isSSL) {
			options.agent = new https.Agent(options);
		}

		var req = this.m_req = lib.request(options);

		function handshakes(res: http.IncomingMessage, key: number) {
			var accept = res.headers['sec-websocket-accept'];
			if (accept) {
				var shasum = crypto.createHash('sha1');
				shasum.update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11');
				var skey = shasum.digest('base64');
				return skey == accept;
			}
			return false;
		}

		req.on('upgrade', function(res, socket, upgradeHead) {
			console.log('CLI NodeConversation Upgrade', self.m_url.href);

			if ( !self.m_connect || !handshakes(res, key) ) {
				socket.end();
				self.close(); return;
			}

			self.m_socket = socket;
			self.m_token = <string>res.headers['session-token'] || '';

			var parser = new PacketParser();

			socket.setNoDelay(true);
			socket.setTimeout(0);
			socket.setKeepAlive(true, KEEP_ALIVE_TIME);

			socket.on('timeout', ()=>self.close());
			socket.on('end', ()=>self.close());
			socket.on('close', ()=>self.close());
			socket.on('data', d=>parser.add(buffer.from(d.buffer)));
			socket.on('error', e=>(self._error(e),self.close()));
			socket.on('drain', ()=>(self.m_overflow = false,self.onDrain.trigger({})));

			parser.onText.on(e=>self.handlePacket(e.data, true));
			parser.onData.on(e=>self.handlePacket(e.data, false));
			parser.onPing.on(e=>self.handlePing(e.data));
			parser.onPong.on(e=>self.handlePong(e.data));
			parser.onClose.on(e=>self.close());
			parser.onError.on(e=>(self._error(e.data),self.close()));

			self._open();
		});

		req.on('error', function(e) {
			console.log('CLI NodeConversation error', self.m_url.href);
			self._error(e);
			self.close();
		});
		console.log('CLI NodeConversation init', self.m_url.href, self.m_connect);

		req.end();
	}

	/**
	 * @ovrewrite 
	 */
	close() {
		var socket = this.m_socket;
		if (socket) {
			this.m_socket = null;
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
		} else {
			if (this.m_req) {
				this.m_req.abort();
			}
		}
		this.m_req = null;
		this.m_socket = null;
		super.close();
	}

	/**
	 * @ovrewrite
	 */
	send(data: IBuffer): Promise<void> {
		utils.assert(this.isOpen, errno.ERR_CONNECTION_CLOSE_STATUS);
		return WSConversation.write(this, sendDataPacket, [this.m_socket, data]);
	}

	/**
	 * @overwrite
	 */
	ping(): Promise<void> {
		utils.assert(this.isOpen, errno.ERR_CONNECTION_CLOSE_STATUS);
		return WSConversation.write(this, sendPingPacket, [this.m_socket]);
	}

	/**
	 * @overwrite
	 */
	pong(): Promise<void> {
		utils.assert(this.isOpen, errno.ERR_CONNECTION_CLOSE_STATUS);
		return WSConversation.write(this, sendPongPacket, [this.m_socket]);
	}

}