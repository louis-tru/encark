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

var utils = require('../util');
var uuid = require('../hash/uuid');
var fmtc = require('./_fmtc');
var service = require('../service');
var wsservice = require('../ws/service');
var errno = require('../errno');

/**
 * @class FMTService
 */
class FMTService extends wsservice.WSService {

	/**
	 * @get id client
	 */
	get id() {
		return this.m_id;
	}

	get uuid() {
		return this.m_uuid;
	}

	get time() {
		return this.m_time;
	}

	constructor(conv) {
		super(conv);
		this.m_center = null;
		this.m_id = String(this.params.id);
		this.m_subscribe = new Set();
		this.m_uuid = uuid();
	}

	requestAuth() {
		var center = fmtc._fmtc(this.conv.server);
		utils.assert(center, 'FMTService.requestAuth() fmt center No found');
		return center.host.clientAuth(this);
	}

	/**
	 * @overwrite
	 */
	async load() {
		var center = fmtc._fmtc(this.conv.server);
		utils.assert(center, 'FMTService.load() FMTC No found');
		await utils.sleep(utils.random(0, 200));
		this.m_time = new Date();
		try {
			await center.loginFrom(this);
		} catch(err) {
			if (err.code == errno.ERR_REPEAT_LOGIN_FMTC[0]) {
				await utils.sleep(2000);
				await this._repeatLoginError();
			}
			throw err;
		}
		this.m_center = center;
	}

	/**
	 * @overwrite
	 */
	async destroy() {
		await this.m_center.logoutFrom(this);
		this.m_center = null;
	}

	/**
	 * @overwrite
	 */
	trigger(event, data) {
		if (this.hasSubscribe({event})) {
			super.trigger(event, data);
		}
	}

	_repeatLoginError() {
		return Promise.all([super.trigger('RepeatLoginError'), utils.sleep(200)]);
	}

	/**
	 * @func repeatLoginError() close conv
	 */
	repeatLoginError() {
		this._repeatLoginError()
			.then(e=>this.conv.close())
			.catch(e=>this.conv.close());
	}

	// ------------ api ------------

	subscribeAll() {
		this.m_subscribe.add('*');
	}

	subscribe({ events }) {
		for (var event of events)
			this.m_subscribe.add(event);
	}

	unsubscribe({ events }) {
		for (var event of events)
			this.m_subscribe.delete(event);
	}

	hasSubscribe({ event }) {
		return this.m_subscribe.has('*') || this.m_subscribe.has(event);
	}

	hasOnline({ id }) {
		return this.m_center.hasOnline(id);
	}

	/**
	 * @func triggerTo() event message
	 */
	async triggerTo([id, event, data]) {
		return this.m_center.exec(id, [event, data], 'triggerTo');
	}

	// /**
	//  * @func publishTo() publish multicast,broadcast event message
	//  */
	// publishTo({ event, data, gid = '0' }) {
	// }

	/**
	 * @func callTo()
	 */
	callTo([id, method, data, timeout]) { //
		return this.m_center.exec(id, [method, data, timeout], 'callTo');
	}

}

/**
 * @class FMTServerClient
 */
class FMTServerClient {

	get id() {
		return this.m_id;
	}

	constructor(center, id) {
		this.m_id = id;
		this.m_center = center;
	}

	trigger(event, data) {
		return this.m_center.exec(this.m_id, [event, data], 'triggerTo');
	}

	call(method, data, timeout = wsservice.METHOD_CALL_TIMEOUT) {
		return this.m_center.exec(this.m_id, [method, data, timeout], 'callTo');
	}

}

service.set('_fmt', FMTService);

module.exports = {
	FMTServerClient,
};