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

var Service = require('../service').Service;
var Session = require('../session').Session;
var errno = require('../errno');
var {DataFormater,T_CALLBACK,T_CALL,T_EVENT} = require('./data');

var METHOD_CALL_TIMEOUT = 12e4; // 120s

/** 
 * @func callFunction()
*/
async function callFunction(self, msg) {
	var { data = {}, name, cb } = msg;
	if (self.server.printLog) {
		console.log('Call', `${self.name}.${name}(${JSON.stringify(data, null, 2)})`);
	}
	var err, r;
	try {
		r = await self.handleCall(name, data);
	} catch(e) { err = e }

	if (!cb) { // No callback
		if (err)
			console.warn(err);
		return;
	}
	var rev = new DataFormater({ service: self.m_conv._service(self.name), type: T_CALLBACK, cb });
	if (self.m_conv.isOpen) {  // 如果连接断开,将这个数据丢弃
		if (err) {
			rev.error = err; // Error.toJSON(err);
		} else {
			rev.data = r;
		}
		self.m_conv.send(rev.toBuffer());
	} else {
		console.error('connection dropped, cannot callback');
	}
}

/**
 * @class WSService
 */
class WSService extends Service {
	// m_conv: null,
	// m_session: null,
	// m_callbacks: null,
	
	get conv() {
		return this.m_conv;
	}

	get session() {
		return this.m_session;
	}

	/**
	 * @arg conv {Conversation}
	 * @constructor
	 */
	constructor(conv) {
		super(conv.request);
		this.m_callbacks = {};
		this.m_conv = conv;
		this.m_conv.onClose.on(async e=>{
			var callbacks = this.m_callbacks;
			this.m_callbacks = {};
			var err = Error.new(errno.ERR_CONNECTION_DISCONNECTION);
			for (var cb in Object.values(callbacks)) {
				// cb.cancel = true;
				cb.err(err);
			}
		});
		this.m_session = new Session(this);
	}

	loaded() {}
	destroy() {}

	/**
	 * @fun receiveMessage # 消息处理器
	 * @arg data {Object}
	 */
	receiveMessage(msg) {
		if (msg.isCall()) {
			callFunction(this, msg);
		} else if (msg.isCallback()) {
			var cb = this.m_callbacks[msg.cb];
			delete this.m_callbacks[msg.cb];
			if (cb) {
				if (msg.error) { // throw error
					cb.err(Error.new(msg.error));
				} else {
					cb.ok(msg.data);
				}
			} else {
				console.error('Unable to callback, no callback context can be found');
			}
		}
	}

	/**
	 * @class handleCall
	 */
	handleCall(method, data) {
		if (method in WSService.prototype) {
			throw Error.new(errno.ERR_FORBIDDEN_ACCESS);
		}	
		var fn = this[method];
		if (typeof fn != 'function') {
			throw Error.new('"{0}" no defined function'.format(name));
		}
		return fn.call(this, data);
	}

	/**
	 * @func call(method, data)
	 */
	call(method, data, timeout = exports.METHOD_CALL_TIMEOUT) {
		return new Promise((resolve, reject)=>{
			var cb = util.id;
			var timeid, msg = new DataFormater({
				service: this.m_conv._service(this.name),
				type: T_CALL,
				name: method,
				data: data,
				cb: cb,
				ok: (e)=>{
					if (timeid)
						clearTimeout(timeid);
					resolve(e);
				},
				err: (e)=>{
					if (timeid)
						clearTimeout(timeid);
					reject(e);
				},
			});
			if (timeout) {
				timeid = setTimeout(e=>{
					// console.error(`method call timeout, ${this.name}/${method}`);
					reject(Error.new([...errno.ERR_METHOD_CALL_TIMEOUT,
						`method call timeout, ${this.name}/${method}`]));
					msg.cancel = true;
					delete this.m_callbacks[cb];
				}, timeout);
			}
			try {
				this.m_conv.send(msg.toBuffer());
				this.m_callbacks[cb] = msg;
			} catch(err) {
				msg.err(err);
			}
		});
	}

	/**
	 * @func weakCall(method, data) no callback, no return data
	 */
	weakCall(method, data) {
		if (this.m_conv.isOpen) {  // 如果连接断开,将这个数据丢弃
			this.m_conv.send(new DataFormater({
				service: this.m_conv._service(this.name),
				type: T_CALL, 
				name: method, 
				data: data,
			}).toBuffer());
		} else {
			console.error('connection dropped, cannot call method');
		}
	}

	/**
	 * @func trigger(event, data)
	 */
	trigger(event, data) {
		if (this.m_conv.isOpen) {  // 如果连接断开,将这个数据丢弃
			this.m_conv.send(new DataFormater({
				service: this.m_conv._service(this.name), type: T_EVENT, name: event, data: data,
			}).toBuffer());
		} else {
			console.error('connection dropped, cannot send event');
		}
	}

	// @end
}

WSService.type = 'event';

module.exports = {
	WSService,
	METHOD_CALL_TIMEOUT,
};
