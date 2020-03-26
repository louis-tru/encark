/* ***** BEGIN LICENSE BLOCK *****
 * Distributed under the BSD license:
 *
 * Copyright (c) 2015, xuewen.chu
 * All rights reserved.
 * 
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *     * Redistributions of source code must retain the above copyright
 *       notice, self list of conditions and the following disclaimer.
 *     * Redistributions in binary form must reproduce the above copyright
 *       notice, self list of conditions and the following disclaimer in the
 *       documentation and/or other materials provided with the distribution.
 *     * Neither the name of xuewen.chu nor the
 *       names of its contributors may be used to endorse or promote products
 *       derived from self software without specific prior written permission.
 * 
 * self SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
 * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL xuewen.chu BE LIABLE FOR ANY
 * DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
 * LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
 * ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF self
 * SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 * 
 * ***** END LICENSE BLOCK ***** */

import utils from './util';
import path from './path';
import { Notification } from './event';
import { Request, Options as RequestOptions, Signer } from'./request';
import { WSConversation, WSClient, METHOD_CALL_TIMEOUT } from './ws/cli';
import * as log from './log';

var __j = 0;

var serviceAPI = new path.URL(utils.config.serviceAPI || 'http://127.0.0.1:8091');

if (utils.haveWeb) {
	var default_host = path.getParam('D_SDK_HOST') || serviceAPI.hostname;
	var default_port = path.getParam('D_SDK_PORT') || serviceAPI.port;
	var default_ssl = !!Number(path.getParam('D_SDK_SSL')) || /^(http|ws)s/.test(serviceAPI.protocol);
	var default_virtual = path.getParam('D_SDK_VIRTUAL') || serviceAPI.filename;
} else {
	var default_host = serviceAPI.hostname;
	var default_port = serviceAPI.port;
	var default_ssl = /^(http|ws)s/.test(serviceAPI.protocol);
	var default_virtual = serviceAPI.filename;
}

interface Descriptors {
	type: 'service' | 'event';
	methods: string[];
	events: string[];
}

export interface Options extends RequestOptions {
	sender?: string;
}

export interface Methods {
	[method: string]: (args?: any, opts?: Options)=>Promise<any>;
}

class WrapClient extends Notification {

	private m_desc: Descriptors;
	protected m_name = '';
	private m_host: APIStore;
	private m_cli: WSClient | Request;
	private m_methods: Methods = {};

	constructor(host: APIStore, name: string, cli: any, desc: Descriptors) {
		super();
		this.m_host = host;
		this.m_name = name;
		this.m_cli = cli;
		this.m_desc = desc;

		if (this.m_desc) {
			this.m_desc.methods.forEach(e=>{
				this.m_methods[e] = (...args: any[])=>{
					return this.call(e, ...args);
				};
			});
		}
	}

	get methods() {
		return this.m_methods;
	}

	getNoticer(name: string) {
		if (this.m_cli instanceof WSClient) {
			if (this.hasNoticer(name)) {
				return super.getNoticer(name);
			} else {
				var notice = super.getNoticer(name);
				this.m_cli.addEventForward(name, notice); // forward event
				return notice;
			}
		} else {
			return super.getNoticer(name);
		}
	}

	protected async _call(name: string, full_name: string, ...args: any[]): Promise<any> {
		var fail;
		var is_report_call = name.indexOf('report') != -1;
		try {
			// TODO Printing log will lead to `electron` client crash
			// if (!is_report_call)
			// log.log('call', full_name, __j++, '...');
			return await this.m_cli.call(name, ...args);
		} catch(err) {
			fail = err;
			this.m_host.trigger('Error', err);
			throw err;
		} finally {
			// if (!is_report_call)
			// 	log.log('call', full_name, --__j, fail ? 'fail' : 'ok');
		}
	}

	call(name: string, data?: any, opts?: Options) {
		var timeout = opts?.timeout || METHOD_CALL_TIMEOUT;
		return this._call(name, this.m_name + '/' + name, data, timeout, opts?.sender);
	}

	trigger(name: string, data: any) {
		// log.log(`${this.m_name}/${name}`, data);
		return super.trigger(name, data);
	}
}

class WrapRequest extends WrapClient {
	async call(name: string, ...args: any[]) {
		name = this.m_name + '/' + name;
		return (await this._call(name, name, ...args)).data;
	}
}

class Request2 extends Request {
	private m_host: APIStore;

	constructor(host: APIStore, url: string) {
		super(url);
		this.m_host = host;
	}

	getRequestHeaders() {
		return this.m_host.requestHeaders;
	}
}

