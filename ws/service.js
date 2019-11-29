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

const util = require('../util');
const Service = require('../service').Service;
const Session = require('../session').Session;
const errno = require('../errno');
const {T_CALLBACK,T_CALL,T_EVENT} = require('./data');

const METHOD_CALL_TIMEOUT = 12e4; // 120s
const print_log = false; // util.dev

/**
 * @class WSService
 */
class WSService extends Service {
	// m_conv: null,
	// m_session: null,
	// m_calls: null,
	
	get conv() {
		return this.m_conv;
	}

	get session() {
		return this.m_session;
	}

	get loaded() {
		return this.m_loaded;
	}

	/**
	 * @arg conv {Conversation}
	 * @constructor
	 */
	constructor(conv) {
		super(conv.request);
		this.m_calls = new Map();
		this.m_conv = conv;
		this.m_loaded = false;
		this.m_Intervalid = setInterval(e=>this._checkTimeout(), 3e4); // 30s

		this.m_conv.onClose.on(async e=>{
			var err = Error.new(errno.ERR_CONNECTION_DISCONNECTION);
			for (var [,handle] of this.m_calls) {
				handle.cancel = true;
				handle.err(err);
			}
			clearInterval(this.m_Intervalid);
		});

		this.m_session = new Session(this);
	}

	load() {}
	destroy() {}

	_checkMethodName(method) {
		util.assert(/^[a-z]/i.test(method), errno.ERR_FORBIDDEN_ACCESS);
	}

	/**
	 * @fun receiveMessage() # 消息处理器
	 */
	async receiveMessage(msg) {
		if (!this.m_loaded) 
			console.warn('Unable to process message WSService.receiveMessage, loaded=false');

		var self = this;
		var { data = {}, name, cb, sender } = msg;

		if (msg.isCallback()) {
			var handle = this.m_calls.get(cb);
			if (handle) {
				if (msg.error) { // throw error
					handle.err(Error.new(msg.error));
				} else {
					handle.ok(data);
				}
			}
		} else {
			var r = {};
			if (msg.isCall()) {
				this._checkMethodName(name);
				if (print_log) 
					console.log('WSClient.Call', `${self.name}.${name}(${JSON.stringify(data, null, 2)})`);
				try {
					r.data = await self.handleCall(name, data, sender);
				} catch(e) {
					r.error = e;
				}
			} /*else if (msg.isEvent()) { // none event
				try {
					this.trigger(name, data);
				} catch(err) {
					console.error(err);
				}
			} */ else {
				return;
			}

			if (cb) {
				self.m_conv.sendFormattedData(Object.assign(r, {
					service: self.m_conv._service(self.name),
					type: T_CALLBACK, 
					cb: cb,
				})).catch(console.warn); // callback
			}
		}
	}

	/**
	 * @func handleCall
	 */
	handleCall(method, data, sender) {
		if (method in WSService.prototype)
			throw Error.new(errno.ERR_FORBIDDEN_ACCESS);
		var fn = this[method];
		if (typeof fn != 'function')
			throw Error.new('"{0}" no defined function'.format(method));
		return fn.call(this, data, sender);
	}

	async _send(data) {
		await this.m_conv.sendFormattedData(data);
		delete data.data;
		return data;
	}

	_checkTimeout() {
		var now = Date.now();
		for (var [,handle] of this.m_calls) {
			if (handle.timeout) {
				if (handle.timeout < now) { // timeouted
					handle.err(Error.new([...errno.ERR_METHOD_CALL_TIMEOUT,
						`Method call timeout, ${this.name}/${handle.name}`]));
					handle.cancel = true;
				}
			}
		}
	}

	_call(type, name, data, timeout, sender) {
		return util.promise(async (resolve, reject)=>{
			var id = util.id;
			var calls = this.m_calls;
			calls.set(id, await this._send({
				timeout: timeout ? timeout + Date.now(): 0,
				ok: e=>(calls.delete(id),resolve(e)),
				err: e=>(calls.delete(id),reject(e)),
				service: this.conv._service(this.name),
				type: type,
				name: name,
				data: data,
				cb: id,
				sender: sender,
			}));
			// console.log('SER send', name);
		});
	}

	_trigger(event, data, timeout = exports.METHOD_CALL_TIMEOUT, sender = null) {
		return this._call(T_EVENT, event, data, timeout || exports.METHOD_CALL_TIMEOUT, sender);
	}

	/**
	 * @func call(method, data)
	 * @async
	 */
	call(method, data, timeout = exports.METHOD_CALL_TIMEOUT, sender = null) {
		return this._call(T_CALL, method, data, timeout, sender);
	}

	/**
	 * @func  trigger(event, data)
	 * @async
	 */
	trigger(event, data, timeout = exports.METHOD_CALL_TIMEOUT, sender = null) {
		return this._trigger(event, data, timeout, sender);
	}

	// @end
}

WSService.type = 'event';

module.exports = exports = {
	WSService,
	METHOD_CALL_TIMEOUT,
};
