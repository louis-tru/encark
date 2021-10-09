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
import uuid from '../hash/uuid';
import fmtc from './fmtc';
import {Server} from '../_server';
import {URL} from '../path';
import errno from '../errno';
import * as service from './service';
import * as fnode from './node';
import * as center from './center';

const OFFLINE_CACHE_TIME = 1e4; // 10s

/**
 * @class Route
 */
export class Route {
	readonly id: string;
	readonly uuid: string;
	readonly time: number;
	readonly fnodeId: string;
	constructor(
		host: FastMessageTransferCenter_IMPL, 
		id: string, 
		uuid: string, 
		time: number, fnodeId: string
	) {
		utils.assert(id);
		utils.assert(fnodeId);
		utils.assert(time);
		utils.assert(uuid);
		this.id = id;
		this.fnodeId = fnodeId;
		this.time = time;
		this.uuid = uuid;
		(<any>host).m_routeTable.set(id, this);
		(<any>host).m_markOffline.delete(id);
	}
}

interface FnodesCfg {
	url: string;
	init: boolean;
	retry: number;
}

/**
 * @class FastMessageTransferCenter_IMPL
 */
export class FastMessageTransferCenter_IMPL {
	private m_host: center.FastMessageTransferCenter;
	private m_server: Server;
	private m_fnode_id: string = uuid(); // center server global id
	private m_publish_url: URL | null;
	private m_fnodes: Dict<fnode.FNode> = {};
	private m_isRun = false;
	private m_fnodesCfg: Dict<FnodesCfg> = {};
	private _fmtService: Map<string, service.FMTService> = new Map(); // client service handle
	private m_routeTable: Map<string, Route> = new Map(); // { 0_a: {fnodeId:'fnodeId-abcdefg-1',uuid,time} }
	private m_connecting = new Set<string>();
	private m_broadcastMark = new Set<string>();
	private m_markOffline = new Map<string, number>(); // Date.now() + OFFLINE_CACHE_TIME;

	get id() {
		return this.m_fnode_id;
	}

	get host() {
		return this.m_host;
	}

	get publishURL() {
		return this.m_publish_url;
	}

	get delegate(): center.FastMessageTransferCenterDelegate {
		return (<any>this).m_host.m_delegate;
	}

	get routeTable() {
		return this.m_routeTable;
	}

	constructor(host: center.FastMessageTransferCenter, server: Server, fnodes: string[] = [], publish?: string) {
		this.m_host = host;
		this.m_server = server;
		this.m_publish_url = publish ? new URL(publish): null;

		this.m_host.addEventListener('AddNode', e=>{ // New Node connect
			if (e.data.publish)
				this.addFnodeCfg(e.data.publish);
			if (utils.debug)
				console.log('FastMessageTransferCenter_IMPL.onAddNode', e.data.publish);
		});

		this.m_host.addEventListener('DeleteNode', e=>{ // Node Disconnect
			if (utils.debug)
				console.log('FastMessageTransferCenter_IMPL.DeleteNode', e.data.fnodeId);
		});

		this.m_host.addEventListener('_Login', e=>{ // client connect
			var { id, uuid, time, fnodeId } = e.data;
			var fmt = this._fmtService.get(id);
			if (fmt) {
				if (uuid != fmt.uuid) {
					if (fmt.time <= time)
						fmt.forceLogout(); // force logout, offline
					if (fmt.time >= time)
						return // Invalid login
				}
			} else {
				var route = this.m_routeTable.get(id);
				if (route) {
					if (route.time >= time)
						return // Invalid login
				}
			}
			new Route(this, id, uuid, time, fnodeId);

			// trigger login event
			this.m_host.getNoticer('Login').trigger(e.data);

			for (let [,fmt] of this._fmtService) {
				if (fmt.id != id)
					fmt.reportState('Login', id);
			}
		});

		this.m_host.addEventListener('_Logout', e=>{ // client disconnect
			var {id, uuid} = e.data;
			var route = this.m_routeTable.get(id);
			if (utils.debug)
				console.log('this.m_host.addEventListener(_Logout)', route, uuid);
			if (route && route.uuid == uuid) {
				this.m_routeTable.delete(id);
				// trigger logout event
				this.m_host.getNoticer('Logout').trigger(e.data);
				for (var [,fmt] of this._fmtService) {
					if (fmt.id != id)
						fmt.reportState('Logout', id);
				}
			}
		});

		for (var cfg of fnodes) {
			this.addFnodeCfg(cfg, true);
		}

		fmtc._register(server, this);
	}

