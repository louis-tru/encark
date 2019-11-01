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
var event = require('../event');
var service = require('../service');
var {Server} = require('../server');
var {FMTClient} = require('./cli');
var wsservice = require('../ws/service');
var uuid = require('../hash/uuid');

// Fast Message Transfer Center, 快速消息传输中心

var G_fmtcs = new Map();

/**
 * @class FastMessageTransferCenter
 */
class FastMessageTransferCenter extends event.Notification {

	get id() {
		return this.m_inl.id;
	}

	constructor(server, node = [/*'fmtc://localhost/'*/]) {
		super();
		this.m_inl = new FastMessageTransferCenter_INL(this, server, node);
	}

	client(id) {
		return this.m_inl.client(id);
	}

	group(gid) {
		return this.m_inl.group(gid);
	}

	trigger(event, data) {
		// TODO ...
		return super.trigger(event, data);
	}

	/**
	 * @func publish()
	 */
	publish(event, data) {
		return this.m_inl.publish(event, data);
	}

}

/**
 * @class FastMessageTransferCenter_INL
 */
class FastMessageTransferCenter_INL {

	get id() {
		return this.m_center_id;
	}

	get host() {
		return this.m_host;
	}

	constructor(host, server, node) {
		utils.assert(!G_fmtcs.has(server), 'Repeat FastMessageTransferCenter instance in Server');
		utils.assert(server instanceof Server, errno.ERR_PARAM_TYPE_MISMATCH);
		G_fmtcs.set(server, this);
		this.m_host = host;
		this.m_center_id = uuid(); // center server global id
		this.m_node_server = {}; // node server
		this.m_cur_cli_service = {}; // client handle
		this.m_cli_route_cache = { // route cache
			// "0_a": {server:{ip:'127.0.0.1',port:8091,id:'a'}},
			// "1_b": {server:{ip:'127.0.0.1'port:8091,id:'b'}},
			// "2_c": {server:{ip:'186.32.6.52',port:8093,id:'c'}},
		};

	}

	async client(id) {
		// TODO ...
	}
	
	async group(gid) {
		// TODO ...
	}

	async broadcast(event, data) {
		// TODO ...
	}

	publish(event, data) {
		// TODO ...
		this.m_host.trigger(event, data);
	}

	async addService(service) {
		utils.assert(!this.m_cur_cli_service.has(service.id));
		utils.assert(!await this.client(service.id));
		this.m_cur_cli_service.set(service.id, service);
		this.trigger('Open', service.id);
	}

	async deleteService(service) {
		utils.assert(this.m_cur_cli_service.has(service.id));
		this.m_cur_cli_service.delete(service.id);
		this.trigger('Close', service.id);
	}

}

/**
 * @class FMTCenterService
 */
class FMTCenterService extends wsservice.WSService {
	// TODO ...
}

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
		var center = G_fmtcs.get(conv.server);
		if (center) {
			await center.addService(this);
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
		var center = G_fmtcs.get(conv.server);
		if (center) {
			await center.deleteService(this)
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

service.set('fmt', FMTService);

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

module.exports = {
	FastMessageTransferCenter,
	FMTClient,
	fmtc(server) {
		var inl = G_fmtcs.get(server);
		return inl && inl.host;
	},
};
