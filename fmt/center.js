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
var uuid = require('../hash/uuid');
var _fmtc = require('./_fmtc');
var service = require('../service');
var wsservice = require('../ws/service');
var cli = require('../ws/cli');
var ser = require('./ser');

// Fast Message Transfer Center, 快速消息传输中心

/**
 * @class FastMessageTransferCenter
 */
class FastMessageTransferCenter extends event.Notification {

	get id() {
		return this.m_inl.id;
	}

	constructor(server, nodes = [/* 'fmtc://127.0.0.1:9081/' */]) {
		super();
		this.m_inl = new FastMessageTransferCenter_INL(this, server, nodes);
	}

	client(id) {
		return this.m_inl.client(id);
	}

	group(gid) {
		return this.m_inl.group(gid);
	}

	trigger(event, data) {
		return this.publish(event, data);
	}

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

	constructor(host, server, nodes) {
		_fmtc._register(server, this);
		this.m_host = host;
		this.m_center_id = uuid(); // center server global id
		this.m_node_server = {}; // node server
		this.m_cur_cli_service = {}; // client handle
		this.m_cli_route_cache = { // route cache
			// "0_a": {server:{ip:'127.0.0.1',port:8091,id:'a'}},
			// "1_b": {server:{ip:'127.0.0.1'port:8091,id:'b'}},
			// "2_c": {server:{ip:'186.32.6.52',port:8093,id:'c'}},
		};

		this.addEventListener('Open', e=>{
			var {center,id} = e.data;
			// TODO ...
		});

		this.addEventListener('Close', e=>{
			var {center,id} = e.data;
			// TODO ...
		});

		for (var n of nodes) {
			// TODO ...
		}
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
	}

	async registerService(fmtservice) {
		utils.assert(fmtservice.id);
		utils.assert(!this.m_cur_cli_service.has(fmtservice.id));
		utils.assert(!await this.client(fmtservice.id));
		this.m_cur_cli_service.set(fmtservice.id, fmtservice);
		this.publish('Open', { center: this.id, id: fmtservice.id });
	}

	async unregisterService(fmtservice) {
		utils.assert(fmtservice.id);
		utils.assert(this.m_cur_cli_service.has(fmtservice.id));
		this.m_cur_cli_service.delete(fmtservice.id);
		this.publish('Close', { center: this.id, id: fmtservice.id });
	}

	async addNode(node) {
		// TODO ...
	}

	async deleteNode(node) {
		// TODO ...
	}

}

/**
 * @class FMTCenterAPI
 */
class FMTCenterNode {
	// TODO ...
	initialize() {
		//
	}
	get center() {
		return this.m_center;
	}
}

/**
 * @class FMTCenterService
 */
class FMTCenterService extends wsservice.WSService {

	async loaded() {
		var center = _fmtc._fmtc(this.conv.server);
		if (center) {
			await center.addNode(this);
			this.m_center = center;
		} else {
			console.error('FMTCenterService.loaded()', 'FMTC No found');
			this.conv.close();
		}
	}

	async destroy() {
		var center = _fmtc._fmtc(this.conv.server);
		if (center) {
			await center.deleteNode(this);
			this.m_center = null;
		} else {
			console.error('FMTCenterService.destroy()', 'FMTC No found');
		}
	}

}

/**
 * @class FMTCenterClient
 */
class FMTCenterClient extends cli.WSClient {
	constructor(center, node) {
		super('_fmtcs', 'ws://127.0.0.1:8091');
	}
}

utils.extendClass(FMTCenterService, FMTCenterAPI);
utils.extendClass(FMTCenterClient, FMTCenterAPI);
service.set('_fmtcs', FMTCenterService);

module.exports = {
	FastMessageTransferCenter,
	fmtc: _fmtc.get,
};