	addFnodeCfg(url: string, init = false) {
		if (url && !this.m_fnodesCfg.hasOwnProperty(url)) {
			if (!this.m_publish_url || url != this.m_publish_url.href) {
				this.m_fnodesCfg[url] = { url, init, retry: 0 };
			}
		}
	}

	async run() {
		utils.assert(!this.m_isRun);
		this.m_isRun = true;
		this.m_fnodes = {};

		// init local node
		await (new fnode.FNodeLocal(this)).initialize();
		// witch nodes
		while ( fmtc._fmtc(this.m_server) === this ) {
			await utils.sleep(utils.random(0, 4e3)); // 0-4s
			for (var cfg of Object.values(this.m_fnodesCfg)) {
				if ( !this.getFnodeFrom(cfg.url) ) {
					cfg.retry++;
					// console.log('FastMessageTransferCenter_IMPL.run(), connect', cfg.url);
					this.connect(cfg.url).catch(err=>{
						if (err.errno != errno.ERR_REPEAT_FNODE_CONNECT[0]) {
							if (cfg.retry >= 10 && !cfg.init) { // retry 10 count
								delete this.m_fnodesCfg[cfg.url];
							}
							console.error(err);
						} else {
							console.warn(err);
						}
					});
				}
			}
			await utils.sleep(8e3); // 8s
			this.m_broadcastMark.clear(); // clear broadcast mark
		}

		for (var node of Object.values(this.m_fnodes)) {
			try {
				await node.destroy();
			} catch(err) {
				console.error(err);
			}
		}
		this.m_fnodes = {};
	}

	async connect(fNodePublishURL: string) {
		if (this.m_connecting.has(fNodePublishURL))
			return;
		try {
			this.m_connecting.add(fNodePublishURL);
			console.log('FastMessageTransferCenter_IMPL.connect', fNodePublishURL);
			await (new fnode.FNodeRemoteClient(this, fNodePublishURL))._init();
			console.log('FastMessageTransferCenter_IMPL, connect ok');
		} finally {
			this.m_connecting.delete(fNodePublishURL);
		}
	}

	client(id: string) {
		return new service.FMTServerClient(this, id);
	}

	getFMTService(id: string) {
		var handle = this._fmtService.get(id);
		utils.assert(handle, errno.ERR_FMT_CLIENT_OFFLINE);
		return handle as service.FMTService;
	}

	getFMTServiceNoError(id: string) {
		return this._fmtService.get(id);
	}

	async hasOnline(id: string) {
		try {
			await this.exec(id);
		} catch(err) {
			return false;
		}
		return true;
	}

	user(id: string) {
		return this.exec(id, [], 'user');
	}

	markOffline(id: string) {
		this.m_markOffline.set(id, Date.now() + OFFLINE_CACHE_TIME);
	}

	async exec(id: string, args: any[] = [], method?: string): Promise<any> {

		var fnode: fnode.FNode | null = null;
		var route = this.m_routeTable.get(id);
		if (route) {
			fnode = this.m_fnodes[route.fnodeId];
			if (fnode) {
				try {
					return method ?
						await (fnode as any)[method](id, ...args):
						utils.assert(await fnode.query(id), errno.ERR_FMT_CLIENT_OFFLINE);
				} catch(err: any) {
					if (err.errno != errno.ERR_FMT_CLIENT_OFFLINE[0]) {
						throw err;
					}
				}
				fnode = null;
			}
			// Trigger again:
			this.m_host.getNoticer('_Logout').trigger({ id, uuid: route.uuid, fnodeId: route.fnodeId });
		}

		var mark = this.m_markOffline.get(id);
		if (mark) { // OFFLINE mark
			utils.assert(mark < Date.now(), errno.ERR_FMT_CLIENT_OFFLINE);
		}

		// random query status ..
		var fnodes = Object.values(this.m_fnodes);
		while (fnodes.length) {
			var i = utils.random(0, fnodes.length - 1);
			if (utils.debug)
				console.log('FastMessageTransferCenter_IMPL.exec', i, fnodes.length - 1, id);
			var _fnode = fnodes[i];
			if (this.m_fnodes[_fnode.id]) {
				try {
					var {uuid,time} = await _fnode.query(id, true) as fnode.QueryResult;
					fnode = _fnode; // ok
					break;
				} catch(e) {}
			}
			fnodes.splice(i, 1);
		}

		if (!fnode) {
			this.markOffline(id); // mark Offline
			throw Error.new(errno.ERR_FMT_CLIENT_OFFLINE);
		}
		// Trigger again
		this.m_host.getNoticer('_Login').trigger({ id, uuid, fnodeId: (fnode as fnode.FNode).id, time });

		if (method) {
			return await (fnode as any)[method](id, ...args);
		}
	}

