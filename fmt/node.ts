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

import utils from '../util';
import {URL} from '../path';
import fmtc from './fmtc';
import service from '../service';
import * as wss from '../ws/service';
import * as cli from '../ws/cli';
import path from '../path';
import errno from '../errno';
import * as _center from './_center';
import {ConversationBasic} from '../ws/_conv';

type IMPL = _center.FastMessageTransferCenter_IMPL;

export interface QueryResult {
	time: Date;
	uuid: string;
}

export abstract class FNode {
	protected m_initTime = 0;
	protected m_center: IMPL;
	abstract get id(): string;
	abstract get publishURL(): URL | null;
	get initTime(): number { return this.m_initTime }
	get center() {return this.m_center}
	constructor(center: IMPL) { this.m_center = center}
	initialize(initTime = 0) {
		this.m_initTime = initTime;
		return this.m_center.addNode(this);
	}
	destroy() { return this.m_center.deleteNode(this) }
	abstract publish(event: string, data: any): Promise<void>;
	abstract broadcast(event: string, data: any, id: string): Promise<void>;
	abstract triggerTo(id: string, event: string, data: any, sender: string): Promise<void>;
	abstract callTo(id: string, method: string, data: any, timeout: number, sender: string): Promise<any>;
	abstract sendTo(id: string, method: string, data: any, sender: string): Promise<void>;
	abstract user(id: string): Promise<Dict<any>>;
	abstract query(id: string, more?: boolean): Promise<QueryResult | boolean | null>;
}

/**
 * @class FMTNodeLocal
 */
export class FNodeLocal extends FNode {
	get id() {
		return this.m_center.id;
	}
	get publishURL() {
		return this.m_center.publishURL;
	}
	async publish(event: string, data: any) {
		this.m_center.host.getNoticer(event).trigger(data);
	}
	async broadcast(event: string, data: any, id: string) {
		this.m_center.host.getNoticer(event).trigger(data);
	}
	triggerTo(id: string, event: string, data: any, sender: string) {
		return this.m_center.getFMTService(id).trigger(event, data, sender); // trigger event
	}
	callTo(id: string, method: string, data: any, timeout: number, sender: string) {
		return this.m_center.getFMTService(id).call(method, data, timeout, sender); // call method
	}
	sendTo(id: string, method: string, data: any, sender: string) {
		return this.m_center.getFMTService(id).send(method, data, sender); // call method
	}
	async user(id: string) {
		return this.m_center.getFMTService(id).user;
	}
	async query(id: string, more = false) {
		var s = this.m_center.getFMTServiceNoError(id);
		if (more) {
			return s ? {time:s.time,uuid:s.uuid}: null;
		} else {
			return s ? true: false;
		}
	}
}

/**
 * @class FNodeRemote
 */
export class FNodeRemote extends FNode {

	private m_impl: FNodeRemoteIMPL;
	private m_node_id: string;
	private m_isInit = false;

	constructor(center: IMPL, impl: FNodeRemoteIMPL, id: string) {
		super(center);
		this.m_impl = impl;
		this.m_node_id = id;
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

	// ---------------- IMPL ----------------

	get id() {
		return this.m_node_id;
	}
	get publishURL() {
		return this.m_impl.thatFnode;
	}

	publish(event: string, data: any) { // publish event to fnode
		return this.m_impl.send('publish', [event,data]);
	}
	broadcast(event: string, data: any, id: string) { // broadcast event to fnode
		return this.m_impl.send('broadcast', [event,data,id]);
	}
	triggerTo(id: string, event: string, data: any, sender: string) { // trigger event to client
		return this.m_impl.call('triggerTo', [id, event, data, sender]); // trigger event
	}
	callTo(id: string, method: string, data: any, timeout: number, sender: string) { // call client
		return this.m_impl.call('callTo', [id, method, data, timeout, sender], timeout); // call method
	}
	sendTo(id: string, method: string, data: any, sender: string) {
		return this.m_impl.call('sendTo', [id, method, data, sender]); // call method
	}
	user(id: string) {
		return this.m_impl.call('user', [id]); // call method
	}
	query(id: string, more = false) { // query client
		return this.m_impl.call('query', [id, more?true:false]);
	}
}

/**
 * @class FNodeRemoteIMPL
 */
export abstract class FNodeRemoteIMPL {

