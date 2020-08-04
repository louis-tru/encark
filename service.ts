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
import * as querystring from 'querystring';
import * as Path from 'path';
import * as http from 'http';
import * as net from 'net';
import {Server} from './_server';
import {RuleResult} from './router';

const _service_cls: Dict<typeof Service> = {};

/**
 * base service abstract class
 * @class Service
 */
export class Service {
	// @private:
	private m_pathname: string | undefined;
	private m_dirname: string | undefined;
	private m_extname: string | null = null;
	private m_params: Dict | undefined;
	private m_headers: http.IncomingHttpHeaders | undefined;

	static type: string = 'service';

	// @public:
	/**
	 * @type {String} 服务名称
	 */
	readonly name: string;// = '';
	
	/**
	 * server
	 * @type {Server}
	 */
	readonly server: Server;

	/**
	 * request of server
	 * @type {http.ServerRequest}
	 */
	readonly request: http.IncomingMessage;

	/**
	 * @type {net.Stream}
	 */
	readonly socket: net.Socket;

	/**
	 * request host
	 * @type {String}
	 */
	readonly host: string;

	/**
	 * request path
	 * @type {String}
	 */
	readonly url: string;

	/**
	 * no param url
	 * @type {String}
	 */
	get pathname(): string {
		if (!this.m_pathname) {
			var mat = this.url.match(/^\/[^\?\#]*/);
			this.m_pathname = mat ? mat[0] : this.url;
		}
		return <string>this.m_pathname;
	}

	/**
	 * request path directory
	 * @type {String}
	 */
	get dirname(): string {
		if (!this.m_dirname) {
			this.m_dirname = Path.dirname(this.pathname);
		}
		return <string>this.m_dirname;
	}

	/**
	 * request extended name
	 * @type {String}
	 */
	get extname(): string {
		if (this.m_extname === null) {
			var mat = this.pathname.match(/\.[^\.]+$/);
			this.m_extname = mat ? mat[0] : '';
		}
		return <string>this.m_extname;
	}

	/**
	 * url param list
	 * @type {Object}
	 */
	get params() {
		if (!this.m_params) {
			var mat = this.url.match(/\?(.+)/);
			this.m_params = querystring.parse(mat ? mat[1] : '');
			delete this.m_params._;
		}
		return this.m_params;
	}

	get headers(): http.IncomingHttpHeaders {
		if (!this.m_headers) {
			var _headers: http.IncomingHttpHeaders = {};
			try {
				if (this.params._headers) {
					for ( var [key, value] of Object.entries(JSON.parse(this.params._headers)) )
						_headers[key.toLowerCase()] = String(value);
				}
			} catch(e) {
				console.error(e);
			}
			this.m_headers = { ...this.request.headers, ..._headers };
		}
		return this.m_headers;
	}

	/**
	 * @func setTimeout(value)
	 */
	setTimeout(value: number) {
		this.request.setTimeout(value);
	}

	/**
	 * @constructor
	 * @arg req {http.ServerRequest}
	 */
	constructor(req: http.IncomingMessage) {
		var server = <http.Server>(<any>req.socket).server;
		this.server = <Server>(<any>server).__wrap__;
		this.request = req;
		this.socket = req.socket;
		this.host = <string>(req.headers.host || '');
		this.url = decodeURI(<string>(req.url)||'');
	}

	/**
	 * authentication by default all, subclasses override
	 * @param {Function} cb
	 * @param {Object}   info
	 */
	requestAuth(info: RuleResult): Promise<boolean> | boolean {
		return true;
	}

	/**
	 * call function virtual function
	 * @param {Object} info service info
	 */
	action(info: RuleResult) {
	}

	// @end
}

Service.type = 'service';

export default {

	Service: Service,
	
	/**
	 * 获取所有的服务名称列表
	 */
	get services() { return Object.keys(_service_cls) },
	
	/**
	 * 通过名称获取服务class
	 */
	get(name: string): typeof Service {
		return _service_cls[name];
	},

	/**
	 * @func getServiceDescriptors()
	 */
	getServiceDescriptors() {
		var r: Dict = {};
		Object.entries(_service_cls).forEach(([key, service])=>{
			if (!/^(StaticService|fmt)$/.test(key) && key[0] != '_') {

				var type = 0;
				var methods: string[] = [], events: string[] = [];
				var item = { type: service.type, methods, events };
				var self = <any>service.prototype;

				Object.entries(Object.getOwnPropertyDescriptors(self)).forEach(([k, v])=>{
					if (!/(^(constructor|auth|requestAuth)$)|(^(_|\$|m_))/i.test(k)) {
						if (/^on[a-zA-Z]/.test(k)) { // event
							events.push(k.substr(2));
						} else { // methods
							if (typeof v.value == 'function') {
								methods.push(k);
							}
						}
					}
				});

				self = self.__proto__;

				while (self !== Service.prototype) {
					Object.entries(Object.getOwnPropertyDescriptors(self)).forEach(([k, v])=>{
						if (/^on[a-zA-Z]/.test(k)) { // event
							events.push(k.substr(2));
						}
					});
					self = self.__proto__;
				}
				
				r[key] = item;
			}
		});
		return r;
	},

	set(name: string, cls: any) {
		util.assert(util.equalsClass(Service, cls), `"${name}" is not a "Service" type`);
		util.assert(!(name in _service_cls), `service repeat definition, "${name}"`);
		cls.prototype.name = name;
		_service_cls[name] = cls;
	},

	del(name: string) {
		delete _service_cls[ name ];
	},
};