	publish(event: string, data: any) {
		for (var fnode of Object.values(this.m_fnodes)) {
			fnode.publish(event, data).catch(e=>console.error('FastMessageTransferCenter_IMPL.publish', e));
		}
	}

	broadcast(event: string, data: any) {
		this._forwardBroadcast(event, data, utils.hash(uuid()));
	}

	_forwardBroadcast(event: string, data: any, id: string, source?: fnode.FNode) {
		if (!this.m_broadcastMark.has(id)) {
			this.m_broadcastMark.add(id);
			for (let f of Object.values(this.m_fnodes)) {
				if (!source || source !== f) {
					f.broadcast(event, data, id)
						.catch(e=>console.error('FastMessageTransferCenter_IMPL._forwardBroadcast', 
							'cur', this.publishURL&&this.publishURL.href,
							'fnode',f.publishURL&&f.publishURL.href, e)
						);
				}
			}
		}
	}

	/** 
	 * @func loginFrom() client login 
	 */
	async loginFrom(fmtService: service.FMTService) {
		utils.assert(fmtService.id);

		var old = this._fmtService.get(fmtService.id);
		if (old) {
			utils.assert(fmtService.time > old.time, errno.ERR_REPEAT_LOGIN_FMTC);
			old.forceLogout(); // force offline
			await this.logoutFrom(old);
		}

		utils.assert(!this._fmtService.has(fmtService.id));

		this._fmtService.set(fmtService.id, fmtService);

		this.publish('_Login', {
			id: fmtService.id, uuid: fmtService.uuid, fnodeId: this.id, time: fmtService.time,
		});

		if (utils.debug)
			console.log('Login', fmtService.id, fmtService.uuid, fmtService.conv.token);
	}

	/**
	 * @func logoutFrom() client logout
	*/
	async logoutFrom(fmtService: service.FMTService) {
		utils.assert(fmtService.id);

		if (!this._fmtService.has(fmtService.id))
			return;

		if (this._fmtService.get(fmtService.id) !== fmtService) {
			if (utils.debug)
				console.log('logoutFrom', fmtService.id);
			return;
		}

		this._fmtService.delete(fmtService.id);

		this.publish('_Logout', {
			id: fmtService.id, uuid: fmtService.uuid, fnodeId: this.id,
		});

		if (utils.debug)
			console.log('Logout', fmtService.id, fmtService.uuid, fmtService.conv.token);
	}

	/**
	 * @func getFnodeFrom()
	 */
	getFnodeFrom(url: string) {
		return Object.values(this.m_fnodes)
			.find(e=>e.publishURL&&e.publishURL.href==url);
	}

	/**
	 * @func addNode()
	 */
	async addNode(fnode: fnode.FNode) {
		// console.error(`Node with ID ${fnode.id} already exists`);
		var cur = this.m_fnodes[fnode.id];
		if (cur) {
			if (fnode.initTime < cur.initTime) {
				delete this.m_fnodes[fnode.id];
				await cur.destroy();
				this.m_fnodes[fnode.id] = fnode;
				return;
			} else {
				throw Error.new(errno.ERR_REPEAT_FNODE_CONNECT);
			}
		}
		this.m_fnodes[fnode.id] = fnode;
		var publish = fnode.publishURL;
		if (publish) {
			if (!this.publishURL || this.publishURL.href != publish.href) {
				// this.addFnodeCfg(publish.href);
				var cfg = this.m_fnodesCfg[publish.href];
				if (cfg) {
					cfg.retry = 0;
				}
			}
		}
		// this.m_host.getNoticer('AddNode').trigger({ fnodeId: fnode.id });
		this.broadcast('AddNode', { fnodeId: fnode.id, publish: this.publishURL ? this.publishURL.href: null });
	}

	/**
	 * @func deleteNode()
	 */
	async deleteNode(fnode: fnode.FNode) {
		if (this.m_fnodes[fnode.id]) {
			delete this.m_fnodes[fnode.id];
			this.m_host.getNoticer('DeleteNode').trigger({ fnodeId: fnode.id });
		}
	}

}