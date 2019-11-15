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

const util = require('../../util');
const errno = require('../../errno');
const { Notification } = require('../../event');
const { T_CALLBACK,T_CALL} = require('../data');
const conv = require('./conv');

const METHOD_CALL_TIMEOUT = 12e4; // 120s
const print_log = false; // util.dev

/**
 * @class WSClient
 */
class WSClient extends Notification {
	// @private:
	// m_calls: null,
	// m_service_name: '',
	// m_conv: null,   // conversation

	// @public:
	get name() { return this.m_service_name }
	get conv() { return this.m_conv }
	get loaded() { return this.m_loaded }

	/**
	 * @constructor constructor(service_name, conv)
	 */
	constructor(service_name, conv) {
		super();

		this.m_calls = {};
		this.m_service_name = service_name;
		this.m_conv = conv || new WSConversation();
		this.m_loaded = false;
		this.m_sends = [];

		util.assert(service_name);
		util.assert(this.m_conv);

		this.m_conv.onOpen.on(e=>{
			this.m_Intervalid = setInterval(e=>this._checkTimeout(), 3e4); // 30s
		});

		this.m_conv.onClose.on(async e=>{
			this.m_loaded = false;
			var err = Error.new(errno.ERR_CONNECTION_DISCONNECTION);
			for (var handle of Object.values(this.m_calls)) {
				handle.cancel = true;
				handle.err(err);
			}
			clearInterval(this.m_Intervalid);
			this.m_sends = []; // clear calling
		});

		this.addEventListener('Load', async e=>{
			console.log('CLI Load', conv.url.href);
			this.m_conv.m_token = e.data.token; // TODO private visit
			this.m_loaded = true;
			var sends = this.m_sends;
			this.m_sends = [];
			// await util.sleep(1000); // 
			for (var data of sends) {
				if (!data.cancel) {
					// console.log('CLI Load send');
					this._send(data).catch(data.err);
				}
			}
		});

		this.m_conv.bind(this);
	}

	/**
	 * @func receiveMessage(msg)
	 */
	async receiveMessage(msg) {
		var self = this;
		var { data = {}, name, cb } = msg;

		if (msg.isCallback()) {
			var handle = this.m_calls[cb];
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
				if (print_log) 
					console.log('WSClient.Call', `${self.name}.${name}(${JSON.stringify(data, null, 2)})`);
				try {
					r.data = await self.handleCall(name, data);
				} catch(e) {
					r.error = e;
				}
			} else if (msg.isEvent()) {
				// console.log('CLI Event receive', name);
				try {
					this.trigger(name, data);
				} catch(err) {
					console.error(err);
				}
			} else {
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
	 * @class handleCall
	 */
	handleCall(method, data) {
		if (method in WSClient.prototype)
			throw Error.new(errno.ERR_FORBIDDEN_ACCESS);
		var fn = this[method];
		if (typeof fn != 'function')
			throw Error.new('"{0}" no defined function'.format(name));
		return fn.call(this, data);
	}

	async _send(data) {
		if (this.m_loaded) {
			await this.m_conv.sendFormattedData(data);
			delete data.data;
		} else {
			this.m_sends.push(data);
		}
		return data;
	}

	_checkTimeout() {
		var now = Date.now();
		var calls = this.m_calls;
		for (var id in calls) {
			var handle = calls[id];
			if (handle.timeout) {
				if (handle.timeout < now) { // timeouted
					handle.err(Error.new([...errno.ERR_METHOD_CALL_TIMEOUT,
						`Method call timeout, ${this.name}/${handle.name}`]));
					handle.cancel = true;
				}
			}
		}
	}

	_call(type, name, data, timeout = exports.METHOD_CALL_TIMEOUT) {
		return util.promise(async (resolve, reject)=>{
			var id = util.id;
			var calls = this.m_calls;
			calls[id] = await this._send({
				timeout: timeout ? timeout + Date.now(): 0,
				ok: e=>(delete calls[id],resolve(e)),
				err: e=>(delete calls[id],reject(e)),
				service: this.m_conv._service(this.name),
				type: type,
				name: name,
				data: data,
				cb: id,
			});
		});
	}

	/**
	 * @func call(method, data, timeout)
	 * @async
	 */
	call(method, data, timeout = exports.METHOD_CALL_TIMEOUT) {
		return this._call(T_CALL, method, data, timeout);
	}

}

module.exports = exports = Object.assign({
	METHOD_CALL_TIMEOUT,
	WSClient,
}, conv);