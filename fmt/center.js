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
var fmtc = require('./_fmtc');
var ser = require('./_ser');
var fnode = require('./_fnode');
var path = require('../path');
var errno = require('../errno');

const OFFLINE_CACHE_TIME = 1e4; // 10s

// Fast Message Transfer Center, 快速消息传输中心

/**
 * @class FastMessageTransferCenterDelegate
 */
class FastMessageTransferCenterDelegate {

	get host() {
		return this.m_host;
	}

	exec(...args) {
		return this.m_host.m_impl.exec(...args);
	}

	/** 
	 * @func auth() auth client
	*/
	auth(fmtService) {
		return true;
	}

	/** 
	 * @func authFnode() auth fnode
	*/
	authFnode(fnodeRemoteService) {
		return fnodeRemoteService.headers.certificate;
	}

	/**
	 * @func getCertificate() get current center certificate
	 */
	getCertificate() {
		return 'Certificate';
	}

	triggerTo(id, event, data, sender) {
		return this.exec(id, [event, data, sender], 'triggerTo');
	}

	callTo(id, method, data, timeout, sender) {
		return this.exec(id, [method, data, timeout, sender], 'callTo');
	}

}

/**
 * @class FastMessageTransferCenter
 */
class FastMessageTransferCenter extends event.Notification {

	get id() {
		return this.m_impl.id;
	}

	get publishURL() {
		return this.m_impl.publishURL;
	}

	constructor(server, fnodes = [/* 'fnode://127.0.0.1:9081/' */], publish = null) {
		super();
		this.m_impl = new FastMessageTransferCenter_IMPL(this, server, fnodes, publish);
		this.setDelegate(new FastMessageTransferCenterDelegate());
	}

	setDelegate(delegate) {
		this.m_delegate = delegate;
		delegate.m_host = this;
	}

	client(id) {
		return this.m_impl.client(id);
	}

	hasOnline(id) {
		return this.m_impl.hasOnline(id);
	}

	trigger(event, data) {
		return this.publish(event, data);
	}

	publish(event, data) {
		return this.m_impl.publish(event, data);
	}

}

/**
 * @class FastMessageTransferCenter_IMPL
 * @private
 */
class FastMessageTransferCenter_IMPL {

	get id() {
		return this.m_fnode_id;
	}

	get host() {
		return this.m_host;
	}

	get publishURL() {
		return this.m_publish_url;
	}

	get delegate() {
		return this.m_host.m_delegate;
	}

	constructor(host, server, fnodes, publish) {
		this.m_host = host;
		this.m_server = server;
		this.m_fnode_id = uuid(); // center server global id
		this.m_publish_url = publish ? new path.URL(publish): null;
		this.m_fnodes = null;
		this.m_fnodes_cfg = {}; // node server cfg
		this.m_fmtservice = new Map(); // client service handle
		this.m_route = new Map(); // { 0_a: 'fnodeId-abcdefg-1', 1_b: 'fnodeId-abcdefg-2' }
		this.m_connecting = new Set();
		this.m_broadcast_mark = new Set();

		this.m_host.addEventListener('AddNode', e=>{ // New Node connect
			if (e.data.fnode)
				this.addFnodeCfg(e.data.fnode);
			if (utils.dev)
				console.log('FastMessageTransferCenter_IMPL.onAddNode', e.data.fnode);
		});

		this.m_host.addEventListener('DeleteNode', e=>{ // Node Disconnect
			var {fnodeId} = e.data;
			for (var [id,fid] of this.m_route) {
				if (fnodeId == fid) {
					this.m_route.delete(id);
				}
			}
		});

		this.m_host.addEventListener('Login', e=>{ // client connect
			var { id, fnodeId, time, uuid} = e.data;
			var fmt = this.m_fmtservice.get(id);
			if (fmt) {
				if (fmt.time < time || (fmt.time == time && uuid != fmt.uuid)) {
					fmt.repeatLoginError(); // Duplicate logon, close conv
				}
			}
			this.m_route.set(id, fnodeId);

			for (var [,fmt] of this.m_fmtservice) {
				if (fmt.id != e.data.id)
					fmt.reportState('Login', e.data.id);
			}
		});

		this.m_host.addEventListener('Logout', e=>{ // client disconnect
			this.m_route.delete(e.data.id);
			for (var [,fmt] of this.m_fmtservice) {
				if (fmt.id != e.data.id)
					fmt.reportState('Logout', e.data.id);
			}
		});

		for (var cfg of fnodes) {
			this.addFnodeCfg(cfg, true);
		}

		fmtc._register(server, this);
	}

	addFnodeCfg(url, init = false) {
		if (url && !this.m_fnodes_cfg.hasOwnProperty(url)) {
			if (!this.m_publish_url || url != this.m_publish_url.href) {
				this.m_fnodes_cfg[url] = { url, init, retry: 0 };
			}
		}
	}

