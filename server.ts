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

import util from './util';
import * as http from 'http';
import * as net from 'net';
import _server, {Server} from './_server';
import upgrade from './ws/upgrade';
import service from './service';
import {StaticService} from './static_service';
import './http_service';
import {RuleResult} from './router';
export * from './_server';

/**
	* @class Server Impl
	*/
export class ServerIMPL extends Server {

	private m_checkIntervalId: any;

	//Handle http and websocket and http-heartbeat request
	protected initializ(server: http.Server) {

		async function requestAuth(ser: StaticService, rule: RuleResult) {
			var ok = ser.onRequestAuth(rule); // 认证请求的合法性
			if (ok instanceof Promise) {
				ser.request.pause();
				if (! await ok) {
					return ser.request.socket.destroy(); // 立即断开连接
				}
				ser.request.resume();
			} else if (!ok) {
				return ser.request.socket.destroy();
			}
			return true;
		}

		//http
		server.on('request', async(req: http.IncomingMessage, res: http.ServerResponse)=>{
			if (this.interceptRequest(req, res)) 
				return;

			var url = decodeURI(req.url || ''); // 解码
			var rule = this.router.find(url);   // 通过url查找目标服务信息
			var name = rule.service;
			var cls = service.get(name) as unknown as typeof StaticService;

			if (this.printLog) {
				console.log(url);
			}

			if (cls) {
				if (!util.equalsClass(StaticService, cls)) {
					console.warn('ServerIMPL#initializ#2', name + ' not the correct type, http request');
					cls = StaticService;
				}
			} else {
				cls = StaticService;
			}

			try {
				var ser: StaticService = new cls(req, res);
				if (req.method == 'OPTIONS') {
					return ser.onOptionsRequest(rule); // handle options
				}
				if (! await requestAuth(ser, rule)) {
					if (this.printLog)
						console.log('REQUEST', 'ILLEGAL ACCESS, onRequestAuth', ser.pathname, ser.headers, ser.params);
					return;
				}
			} catch(err) {
				console.warn('ServerIMPL#initializ#2', err);
				return req.socket.destroy();
			}

			req.on('data', function() {});

			ser.onAction(rule);
		});

		// upgrade websocket, create web socket connection
		server.on('upgrade', (req: http.IncomingMessage, socket: net.Socket, upgradeHead: any)=>{
			if (this.printLog)
				console.log(`Web socket upgrade ws://${req.headers.host}${req.url}`);
			upgrade(req, upgradeHead);
		});
		
		server.on('error', (err: any)=>{
			console.log('ServerIMPL#initializ#3', err);
			console.log('Server Error ---------------');
		});

		this.addEventListener('Startup', ()=>{
			this.m_checkIntervalId = setInterval(()=>{
				var time = Date.now();
				for (var [,conv] of this.m_ws_conversations) {
					if (conv.keepAliveTime * 2 + conv.lastPacketTime < time) {
						conv.close(); // disconnect
					}
				}
			}, 3e4/*30s*/);
		});

		server.on('close', ()=>{
			clearInterval(this.m_checkIntervalId);
			this.m_isRun = false;
			this.trigger('Stop', {});
		});
	}
}

export default {
	ServerIMPL: ServerIMPL,
	setShared: _server.setShared,
	get shared() { return _server.shared },
};
