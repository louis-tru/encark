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
var fmtc = require('./_fmtc');
var service = require('../service');
var wss = require('../ws/service');
var cli = require('../ws/cli');
var path = require('../path');
var errno = require('../errno');

/**
 * @class FNode
 */
class FNode {
	get id() {return null}
	get publishURL() {return null}
	get center() {return this.m_center}
	get initTime() {return 0}
	constructor(center) { this.m_center = center}
	initialize() { return this.m_center.addNode(this)}
	destroy() { return this.m_center.deleteNode(this)}
	publish(event, data) {}
	broadcast(event, data, id) {}
	triggerTo(id, event, data) {}
	callTo(id, name, data, timeout) {}
	query(id, more = 0) {}
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
	async publish(event, data) {
		this.m_center.host.getNoticer(event).trigger(data);
	}
	async broadcast(event, data, id) {
		this.m_center.host.getNoticer(event).trigger(data);
	}
	triggerTo(id, event, data, sender) {
		return this.m_center.getFMTService(id).trigger(event, data, 0, sender); // trigger event
	}
	callTo(id, method, data, timeout, sender) {
		return this.m_center.getFMTService(id).call(method, data, timeout, sender); // call method
	}
	async query(id, more=0) {
		var s = this.m_center.getFMTServiceNoError(id);
		if (more) {
			return s ? {time:s.time,uuid:s.uuid}: null;
		} else {
			return s ? 1: 0;
		}
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
		return this.m_impl.getThatFnode();
	}

	get initTime() {
		return this.m_initTime;
	}

	constructor(center, impl, id) {
		super(center);
		this.m_impl = impl;
		this.m_node_id = id;
		this.m_initTime = 0;
		this.m_isInit = 0;
	}

	async initialize(initTime = 0) {
		utils.assert(!this.m_isInit);
		try {
			this.m_impl.conv.onClose.on(async e=>{
				if (this.m_isInit) {
					await this.m_center.deleteNode(this);
					var url = this.publishURL;
					if (url) { // recontect
						console.log('recontect', url.href);
						await utils.sleep(1e2 + utils.random(1e2)); // 100+ms
						if ( !this.m_center.getFnodeFrom(url.href) ) {
							console.log('recontect, start', url.href);
							this.m_center.connect(url.href).catch(console.error);
						}
					}
				}
			});
			console.log('FNodeRemote.initialize()', this.m_node_id);
			this.m_initTime = initTime ? initTime: Date.now();
			await this.m_center.addNode(this);
			console.log('FNodeRemote.initialize(), ok', this.m_node_id);
			this.m_isInit = true;
		} catch(err) {
			this.destroy();
			throw err;
		}
	}

	async destroy() {
		this.m_impl.conv.close();
		await this.m_center.deleteNode(this);
	}

	publish(event, data) { // publish event to fnode
		return this.m_impl.call('publish', [event,data]);
	}

	broadcast(event, data, id) { // broadcast event to fnode
		return this.m_impl.call('broadcast', [event,data,id]);
	}

	triggerTo(id, event, data, sender) { // trigger event to client
		return this.m_impl.call('triggerTo', [id, event, data, sender]); // trigger event
	}

	callTo(id, method, data, timeout, sender) { // call client
		return this.m_impl.call('callTo', [id, method, data, timeout, sender], timeout); // call method
	}

	query(id, more = 0) { // query client
		return this.m_impl.call('query', [id, more?true:false]);
	}
}

/**
 * @class FNodeRemoteIMPL
 */
class FNodeRemoteIMPL {

	getThatFnode() {
		return this.m_that_fnode;
	}

	publish([event, data]) { // publish event to fnode
		this.m_center.host.getNoticer(event).trigger(data);
	}

	broadcast([event, data, id]) { // broadcast event to fnode
		this.m_center._forwardBroadcast(event, data, id, this.m_fnode);
	}

	triggerTo([id, event, data, sender]) { // trigger event to client
		return this.m_center.getFMTService(id).trigger(event, data, 0, sender);
	}

	callTo([id, method, data, timeout, sender]) { // call client
		return this.m_center.getFMTService(id).call(method, data, timeout, sender);
	}

	query([id,more]) { // query client
		var s = this.m_center.getFMTServiceNoError(id);
		if (more) {
			return s ? {time:s.time,uuid:s.uuid}: null;
		} else {
			return s ? true: false;
		}
	}
}

/**
 * @class FNodeRemoteService
 */
class FNodeRemoteService extends wss.WSService {

	async requestAuth() {
		var center = fmtc._fmtc(this.conv.server);
		utils.assert(center, 'FNodeRemoteService.requestAuth() fmt center No found');
		utils.assert(this.params.id, 'FNodeRemoteService.loaded() node id param undefined');
		utils.assert(this.params.id != center.id, 'Cannot connect to itself');
		if (!await center.delegate.authFnode(this))
			return false;
		this.m_center = center;
		return true;
	}

	async load() {
		try {
			var {id,publish} = this.params;
			this.m_that_fnode = publish ? new path.URL(decodeURIComponent(publish)): null;
			this.m_fnode = new FNodeRemote(this.m_center, this, id);
			await this.m_fnode.initialize();
			await utils.sleep(200); // 在同一个node进程中同时开启多个节点时socket无法写入
			this.trigger('InitComplete', { id: this.m_center.id, time: this.m_fnode.initTime });
			console.log('FNodeRemoteService.load', id, this.m_that_fnode && this.m_that_fnode.href);
		} catch(err) {
			console.error('FNodeRemoteService.load, err', err);
			this.conv.close();
		}
	}

	async destroy() {
		try {
			if (!this.m_fnode) return;
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
 * @class WSConv
 */
class WSConv extends cli.WSConversation {
	constructor(center, s) {
		super(s);
		this.m_center = center;
	}
	getRequestHeaders() {
		return { certificate: this.m_center.delegate.getCertificate() };
	}
}

/**
 * @class FNodeRemoteClient
 */
class FNodeRemoteClient extends cli.WSClient {

	constructor(center, fnode = 'fnode://localhost/') {
		var url = new path.URL(fnode);
		url.setParam('id', center.id);
		if (center.publishURL)
			url.setParam('publish', encodeURIComponent(center.publishURL.href));
		var s = url.protocol == 'fnodes:'? 'wss:': 'ws:';
				s += '//' + url.host + url.path;
		super('_fnode', new WSConv(center, s));
		this.m_center = center;
		this.m_that_fnode = new path.URL(fnode);
		this.m_fnode = null;
	}

	async _init() {
		try {
			var {id,time} = await Promise.race([new Promise((resolve)=>{
				this.addEventListenerOnce('InitComplete', e=>resolve(e.data));
			}), utils.sleep(5e3, {id:0})]);
			utils.assert(id, errno.ERR_FNODE_CONNECT_TIMEOUT);
			this.m_fnode = new FNodeRemote(this.m_center, this, id);
			await this.m_fnode.initialize(time);
		} catch(err) {
			this.conv.close();
			throw err;
		}
	}

}

utils.extendClass(FNodeRemoteService, FNodeRemoteIMPL);
utils.extendClass(FNodeRemoteClient, FNodeRemoteIMPL);
service.set('_fnode', FNodeRemoteService);

module.exports = {
	FNodeLocal,
	FNodeRemoteClient,
};