	abstract get conv(): ConversationBasic;
	abstract get center(): IMPL;
	abstract get thatFnode(): URL | null;
	abstract get fnode(): FNode;
	abstract call(method: string, data?: any, timeout?: number, sender?: string): Promise<any>;
	abstract send(method: string, data?: any, sender?: string): Promise<void>;

	publish([event, data]: [string, any]) { // publish event to fnode
		this.center.host.getNoticer(event).trigger(data);
	}
	broadcast([event, data, id]: [string, any, string]) { // broadcast event to fnode
		this.center._forwardBroadcast(event, data, id, this.fnode);
	}
	triggerTo([id, event, data, sender]: [string, string, any, string]) { // trigger event to client
		return this.center.getFMTService(id).trigger(event, data, sender);
	}
	callTo([id, method, data, timeout, sender]: [string, string, any, number, string]) { // call client
		return this.center.getFMTService(id).call(method, data, timeout, sender);
	}
	sendTo([id, method, data, sender]: [string, string, any, string]) { // call client
		return this.center.getFMTService(id).send(method, data, sender);
	}
	user([id]: [string]) {
		return this.center.getFMTService(id).user;
	}
	query([id,more]: [string, boolean]) { // query client
		var s = this.center.getFMTServiceNoError(id);
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
export class FNodeRemoteService extends wss.WSService {

	private m_center: IMPL | null = null;
	private m_that_fnode: URL | null = null;
	private m_fnode: FNode | null = null;

	get thatFnode() { return this.m_that_fnode }
	get center(): IMPL { return this.m_center as IMPL; }
	get fnode(): FNode { return this.m_fnode as FNode }

	async requestAuth() {
		var center = fmtc._fmtc(this.conv.server) as IMPL;
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
			this.m_that_fnode = publish ? new URL(decodeURIComponent(publish)): null;
			this.m_fnode = new FNodeRemote(this.center, this as unknown as FNodeRemoteIMPL, id);
			await this.m_fnode.initialize();
			await utils.sleep(200); // 在同一个node进程中同时开启多个节点时socket无法写入
			this.trigger('InitComplete', { id: this.center.id, time: this.m_fnode.initTime });
			console.log('FNodeRemoteService.load', id, this.m_that_fnode && this.m_that_fnode.href);
		} catch(err) {
			console.error('FNodeRemoteService.load, err', err);
			this.conv.close();
		}
		await super.load();
	}

	async destroy() {
		await super.destroy();
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
	private m_center: IMPL;
	constructor(center: IMPL, s: string) {
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
export class FNodeRemoteClient extends cli.WSClient {

	private m_center: IMPL;
	private m_that_fnode: URL;
	private m_fnode: FNode | null;

	get center(): IMPL { return this.m_center; }
	get thatFnode() { return this.m_that_fnode }
	get fnode(): FNode { return this.m_fnode as FNode }

	constructor(center: IMPL, fnode = 'fnode://localhost/') {
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
			var {id,time}: {id: string, time: number} = await Promise.race([new Promise<any>((resolve)=>{
				this.addEventListenerOnce('InitComplete', e=>resolve(e.data));
			}), utils.sleep(5e3, {id:0})]);
			utils.assert(id, errno.ERR_FNODE_CONNECT_TIMEOUT);
			this.m_fnode = new FNodeRemote(this.m_center, this as unknown as FNodeRemoteIMPL, id);
			await this.fnode.initialize(time);
		} catch(err) {
			this.conv.close();
			throw err;
		}
	}
}

utils.extendClass(FNodeRemoteService, FNodeRemoteIMPL);
utils.extendClass(FNodeRemoteClient, FNodeRemoteIMPL);

service.set('_fnode', FNodeRemoteService);
