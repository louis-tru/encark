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
import _server, {Server as BaseServer} from './_server';
import upgrade from './ws/upgrade';
import service from './service';
import {StaticService} from './static_service';
import './http_service';

/**
	* @class Server Impl
	*/
export class Server extends BaseServer {

	private m_checkIntervalId: any;

	//Handle http and websocket and http-heartbeat request
	protected _initializ(server: http.Server) {
		//http
		server.on('request', async(req: http.IncomingMessage, res: http.ServerResponse)=>{
			if (this.interceptRequest(req, res)) 
				return;

			var url = decodeURI(req.url || '');       // 解码
			var info = this.router.find(url);   // 通过url查找目标服务信息
			var name = info.service;
			var cls = service.get(name) as unknown as typeof StaticService;

			if (this.printLog) {
				console.log(url);
			}

			if (cls) {
				if (!util.equalsClass(StaticService, cls)) {
					console.error(name + ' not the correct type, http request');
					cls = StaticService;
				}
			} else {
				cls = StaticService;
			}

			try {
				var ser: StaticService = new cls(req, res);
				var ok = ser.requestAuth(info); // 认证请求的合法性
				if (ok instanceof Promise) {
					req.pause();
					if (! await ok)
						return req.socket.destroy(); // 立即断开连接
					req.resume();
				} else if (!ok) {
					return req.socket.destroy();
				}
			} catch(err) {
				console.error(err);
				return req.socket.destroy();
			}

			req.on('data', function() {});

			ser.action(info);
		});

		// upgrade websocket, create web socket connection
		server.on('upgrade', (req: http.IncomingMessage, socket: net.Socket, upgradeHead: any)=>{
			if (this.printLog) {
				console.log(`Web socket upgrade ws://${req.headers.host}${req.url}`);
			}
			upgrade(req, upgradeHead);
		});
		
		server.on('error', (err: any)=>{
			console.log(err);
			console.log('Server Error ---------------');
		});

		this.addEventListener('Startup', ()=>{
			this.m_checkIntervalId = setInterval(()=>{
				var time = Date.now();
				for (var conv of Object.values(this.m_ws_conversations)) {
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
	Server: Server,
	setShared: _server.setShared,
	get shared() { return _server.shared },
};
