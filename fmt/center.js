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
var path = require('../path');

// Fast Message Transfer Center, 快速消息传输中心

/**
 * @class FastMessageTransferCenter
 */
class FastMessageTransferCenter extends event.Notification {

	get id() {
		return this.m_inl.id;
	}

	get publishURL() {
		return this.m_inl.publishURL;
	}

	constructor(server, fnodes = [/* 'fnode://127.0.0.1:9081/' */], publish = null) {
		super();
		this.m_inl = new FastMessageTransferCenter_INL(this, server, fnodes, publish);
	}

	client(id) {
		return this.m_inl.client(id);
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
 * @private
 */
class FastMessageTransferCenter_INL {

	get id() {
		return this.m_fnode_id;
	}

	get host() {
		return this.m_host;
	}

	get publishURL() {
		return this.m_publish_url;
	}

	constructor(host, server, fnodes, publish) {
		_fmtc._register(server, this);
		this.m_host = host;
		this.m_server = server;
		this.m_fnode_id = uuid(); // center server global id
		this.m_publish_url = publish ? new path.URL(publish): null;
		this.m_fnodes = null;
		this.m_fnodes_cfg = {}; // node server cfg
		this.m_fmtservice = new Map(); // client service handle
		this.m_cli_route = new Map(); // client route
		//{
		// 0_a: 'fnodeId-abcdefg-1',
		// 1_b: 'fnodeId-abcdefg-2',
		// 2_c: 'fnodeId-abcdefg-3',
		//}

		this.m_host.addEventListener('AddNode', e=>{ // New Node connect
			// TODO ...
		});

		this.m_host.addEventListener('DeleteNode', e=>{ // Node Disconnect
			var {fnodeId} = e.data;
			for (var [id,fid] of this.m_cli_route) {
				if (fnodeId == fid) {
					this.m_cli_route.delete(id);
				}
			}
		});

		this.m_host.addEventListener('Login', e=>{ // client connect
			var {fnodeId,id} = e.data;
			this.m_cli_route.set(id, fnodeId);
		});

		this.m_host.addEventListener('Logout', e=>{ // client disconnect
			this.m_cli_route.delete(e.data.id);
		});

		for (var cfg of fnodes) {
			this.addFnodeCfg(cfg, true);
		}
	}

	addFnodeCfg(url, init = false) {
		if (!this.m_fnodes_cfg.hasOwnProperty(url)) {
			this.m_fnodes_cfg[url] = { url, init, retry: 0 };
		}
	}

	async run() {
		utils.assert(!this.m_fnodes);
		this.m_fnodes = {};

		// init local node
		await (new FNodeLocal(this)).initialize();
		// witch nodes
		while ( this.m_server && _fmtc._fmtc(this.m_server) === this ) {
			for (var cfg of Object.values(this.m_fnodes_cfg)) {
				if ( !this.getFnodeFrom(cfg.url) ) {
					cfg.retry++;
					console.log('FastMessageTransferCenter_INL.run(), connect', cfg.url);
					FNodeRemoteClient.connect(this, cfg.url).catch(err=>{
						if (err.code != errno[0]) {
							if (cfg.retry >= 10 && !cfg.init) { // retry 10 count
								delete this.m_fnodes_cfg[cfg.url];
							}
							console.error(err);
						}
					});
				}
			}
			await utils.sleep(1e4); // 10s
		}

		for (var fnode of Object.values(this.m_fnodes)) {
			try {
				await fnode.destroy();
			} catch(err) {
				console.error(err);
			}
		}
		this.m_fnodes = null;
	}

	client(id) {
		return new ser.FMTServerClient(this, id);
	}

	getFMTService(id) {
		var handle = this.m_fmtservice.get(id);
		utils.assert(handle, errno.ERR_FMT_CLIENT_OFFLINE);
		return handle;
	}

	getFMTServiceNoError(id) {
		return this.m_fmtservice.get(id);
	}

	async exec(id, args = [], method = null) {
		var fnodeId = this.m_cli_route.get(id);
		if (fnodeId) {
			var fnode = this.m_fnodes[fnodeId];
			utils.assert(fnode);
			try {
				if (method)
					return await fnode[method](id, ...args);
				else
					return utils.assert(await fnode.query(id), errno.ERR_FMT_CLIENT_OFFLINE);
			} catch(err) {
				if (err.code != errno.ERR_FMT_CLIENT_OFFLINE[0]) {
					throw err;
				}
			}
			this.m_cli_route.delete(id);
		}

		var fnode = await utils.promise((resolve, reject)=>{
			var i = 0;
			Object.values(this.m_fnodes).forEach((fnode,i,fnodes)=>{
				utils.assert(fnodes.length);
				fnode.query(id).then(e=>{
					i++;
					if (e) {
						resolve(fnode);
					} else if (fnodes.length == i) {
						reject(Error.new(errno.ERR_FMT_CLIENT_OFFLINE));
					}
				}).catch(e=>{
					console.error(err);
					i++;
					if (fnodes.length == i) {
						reject(Error.new(errno.ERR_FMT_CLIENT_OFFLINE));
					}
				});
			});
		});

		this.m_cli_route.set(id, fnode.id);

		if (!fnodeId) { // Trigger again
			this.m_host.getNoticer('Login').trigger({ fnodeId: fnode.id, id });
		}
		if (method)
			return await fnode[method](id, ...args);
	}

	async broadcast(event, data) {
		// TODO ...
	}

	publish(event, data) {
		for (var fnode of Object.values(this.m_fnodes)) {
			fnode.publish(event, data);
		}
	}

	/** 
	 * @func loginFrom() client login 
	 */
	async loginFrom(fmtservice) {
		utils.assert(fmtservice.id);
		utils.assert(!this.m_fmtservice.has(fmtservice.id));
		utils.assert(!await this.client(fmtservice.id));
		this.m_fmtservice.set(fmtservice.id, fmtservice);
		this.publish('Login', { fnodeId: this.id, id: fmtservice.id });
	}

	/**
	 * @func logoutFrom() client logout
	*/
	async logoutFrom(fmtservice) {
		utils.assert(fmtservice.id);
		utils.assert(this.m_fmtservice.has(fmtservice.id));
		this.m_fmtservice.delete(fmtservice.id);
		this.publish('Logout', { fnodeId: this.id, id: fmtservice.id });
	}

	/**
	 * @func getFnodeFrom()
	 */
	getFnodeFrom(url) {
		return Object.values(this.m_fnodes)
			.find(e=>e.publishURL&&e.publishURL.href==url);
	}

	/**
	 * @func getFnode() get fnode by id
	 */
	getFnode(id) {
		return this.m_fnodes[id];
	}

	/**
	 * @func addNode()
	 */
	async addNode(fnode) {
		// console.error(`Node with ID ${fnode.id} already exists`);
		utils.assert(!this.m_fnodes[fnode.id], errno.ERR_REPEAT_FNODE_CONNECT);
		this.m_fnodes[fnode.id] = fnode;
		var url = fnode.publishURL;
		if (url) {
			if (!this.publishURL || this.publishURL.href != url.href) {
				this.addFnodeCfg(url.href);
				var cfg = this.m_fnodes_cfg[url.href];
				if (cfg) {
					cfg.retry = 0;
				}
			}
		}
		this.m_host.getNoticer('AddNode').trigger({ fnodeId: fnode.id });
	}

	/**
	 * @func deleteNode()
	 */
	async deleteNode(fnode) {
		if (!this.m_fnodes[fnode.id])
			return;
		delete this.m_fnodes[fnode.id];
		this.m_host.getNoticer('DeleteNode').trigger({ fnodeId: fnode.id });
	}

}

/**
 * @class FNode
 */
class FNode {
	get id() {return null}
	get publishURL() {return null}
	get center() {return this.m_center}
	constructor(center) { this.m_center = center}
	initialize() { return this.m_center.addNode(this)}
	destroy() { return this.m_center.deleteNode(this)}
	publish(event, data) {}
	triggerTo(id, event, data) {}
	callTo(id, name, data, timeout) {}
	weakCallTo(id, name, data) {}
	query(id) {}
}

/**
 * @class FMTNodeLocal
 */
class FNodeLocal extends FNode {
	get id() {
		return this.m_center.id;
	}
	get publishURL() {
		return this.m_center.publishURL;
	}
	publish(event, data) {
		this.m_center.host.getNoticer(event).trigger(data);
	}
	triggerTo(id, event, data) {
		return this.m_center.getFMTService(id).trigger(event, data); // trigger event
	}
	callTo(id, method, data, timeout) {
		return this.m_center.getFMTService(id).call(method, data, timeout); // call method
	}
	weakCallTo(id, method, data) {
		return this.m_center.getFMTService(id).weakCall(method, data); // weak call method
	}
	async query(id) {
		return this.m_center.getFMTServiceNoError(id) ? 1: 0;
	}
}

/**
 * @class FNodeRemote
 */
class FNodeRemote extends FNode {
	get id() {
		return this.m_node_id;
	}
	get publishURL() {
		return this.m_impl.getThatFnode;
	}
	constructor(center, impl, id) {
		super(center);
		this.m_impl = impl;
		this.m_node_id = id;
		this.m_is_initialize = false;
	}
	async initialize() {
		utils.assert(!this.m_is_initialize);
		try {
			this.m_impl.conv.onClose.once(async e=>{
				if (this.m_is_initialize) {
					await this.m_center.deleteNode(this);
					var url = this.publishURL;
					if (url) { // recontect
						console.log('recontect', url.href);
						await utils.sleep(2e2); // 200ms
						if ( !this.m_center.getFnodeFrom(url.href) ) {
							FNodeRemoteClient.connect(this.m_center, url.href);
						}
					}
				}
			});
			console.log('FNodeRemote.initialize()', this.m_node_id);
			await this.m_center.addNode(this);
			console.log('FNodeRemote.initialize(), ok', this.m_node_id);
			this.m_is_initialize = true;
		} catch(err) {
			try {
				await this.destroy();
			} catch(e) {
				console.error(e);
			}
			throw err;
		}
	}
	async destroy() {
		this.m_impl.conv.close();
		await this.m_center.deleteNode(this);
	}
	publish(event, data) {
		this.m_impl.weakCall('publish', {event,data});
	}
	triggerTo(id, event, data) {
		return this.m_impl.call('triggerTo', {id, event, data}); // trigger event
	}
	callTo(id, method, data, timeout) {
		return this.m_impl.call('callTo', {id, method, data, timeout}, timeout); // call method
	}
	weakCallTo(id, method, data) {
		return this.m_impl.call('weakCallTo', {id, method, data}); // weak call method
	}
	query(id) {
		return this.m_impl.call('query', {id});
	}
}

class FNodeRemoteIMPL {

	getThatFnode() {
		return this.m_that_fnode;
	}

	getFnode() {
		return this.m_center.publishURL;
	}

	getNodeId() {
		return this.m_center.id;
	}

	publish({event, data}) {
		this.m_center.host.getNoticer(event).trigger(data);
	}

	triggerTo({id, event, data}) {
		this.m_center.getFMTService(id).trigger(event, data);
	}

	callTo({id, method, data, timeout}) {
		return this.m_center.getFMTService(id).call(method, data, timeout);
	}

	weakCallTo({id, method, data}) {
		this.m_center.getFMTService(id).weakCall(method, data);
	}

	query({id}) {
		return this.m_center.getFMTServiceNoError(id) ? 1: 0;
	}
}

/**
 * @class FNodeRemoteService
 */
class FNodeRemoteService extends wsservice.WSService {

	async loaded() {
		try {
			var center = _fmtc._fmtc(this.conv.server);
			utils.assert(center, 'FNodeRemoteService.loaded() fmt center No found');
			var id = this.params.id;
			utils.assert(id, 'FNodeRemoteService.loaded() node id param undefined');
			var fnode = await this.call('getFnode');
			this.m_that_fnode = fnode ? new path.URL(fnode): null;
			console.log('FNodeRemoteService.loaded', id, this.m_that_fnode&&this.m_that_fnode.href);
			this.m_fnode = new FNodeRemote(center, this, id);
			await this.m_fnode.initialize();
			this.m_center = center;
		} catch(err) {
			console.error(err);
			this.conv.close();
		}
	}

	async destroy() {
		try {
			var center = _fmtc._fmtc(this.conv.server);
			utils.assert(center, 'FNodeRemoteService.destroy() fmt center No found');
			utils.assert(center === this.m_center);
			console.log('FNodeRemoteService.destroy()', this.m_fnode.id);
			await this.m_fnode.destroy();
			this.m_fnode = null;
			this.m_center = null;
		} catch(err) {
			console.error(err);
		}
	}
}

/**
 * @class FNodeRemoteClient
 */
class FNodeRemoteClient extends cli.WSClient {

	constructor(center, url = 'fnode://localhost/') {
		url = new path.URL(fnode);
		url.setParam('id', center.id);
		var s = url.protocol == 'fnode:'? 'wss:': 'ws:';
				s += '//' + url.host + url.path;
		super('_fnode', new cli.WSConversation(s));
		this.m_center = center;
		this.m_that_fnode = url.deleteParam('id');
		this.m_fnode = null;
	}

	static async connect(center, url) {
		console.log('FNodeRemoteClient.connect', url);
		var impl = new FNodeRemoteClient(center, url);
		var id = await impl.call('getNodeId');
		impl.m_fnode = new FNodeRemote(center, impl, id);
		await impl.m_fnode.initialize();
		return impl.m_fnode;
	}
}

utils.extendClass(FNodeRemoteService, FNodeRemoteIMPL);
utils.extendClass(FNodeRemoteClient, FNodeRemoteIMPL);
service.set('_fnode', FNodeRemoteService);

module.exports = {
	FastMessageTransferCenter,
	fmtc: _fmtc.get,
};