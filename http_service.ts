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

import {Cookie} from './cookie';
import service from './service';
import {StaticService} from './static_service';
import {Session} from './session';
import * as http from 'http';
import * as zlib from 'zlib';
import {IncomingForm} from './incoming_form';
import {RuleResult} from './router';
import errno from './errno';

var StaticService_action = StaticService.prototype.action;

/**
 * @private
 */
function returnJSON(self: HttpService, data: any) {
	var type = self.server.getMime(self.jsonpCallback ? 'js' : 'json');
	try {
		var rev = JSON.stringify(data);
	} catch(err) {
		self.returnError(err);
		return;
	}
	if (self.jsonpCallback) {
		data = self.jsonpCallback + '(' + rev + ')';
	}
	return self.returnString(rev, type);
}

/** 
 * @class HttpService
 * @bases staticService::StaticService
 */
export class HttpService extends StaticService {

	private m_cookie: Cookie | undefined;
	private m_session: Session | undefined;

	/**
	 * @func markReturnInvalid() mark action return invalid
	 */
	markReturnInvalid() {
		this.markCompleteResponse();
	}

	/**
	 * site cookie
	 * @type {Cookie}
	 */
	get cookie(): Cookie {
		if (!this.m_cookie)
			this.m_cookie = new Cookie(this.request, this.response);
		return this.m_cookie;
	}

	get session(): Session {
		if (!this.m_session)
			this.m_session = new Session(this);
		return this.m_session;
	}

	/**
	 * ajax jsonp callback name
	 * @tpye {String}
	 */
	readonly jsonpCallback: string;

	/**
	 * post form
	 * @type {IncomingForm}
	 */
	form: IncomingForm | null = null;

	/**
	 * post form data
	 * @type {Object}
	 */
	readonly data: Dict;

	/**
	 * @constructor
	 * @arg req {http.IncomingMessage}
	 * @arg res {http.ServerResponse}
	 */
	constructor(req: http.IncomingMessage, res: http.ServerResponse) {
		super(req, res);
		this.jsonpCallback = this.params.callback || '';
		this.data = {};
	}
	
	/** 
	 * @overwrite
	 */
	async action(info: RuleResult) {

		var self = this;
		var action = info.action;

		if (self.request.method == 'OPTIONS') {
			if (self.server.allowOrigin == '*') {
				var access_headers = '';
				//'Content-Type,Access-Control-Allow-Headers,Authorization,X-Requested-With';
				var access_headers_req = self.request.headers['access-control-request-headers'];
				if (access_headers_req) {
					access_headers += access_headers_req;
				}
				self.response.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
				self.response.setHeader('Access-Control-Allow-Headers', access_headers);
			}
			self.setDefaultHeader();
			self.response.writeHead(200);
			self.response.end();
			return;
		}

		/*
		 * Note:
		 * The network fault tolerance,
		 * the browser will cause strange the second request,
		 * this error only occurs on the server restart,
		 * the BUG caused by the request can not respond to
		 */

		//Filter private function
		if (/^_/.test(action)){
			return StaticService_action.call(this, info);
		}
		
		var fn = (<any>this)[action];

		if (action in HttpService.prototype) {
			return self.returnError(Error.new(errno.ERR_FORBIDDEN_ACCESS));
		}
		if (!fn || typeof fn != 'function') {
			return StaticService_action.call(this, info);
		}
		
		var ok = async function() {
			var auth: boolean = false;
			try {
				auth = await self.auth(info);
			} catch(e) {
				console.error(e);
			}

			if (!auth) {
				self.returnError(Error.new(errno.ERR_ILLEGAL_ACCESS));
				return;
			}

			var { service, action, ..._info } = info;
			var data = Object.assign({}, self.params, self.data, _info);
			var err, r;
			try {
				r = await (self as any)[action](data);
			} catch(e) {
				err = e;
			}
			if (!self.isCompleteResponse || err) {
				if (err) {
					if (self.server.printLog) {
						console.error(err);
					}
					if (self.isCompleteResponse) {
						console.error('Unexpected exception??', err);
						(self as any).m_markCompleteResponse = false;
					}
					self.returnError(err);
				} else {
					self.returnJSON(r);
				}
			}
		};

		if (this.request.method == 'POST') {
			var form = this.form = new IncomingForm(this);
			try {
				var accept = this.hasAcceptFilestream(info);
				if (accept instanceof Promise) {
					this.request.pause();
					form.isUpload = await accept;
					this.request.resume();
				} else {
					form.isUpload = accept;
				}
			} catch(err) {
				// this._service.request.socket.destroy();
				return self.returnError(err);
			}
			form.onEnd.on(function() {
				Object.assign(self.data, form.fields);
				Object.assign(self.data, form.files);
				ok();
			});
			form.parse();
		} else {
			this.request.on('end', ok);
		}
	}

