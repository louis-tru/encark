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
import {Cookie} from './cookie';
import service from './service';
import {StaticService} from './static_service';
import {Session} from './session';
// var IncomingForm = require('./incoming_form').IncomingForm;
var zlib = require('zlib');
var Buffer = require('buffer').Buffer;
var errno = require('./errno');
var {parseJSON} = require('./request');

var StaticService_action = StaticService.prototype.action;

/**
 * @private
 */
function returnJSON(self: HttpService, data) {
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

async function action_multiple_calls(self, calls, index, cb) {
	var funcs = {};
	var result = {};
	var count = 0, done_count = 0;
	var done = 0;

	for ( var action in calls ) {
		count++;
		var func = self[action];
		if (action in HttpService.prototype) {
			return cb(Error.new(errno.ERR_FORBIDDEN_ACCESS).toJSON(), index);
		}
		if ( typeof func != 'function' ) {
			return cb(Error.new('could not find function ' + action).toJSON(), index);
		}
		funcs[action] = func;
	}

	function cb2(name, err, data) {
		if ( done ) { // Already end
			return;
		}
		done_count++;

		if ( err ) { //
			if (self.server.printLog) {
				console.error(err);
			}
			done = true;
			err = Error.toJSON(err);
			err.api = name;
			err.name = name;
			if ( !err.code ) err.code = -1;
			cb ( err, index );
			result[name] = err;
			return;
		} else {
			result[name] = data;
		}
		if ( done_count == count ) {
			done = true;
			cb( { data: result }, index ); // done
		}
	}

	for ( let name in calls ) {
		let fn = funcs[name];
		let data = calls[name];
		var r, e;
		try {
			r = await self[name](data);
		} catch(err) {
			e = err;
		}
		if (e) {
			cb2(name, e);
		} else {
			cb2(name, null, r);
		}
	}
}

function action_multiple(self, info) {

	var post_buffs = [];
	var post_total = 0;

	if ( self.request.method == 'POST' ) {
		self.request.on('data', function(buff) {
			post_buffs.push(buff);
			post_total += buff.length;
		});
	}

	self.request.on('end', async function() {
		var auth = false;
		try {
			auth = await self.auth(info);
		} catch(e) {
			console.error(e);
		}
		if (!auth) {
			self.returnJSONError(Error.new(errno.ERR_ILLEGAL_ACCESS)); return;
		}

		var data = null;
		if ( post_buffs.length ) {
			data = Buffer.concat(post_buffs, post_total).toString('utf-8');
		} else {
			data = self.params.data;
		}

		if ( data ) {
			try {
				data = parseJSON(data);
				if ( !Array.isArray(data) ) {
					self.returnJSONError(new Error('multiple call data error')); return;
				}
			} catch(err) {
				self.returnJSONError(err); return;
			}

			var count = data.length;
			var done_count = 0;
			var result = Array(count);

			for ( var i = 0; i < count; i++ ) {
				action_multiple_calls(self, data[i], i, function(data, i) {
					result[i] = data;
					done_count++;
					if ( done_count == count ) { //done
						self.returnJSON(result);
					}
				});
			}
		} else {
			self.returnJSONError(new Error('multiple call data error'));
		}
	});
}

/** 
 * @class HttpService
 * @bases staticService::StaticService
 */
export class HttpService extends StaticService {

	private m_cookie: Cookie | undefined;
	private m_session: Session | undefined;

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
	jsonpCallback: any = '';

	/**
	 * post form
	 * @type {IncomingForm}
	 */
	form: any = null;

	/**
	 * post form data
	 * @type {Object}
	 */
	data: any = null;

	/**
	 * @constructor
	 * @arg req {http.ServerRequest}
	 * @arg res {http.ServerResponse}
	 * @arg info {Object}
	 */
	constructor(req, res, info) {
		StaticService.call(this, req, res, info);
		this.cookie = new Cookie(req, res);
		this.session = new session.Session(this);
		this.jsonpCallback = this.params.callback || '';
		this.data = {};
	}
	
	/** 
	 * @overwrite
	 */
	async action(info) {

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

		if ( action == 'multiple' ) {
			return action_multiple(this, info);
		}

		//Filter private function
		if (/^_/.test(action)){
			return StaticService_action.call(this);
		}
		
		var fn = this[action];

		if (action in HttpService.prototype) {
			return self.returnError(Error.new(errno.ERR_FORBIDDEN_ACCESS));
		}
		if (!fn || typeof fn != 'function') {
			return StaticService_action.call(this);
		}
		
		var ok = async function() {
			try {
				var auth = await self.auth(info);
			} catch(e) {
				console.error(e);
			}
			if (!auth) {
				self.returnError(Error.new(errno.ERR_ILLEGAL_ACCESS));
				return;
			}

			var { service, action, ..._info } = info;
			var data = util.assign({}, self.params, self.data, _info);
			var err, r;
			try {
				r = await self[action](data);
			} catch(e) {
				err = e;
			}
			if (!self._response_ok) {
				if (err) {
					if (self.server.printLog) {
						console.error(err);
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
				if (util.isAsync(this.hasAcceptFilestream)) {
					this.request.pause();
					form.isUpload = await this.hasAcceptFilestream(info);
					this.request.resume();
				} else {
					form.isUpload = this.hasAcceptFilestream(info);
				}
			} catch(err) {
				// this._service.request.socket.destroy();
				return self.returnError(err);
			}
			form.onend.on(function() {
				util.assign(self.data, form.fields);
				util.assign(self.data, form.files);
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
	hasAcceptFilestream(info) {
		return false;
	}

	/**
	 * @func auth(info)
	 */
	auth(info) {
		return true;
	}
	
	/**
	 * @fun returnData() return data to browser
	 * @arg type {String} #    MIME type
	 * @arg data {Object} #    data
	 */
	returnData(type, data) {
		this.markResponse();

		var self = this;
		var res = this.response;
		var ae = this.request.headers['accept-encoding'];

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
	returnString(str, type = 'text/plain') {
		return this.returnData(type + ';charset=utf-8', str);
	}
	
	/**
	 * @fun returnHtml # return html to browser
	 * @arg html {String}  
	 */
	returnHtml(html) {
		var type = this.server.getMime('html');
		return this.returnString(html, type);
	}
	
	/**
	 * @fun rev # return data to browser
	 * @arg data {JSON}
	 */
	returnJSON(data) {
		this.setNoCache();
		return returnJSON(this, { data: data, code: 0, st: new Date().valueOf() });
	}

	/**
	 * @fun returnError() return error to browser
	 * @arg [err] {Error} 
	 */
	returnError(err) {
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
	returnJSONError(err) {
		err = Error.toJSON(err);
		err.st = new Date().valueOf();
		if ( !err.code ) {
			err.code = -1;
		}
		err.st = new Date().valueOf();
		return returnJSON(this, err);
	}

	/**
	 * @func returnHtmlError()
	 */
	returnHtmlError(err) {
		err = Error.toJSON(err);
		var msg = [];
		if (err.message) msg.push(err.message);
		if (err.code) msg.push('Code: ' + err.code);
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
var Descriptors = util.class('Descriptors', HttpService, {
	
	descriptors: async function() {
		var descs = service.getServiceDescriptors();
		return descs;
	}
});

service.set('descriptors', Descriptors);

exports.Descriptors = Descriptors;
exports.HttpService = HttpService;