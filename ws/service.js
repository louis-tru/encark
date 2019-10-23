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

var METHOD_CALL_TIMEOUT = 12e4; // 120s

async function func_call(self, msg) {
	var { d: data = {}, n: name, cb } = msg;
	var fn = self[name];
	var hasCallback = false;
	var rev = { t: 'cb', cb, s: self.name };

	if (self.server.printLog) {
		console.log('Call', `${self.name}.${name}(${JSON.stringify(data, null, 2)})`);
	}

	var callback = function(err, data) {
		if (hasCallback) {
			throw new Error('callback has been completed');
		}
		hasCallback = true;

		if (!cb) return; // No callback

		if (self.conv.isOpen) {  // 如果连接断开,将这个数据丢弃
			if (err) {
				rev.e = Error.toJSON(err);
			} else {
				rev.d = data;
			}
			self.conv.send(rev);
		} else {
			console.error('connection dropped, cannot callback');
		}
	};

	if (name in WSService.prototype) {
		return callback(Error.new(errno.ERR_FORBIDDEN_ACCESS));
	}
	if (typeof fn != 'function') {
		return callback(Error.new('"{0}" no defined function'.format(name)));
	}

	var err, r;
	try {
		r = await self[name](data);
	} catch(e) {
		err = e;
	}
	callback(err, r);
}

/**
 * @class WSService
 */
class WSService extends Service {
	
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
		this.m_conv = conv;
		this.m_session = new Session(this);
	}

	loaded() {}
	destroy() {}

	/**
	 * @fun receiveMessage # 消息处理器
	 * @arg data {Object}
	 */
	receiveMessage(data) {
		if (data.t == 'call') {
			func_call(this, data);
		} else if (data.t == 'cb') {
			// TODO ...
		}
	}

	/**
	 * @func call(method, data)
	 */
	call(method, data, timeout = exports.METHOD_CALL_TIMEOU) {
		// TODO ... cli call
	}

	/**
	 * @func weakCall(method, data) no callback, no return data
	 */
	weakCall(method, data) {
		// TODO ... weak cli call
	}

	/**
	 * @func trigger(event, data)
	 */
	trigger(event, data) {
		if (this.m_conv.isOpen) {  // 如果连接断开,将这个数据丢弃
			this.m_conv.send({
				s: this.name, t: 'event', n: event, d: data,
			});
		} else {
			console.error('connection dropped, cannot send event');
		}
	}

	// @end
}

WSService.type = 'event';

exports.WSService = WSService;
exports.METHOD_CALL_TIMEOUT = METHOD_CALL_TIMEOUT;
