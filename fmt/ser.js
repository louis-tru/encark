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
var _fmtc = require('../_fmtc');
var service = require('../service');
var wsservice = require('../ws/service');

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

	constructor(conv) {
		super(conv);
		this.m_center = null;
		this.m_id = String(this.params.id);
		this.m_subscribe = new Set();
	}

	/**
	 * @overwrite
	 */
	async loaded() {
		var center = _fmtc._fmtc(this.conv.server);
		if (center) {
			await center.registerService(this);
			this.m_center = center;
		} else {
			console.error('FMTService.loaded()', 'FMTC No found');
			this.conv.close();
		}
	}

	/**
	 * @overwrite
	 */
	async destroy() {
		var center = _fmtc._fmtc(this.conv.server);
		if (center) {
			await center.unregisterService(this);
			this.m_center = null;
		} else {
			console.error('FMTService.destroy()', 'FMTC No found');
		}
	}

	/**
	 * @overwrite
	 */
	trigger(event, data) {
		if (this.hasSubscribe({event})) {
			super.trigger(event, data);
		}
	}

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

	// ------------

	/**
	 * @func send() event message
	 */
	send({ id, event, data }) {
		return this.m_center.client(id).then(e=>e.send(event, data));
	}

	/**
	 * @func publish() publish multicast,broadcast event message
	 */
	publish({ event, data, gid = '0' }) {
		return this.m_center.group(gid).then(e=>e.publish(event, data));
	}

	/**
	 * @func callTo()
	 */
	callTo({ id, name, data, timeout = wsservice.METHOD_CALL_TIMEOUT }) {
		return this.m_center.client(id).then(e=>e.call(name, data, timeout));
	}

	/**
	 * @func weakCallTo()
	 */
	weakCallTo({ id, name, data }) {
		return this.m_center.client(id).then(e=>e.weakCall(name, data));
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
		this.m_center = center;
		this.m_id = id;
	}

	send(event, data) {
		// TODO ...
	}

	call(method, data, timeout = wsservice.METHOD_CALL_TIMEOUT) {
		// TODO ...
	}

	weakCall(method, data) {
		// TODO ...
	}

}

/**
 * @class FMTServerGroup
 */
class FMTServerGroup {

	get gid() {
		return this.m_gid;
	}

	constructor(center, gid) {
		this.m_center = center;
		this.m_gid = gid;
	}

	publish(event, data) {
		// TODO ...
	}

}

service.set('_fmts', FMTService);

module.exports = {
	FMTServerClient,
	FMTServerGroup,
};
