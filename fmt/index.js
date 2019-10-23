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
var {FMTClient} = require('./cli');
var {WSService} = require('../ws/service');

// Fast Message Transfer Center, 快速消息传输中心

var G_fmtcs = new Map();

/**
 * @class FastMessageTransferCenter
 */
class FastMessageTransferCenter extends event.Notification {

	get clients() {
		return this.m_clis;
	}

	constructor() {
		super();
		this.m_clis = new Set();
	}

	_addClient(cli) {
		utils.assert(!this.m_clients.has(cli));
		this.m_clients.set(s, cli);
		this.trigger('Open', cli);
	}

	_deleteClient(cli) {
		utils.assert(this.m_clients.has(cli));
		this.m_clients.delete(cli);
		this.trigger('Close', cli);
	}

	/**
	 * @func publish()
	 */
	publish(event, data, id) {
		// TODO ...
	}

	/**
	 * @func broadcast()
	 */
	broadcast(event, data, gid = 0) {
		// TODO ...
	}

}

/**
 * @class FMTService
 */
class FMTService extends WSService {

	get id() {
		return this.m_id;
	}

	get client() {
		return this.m_client;
	}

	get center() {
		return this.m_center;
	}

	constructor(conv) {
		super(conv);
		this.m_center = null;
		this.m_id = this.params.id;
		this.m_cli = new FMTServerClient(this);
	}

	loaded() {
		var center = G_fmtcs.get(conv.server);
		if (center) {
			center._addService(this.m_cli);
			this.m_center = center;
		} else {
			console.error('FMTService.loaded()', 'FMTC No found');
			this.conv.close();
		}
	}

	destroy() {
		var center = G_fmtcs.get(conv.server);
		if (center) {
			center._deleteService(this.m_cli);
			this.m_center = null;
		} else {
			console.error('FMTService.destroy()', 'FMTC No found');
		}
	}

	/**
	 * @func publish()
	 */
	publish({ event, data, id }) {
		return this.m_center.publish(event, data, id);
	}

	/**
	 * @func broadcast()
	 */
	broadcast({ event, data, gid = 0 }) {
		return this.m_center.broadcast(event, data, gid);
	}

	subscribeAll() {
		// TODO ...
	}

	subscribe({ events }) {
		// TODO ...
	}

	callTo({ id, name, data }) {
		// TODO ...
	}

	weakCallTo({ id, name, data }) {
		// TODO ...
	}

}

/**
 * @class FMTServerClient
 */
class FMTServerClient {

	get id() {
		return this.m_service.id;
	}

	get center() {
		return this.m_service.center;
	}

	constructor(fmtservice) {
		this.m_service = fmtservice;
	}

}

// /**
//  * @class FMTServerGroup
//  */
// class FMTServerGroup {
// 	// TODO ...
// }

service.set('fmt', FMTService);

module.exports = {
	FastMessageTransferCenter,
	FMTClient,
	registerFMTC(server, fmtc) {
		utils.assert(fmtc instanceof FastMessageTransferCenter);
		G_fmtcs.set(server, fmtc);
	},
	fmtc(server) {
		return G_fmtcs.get(server);
	},
};