class WSConversation2 extends WSConversation {
	private m_host: APIStore;

	constructor(host: APIStore, url: string) {
		super(url);
		this.m_host = host;
	}
	getRequestHeaders() {
		return this.m_host.requestHeaders;
	}
}

/**
 * @class APIStore
 */
export class APIStore extends Notification {
	private m_name: string;
	private m_conv: WSConversation2 | null;
	private m_req: Request2 | null;
	private m_desc: Dict<Descriptors> = {};
	private m_timeoutid = 0;
	private m_signer: any = null;
	private m_request_headers: Dict = {};
	private m_port = ''
	private m_ssl = '';
	private m_host = '';
	private m_virtual = '';
	private m_core: Dict<WrapClient> = {};
	private m_isloaded = false;

	get name() {
		return this.m_name;
	}

	get descriptors() {
		return this.m_desc;
	}

	get core() {
		return this.m_core;
	}

	constructor(name = 'dphoto-cli') {
		super();
		this.m_name = name;
	}
		
	private _get_wssocket_conv() {
		var self = this;
		if (!self.m_conv) {
			var port = self.m_port != (self.m_ssl?'443':'80') ? ':'+self.m_port: '';
			var pathname = path.resolve(`ws${self.m_ssl}://${self.m_host}${port}`, self.m_virtual);
			var conv = self.m_conv = new WSConversation2(self, pathname);
			if (self.m_signer)
				conv.signer = self.m_signer;
			conv.onClose.on(e=>console.error('Connection accidental disconnection'));
			conv.keepAliveTime = 5e3; // 5s;
			// disconnect auto connect
			conv.onClose.on(e=>{
				utils.sleep(50).then(e=>conv.connect());
			});
			conv.onError.on(e=>{
				utils.sleep(50).then(e=>conv.connect());
			});
		}
		return self.m_conv;
	}

	private _setUncaughtException() {
		var self = this;
		if (utils.haveWeb) {
			globalThis.addEventListener('error', function(e) {
				var { message, filename, lineno, colno, error } = e;
				// console.error(error);
				self.trigger('uncaughtException', error);
			});
		
			globalThis.addEventListener('unhandledrejection', function(e) {
				// console.error(e.reason);
				self.trigger('uncaughtException', e.reason);
			});
		
		} else if (utils.haveNode) {
		
			process.on('uncaughtException', function(err) {
				// console.error(err);
				self.trigger('uncaughtException', err);
			});
		
			process.on('unhandledRejection', (err, promise) => {
				// console.error(err);
				self.trigger('uncaughtException', err);
			});
		}
		
	}

	destroy() {
		if (this.m_conv)
			this.m_conv.close();
		clearInterval(this.m_timeoutid);
	}

	get isLoaded() {
		return this.m_isloaded;
	}

	get requestHeaders() {
		return this.m_request_headers;
	}

	setRequestHeaders(headers: Dict) {
		this.m_request_headers = headers;
	}

	setSigner(signer: Signer) {
		this.m_signer = signer;
		if (this.m_req)
			this.m_req.signer = signer;
		if (this.m_conv)
			this.m_conv.signer = signer;
	}

	async initialize(
		host = default_host,
		port = default_port,
		ssl = default_ssl, virtual = default_virtual
	)
	{
		this.m_host = host;
		this.m_port = port || (ssl?'443':'80');
		this.m_ssl = ssl ? 's': '';
		this.m_virtual = virtual.replace('service-api', '');

		port = this.m_port != (ssl?'443':'80') ? ':'+this.m_port: '';

		var service_api = path.resolve(
			`http${this.m_ssl}://${host}${port}`, this.m_virtual, 'service-api');

		this.m_req = new Request2(this, service_api);
		this.m_req.urlencoded = false;
		if (this.m_signer)
			this.m_req.signer = this.m_signer;

		var { data: desc } = await this.m_req.get('descriptors/descriptors');
		this.m_desc = desc;
		delete this.m_desc.descriptors;

		for (var name in desc) {
			var item = desc[name];
			if (item.type == 'event') {
				var ws = this._get_wssocket_conv();
				this.m_core[name] = new WrapClient(this, name, new WSClient(name, ws), desc[name]);
			} else {
				this.m_core[name] = new WrapRequest(this, name, this.m_req, desc[name]);
			}
		}

		this._setUncaughtException();

		log.Console.defaultInstance.log('nxkit/store', 'startup complete');
	}

	trigger(name: string, data: any) {
		log.log(`${this.m_name}/${name}`, data);
		return super.trigger(name, data);
	}
}

export const store = new APIStore();

export default store.core;