	async run() {
		utils.assert(!this.m_fnodes);
		this.m_fnodes = {};

		// init local node
		await (new fnode.FNodeLocal(this)).initialize();
		// witch nodes
		while ( fmtc._fmtc(this.m_server) === this ) {
			await utils.sleep(utils.random(0, 4e3)); // 0-4s
			for (var cfg of Object.values(this.m_fnodes_cfg)) {
				if ( !this.getFnodeFrom(cfg.url) ) {
					cfg.retry++;
					// console.log('FastMessageTransferCenter_IMPL.run(), connect', cfg.url);
					this.connect(cfg.url).catch(err=>{
						if (err.code != errno.ERR_REPEAT_FNODE_CONNECT[0]) {
							if (cfg.retry >= 10 && !cfg.init) { // retry 10 count
								delete this.m_fnodes_cfg[cfg.url];
							}
							console.error(err);
						} else {
							console.warn(err);
						}
					});
				}
			}
			await utils.sleep(8e3); // 8s
			this.m_broadcast_mark.clear(); // clear broadcast mark
		}

		for (var node of Object.values(this.m_fnodes)) {
			try {
				await node.destroy();
			} catch(err) {
				console.error(err);
			}
		}
		this.m_fnodes = null;
	}

	async connect(fNodePublishURL) {
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

	async hasOnline(id) {
		try {
			await this.exec(id);
		} catch(err) {
			return false;
		}
		return true;
	}

	async exec(id, args = [], method = null) {

		var fnodeId = this.m_route.get(id);
		while (fnodeId) {
			var fnode = this.m_fnodes[fnodeId];
			if (fnode) {
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
			} else if (typeof fnodeId == 'number') { // OFFLINE cache
				if (fnodeId > Date.now()) {
					throw Error.new(errno.ERR_FMT_CLIENT_OFFLINE);
				}
				break; // skip Trigger again Logout event
			}
			// Trigger again:
			this.m_route.delete(id);
			this.m_host.getNoticer('Logout').trigger({ fnodeId, id });
			break;
		}

		var {fnode,time,uuid} = await new Promise((resolve, _reject)=>{
			var fnodes = Object.values(this.m_fnodes);
			var l = fnodes.length, i = 0, complete = 0;
			var reject = e=>{
				this.m_route.set(id, Date.now() + OFFLINE_CACHE_TIME); // use OFFLINE cache
				_reject(e);
			};
			fnodes.forEach(fnode=>{
				fnode.query(id, true).then(e=>{
					if (complete) return;
					i++;
					if (e) {
						complete = 1;
						resolve(Object.assign({fnode}, e));
					} else if (l == i) {
						reject(Error.new(errno.ERR_FMT_CLIENT_OFFLINE));
					}
				}).catch(e=>{
					if (complete) return;
					i++;
					if (l == i) {
						reject(Error.new(errno.ERR_FMT_CLIENT_OFFLINE));
					}
				});
			});
		});

		// Trigger again
		this.m_route.set(id, fnode.id);
		this.m_host.getNoticer('Login').trigger({ fnodeId: fnode.id, id, time, uuid });

		if (method)
			return await fnode[method](id, ...args);
	}

	publish(event, data) {
		for (var fnode of Object.values(this.m_fnodes)) {
			fnode.publish(event, data).catch(e=>console.error('FastMessageTransferCenter_IMPL.publish', e));
		}
	}

	broadcast(event, data) {
		this._forwardBroadcast(event, data, utils.hash(uuid()));
	}

	_forwardBroadcast(event, data, id, source = null) {
		if (!this.m_broadcast_mark.has(id)) {
			this.m_broadcast_mark.add(id);
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
	async loginFrom(fmtservice) {
		utils.assert(fmtservice.id);
		utils.assert(!await this.hasOnline(fmtservice.id), errno.ERR_REPEAT_LOGIN_FMTC);
		utils.assert(!this.m_fmtservice.has(fmtservice.id), errno.ERR_REPEAT_LOGIN_FMTC);
		this.m_fmtservice.set(fmtservice.id, fmtservice);
		this.publish('Login', {
			fnodeId: this.id, 
			id: fmtservice.id, 
			time: fmtservice.time,
			uuid: fmtservice.uuid,
		});
		if (utils.dev)
			console.log('Login', fmtservice.id);
	}

	/**
	 * @func logoutFrom() client logout
	*/
	async logoutFrom(fmtservice) {
		utils.assert(fmtservice.id);
		utils.assert(this.m_fmtservice.has(fmtservice.id));
		this.m_fmtservice.delete(fmtservice.id);
		this.publish('Logout', {
			fnodeId: this.id, 
			id: fmtservice.id,
		});
		if (utils.dev)
			console.log('Logout', fmtservice.id);
	}

	/**
	 * @func getFnodeFrom()
	 */
	getFnodeFrom(url) {
		return Object.values(this.m_fnodes)
			.find(e=>e.publishURL&&e.publishURL.href==url);
	}

	/**
	 * @func addNode()
	 */
	async addNode(fnode) {
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
				var cfg = this.m_fnodes_cfg[publish.href];
				if (cfg) {
					cfg.retry = 0;
				}
			}
		}
		// this.m_host.getNoticer('AddNode').trigger({ fnodeId: fnode.id });
		this.broadcast('AddNode', { fnodeId: fnode.id, fnode: this.publishURL ? this.publishURL.href: null });
	}

	/**
	 * @func deleteNode()
	 */
	async deleteNode(fnode) {
		if (this.m_fnodes[fnode.id]) {
			delete this.m_fnodes[fnode.id];
			this.m_host.getNoticer('DeleteNode').trigger({ fnodeId: fnode.id });
		}
	}

}

module.exports = {
	FastMessageTransferCenter,
	FastMessageTransferCenterDelegate,
	fmtc: fmtc.get,
};