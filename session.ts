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

import util from'./util';
import {Cookie} from './cookie';
// var http_service = require('./http_service');

var SESSIONS: AnyObject = {};
var SESSION_TOKEN_NAME = '__SESSION_TOKEN';

function deleteSession(token: number) {
	var data = SESSIONS[token];
	if (data) {
		if (data.ws > 0) {
			data.timeoutid = deleteSession.setTimeout(data.expired, token)
		} else {
			delete SESSIONS[token];
		}
	}
}

function getData(self: Session) {
	var token = self.token;

	if (!token) {
		token = util.id;
		var service = (<any>self).m_service;
		if (service instanceof http_service.HttpService)  // http service
			service.cookie.set(SESSION_TOKEN_NAME, token);
		else  //ws service
			throw new Error('Can not set the session, session must first be activated in HttpService');
		(<any>self).token = token;
	}
	
	var expired = (<any>self).m_service.server.session * 6e4;
	var value = SESSIONS[token];

	if (!value) {
		SESSIONS[token] = value = {
			timeoutid: deleteSession.setTimeout(expired, token),
			expired: expired,
			data: {},
			ws: 0,
		};
	}

	return value;
}

/**
 * @class Session
 */
export class Session {

	//private:
	private m_service: any | undefined

	/**
	 * Conversation token
	 * @type {Number}
	 */
	readonly token = 0

	/**
	 * constructor
	 * @param {Service} service HttpService or SocketService
	 * @constructor
	 */
	constructor(service: any) {
		this.m_service = service;
		
		var is_http = service instanceof http_service.HttpService;
		var cookie = is_http ? service.cookie : new Cookie(service.request);
		var token = cookie.get(SESSION_TOKEN_NAME);
		
		if (!token)
			return;
		
		this.token = token;

		var data = SESSIONS[token];
		if (data) {
			clearTimeout(data.timeoutid);
			data.timeoutid = deleteSession.setTimeout(service.server.session * 6e4, token);
		}
		
		if (is_http)  // socket service
			return;

		var conv = service.conv;

		conv.onOpen.on(()=>{
			var data = getData(this);
			data.ws++;
			conv.onClose.on(()=>data.ws--);
		});
	}

	/**
	 * get session value by name
	 * @param  {String} name session name
	 * @return {String}
	 */
	get(name: string) {
		var value = SESSIONS[this.token];
		if (value && name in value.data) {
			return value.data[name];
		}
		return null;
	}

	/**
	 * set session value
	 * @param {String} name
	 * @param {String} value
	 */
	set(name: string, value: string) {
		getData(this).data[name] = value;
	}

	/**
	 * delete session
	 * @param {String} name
	 */
	del(name: string) {
		var token = this.token;
		if (token) {
			var value = SESSIONS[token];
			if (value)
				delete value.data[name];
		}
	}

	/**
	 * get all session
	 * @return {Object}
	 */
	getAll() {
		return getData(this).data;
	}

	/**
	 * delete all session
	 */
	delAll() {
		var token = this.token;
		if (token) {
			var value = SESSIONS[token];
			if (value)
				value.data = {};
		}
	}

	// @end
}