	/**
	 * @func hasAcceptFilestream(info) 是否接收文件流
	 */
	hasAcceptFilestream(info: RuleResult): Promise<boolean> | boolean {
		return false;
	}

	/**
	 * @func auth(info)
	 */
	auth(info: RuleResult): Promise<boolean> | boolean {
		return true;
	}

	/**
	 * @fun returnData() return data to browser
	 * @arg type {String} #    MIME type
	 * @arg data {Object} #    data
	 */
	returnData(type: string, data: any): void {

		var res = this.response;
		var ae = <string>this.request.headers['accept-encoding'];
		this.markCompleteResponse();

		this.setDefaultHeader();
		res.setHeader('Content-Type', type);

		if (typeof data == 'string' && 
				this.server.agzip && ae && ae.match(/gzip/i)) {
			zlib.gzip(data, function (err, data) {
				res.setHeader('Content-Encoding', 'gzip');
				res.writeHead(200);
				res.end(data);
			});
		} else {
			res.writeHead(200);
			res.end(data);
		}
	}

	/**
	 * @fun returnString # return string to browser
	 * @arg type {String} #    MIME type
	 * @arg str {String}
	 */
	returnString(str: string, type: string = 'text/plain'): void {
		return this.returnData(type + ';charset=utf-8', str);
	}

	/**
	 * @fun returnHtml # return html to browser
	 * @arg html {String}  
	 */
	returnHtml(html: string): void {
		var type = this.server.getMime('html');
		return this.returnString(html, type);
	}

	/**
	 * @fun rev # return data to browser
	 * @arg data {JSON}
	 */
	returnJSON(data: any): void {
		this.setNoCache();
		return returnJSON(this, { data: data, errno: 0, code: 0, st: new Date().valueOf() });
	}

	/**
	 * @fun returnError() return error to browser
	 * @arg [err] {Error} 
	 */
	returnError(err: any) {
		this.setNoCache();
		var accept = this.request.headers.accept || '';
		if (/text\/html|application\/xhtml/.test(accept)) {
			return this.returnHtmlError(err);
		} else {
			return this.returnJSONError(err);
		}
	}

	/**
	 * @func returnJSONError(err)
	 */
	returnJSONError(err: any) {
		err = Error.toJSON(err);
		err.st = new Date().valueOf();
		if ( !err.errno ) {
			err.errno = -1;
		}
		err.st = new Date().valueOf();
		return returnJSON(this, err);
	}

	/**
	 * @func returnHtmlError()
	 */
	returnHtmlError(err: any) {
		err = Error.toJSON(err);
		var msg = [];
		if (err.message) msg.push(err.message);
		if (err.errno) msg.push('Errno: ' + err.errno);
		if (err.exception) msg.push('Exception: ' + err.exception);
		if (err.path) msg.push('Path: ' + err.path);
		if (err.stack) msg.push(err.stack);
		var text = '<h4><pre style="color:#f00">' + msg.join('\n') + '</pre></h4>';
		if (err.description) {
			text += '<br/><h4>Description:</h4><br/>';
			text += err.description;
		}
		return this.returnErrorStatus(500, text);
	}

	// @end
}

/** 
 * @class HttpService
 */
export class Descriptors extends HttpService {
	descriptors() {
		return service.getServiceDescriptors();
	}
}

service.set('descriptors', Descriptors);