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

import * as path from '../path';
import {EventNoticer, Notification} from '../event';
import * as cli from '../ws/cli';
import uuid from '../hash/uuid';
import errno from '../errno';
import utils from '../util';

/**
 * @class WSConv
 */
class WSConv extends cli.WSConversation {
	private m_headers: Dict;
	constructor(path: string, headers?: Dict) {
		super(path);
		this.m_headers = headers || {};
		this.autoReconnect = 500; // 500ms auto reconnect
	}
	getRequestHeaders() {
		return this.m_headers;
	}
}

function urlHref(url: path.URL) {
	var s = url.protocol == 'fmts:'? 'wss:': 'ws:';
	s += '//' + url.host + url.path;
	return s;
}

/**
 * @class WSClient
 */
class WSClient extends cli.WSClient {

	private m_host: FMTClient;

	constructor(host: FMTClient, url: path.URL, headers?: Dict) {
		super('_fmt', new WSConv(urlHref(url), headers));
		this.m_host = host;

		this.conv.onOpen.on(e=>{
			console.log('open ok', host.id);
			if ((<any>host).m_subscribe.size) {
				var events = [];
				for (var i of (<any>host).m_subscribe)
					events.push(i);
				this.call('subscribe', {events}).catch(console.error);
			}
		});

		this.conv.onClose.on(e=>{
			this.trigger('Offline', {});
		});

		this.addEventListener('Load', e=>{
			this.trigger('Online', {});
		});

		this.addEventListener('ForceLogout', e=>{
			console.error(`FMTService Force Logout, id=${host.id}, token=${this.conv.token}`);
		});
	}

	/**
	 * @overwrite
	 */
	protected handleCall(method: string, data: any, sender?: string) {
		return this.m_host.handleCall(method, data, sender);
	}

	/**
	 * @func close() close client
	 */
	close() {
		this.conv.close();
	}

}

/**
 * @class FMTClient
 */
export class FMTClient extends Notification {

	private m_subscribe = new Set<string>();
	private m_id: string;
	private m_cli: WSClient;

	get id() {
		return this.m_id;
	}

	get conv() {
		return this.m_cli.conv;
	}

	get loaded() {
		return this.m_cli.loaded;
	}

	close() {
		this.m_cli.close();
	}

	readonly onOnline = new EventNoticer('Online', this);
	readonly onOffline = new EventNoticer('Offline', this);

	constructor(id = uuid(), url = 'fmt://localhost/', headers?: Dict) {
		super();
		var u = new path.URL(url);
		u.setParam('id', id);
		this.m_id = String(id);
		this.m_cli = new WSClient(this, u, headers);
		this.m_cli.addEventForward('Online', this.onOnline);
		this.m_cli.addEventForward('Offline', this.onOffline);
	}

	that(id: string): ThatClient {
		utils.assert(id != this.id);
		return new ThatClientIMPL(this.m_cli, id);
	}

	user(id: string = this.id) {
		return this.m_cli.call('getUser', [id]);
	}

	/**
	 * @func handleCall()
	 */
	handleCall(method: string, data: any, sender?: string) {
		if (method in FMTClient.prototype) {
			throw Error.new(errno.ERR_FORBIDDEN_ACCESS);
		}
		var fn = (<any>this)[method];
		if (typeof fn != 'function') {
			throw Error.new(String.format('"{0}" no defined function', method));
		}
		return fn.call(this, data, sender);
	}

	/**
	 * @func subscribe()
	 */
	subscribe(events: string[]) {
		events.forEach(e=>this.m_subscribe.add(e));
		return this.m_cli.call('subscribe', {events});
	}

	/**
	 * @func unsubscribe()
	 */
	unsubscribe(events: string[]) {
		events.forEach(e=>this.m_subscribe.delete(e));
		return this.m_cli.call('unsubscribe', {events});
	}

	getNoticer(name: string) {
		if (!this.hasNoticer(name)) {
			this.m_cli.addEventForward(name, super.getNoticer(name)); // Forward event
		}
		return super.getNoticer(name);
	}

	triggerListenerChange(name: string, count: number, change: number) {
		if (change > 0) { // add
			if (!this.m_subscribe.has(name)) {
				this.m_subscribe.add(name);
				this.m_cli.call('subscribe', {events:[name]}).catch(console.error); // subscribe event
			}
		} else if (count === 0) { // del
			if (this.m_subscribe.has(name)) {
				this.m_subscribe.delete(name);
				this.m_cli.call('unsubscribe', {events:[name]}).catch(console.error); // unsubscribe event
			}
		}
	}

}

export interface ThatClient {
	hasOnline(): Promise<boolean>;
	trigger(event: string, data?: any): Promise<void>;
	call<T = any>(method: string, data?: any, timeout?: number): Promise<T>;
	send(method: string, data?: any): Promise<void>;
	user(): Promise<Dict>;
}

class ThatClientIMPL implements ThatClient {
	private m_id: string;
	private m_cli: WSClient;
	get id() { return this.m_id }

	constructor(cli: WSClient, id: string) {
		this.m_cli = cli;
		this.m_id = String(id);
	}
	hasOnline(): Promise<boolean> {
		return this.m_cli.call('hasOnline', [this.m_id]);
	}
	trigger(event: string, data?: any) {
		return this.m_cli.send('triggerTo', [this.m_id, event, data]);
	}
	call<T = any>(method: string, data?: any, timeout = cli.METHOD_CALL_TIMEOUT): Promise<T> {
		timeout = Number(timeout) || cli.METHOD_CALL_TIMEOUT;
		var args = [this.m_id, method, data];
		if (timeout != cli.METHOD_CALL_TIMEOUT)
			args.push(timeout);
		return this.m_cli.call('callTo', args, timeout);
	}
	send(method: string, data?: any) {
		return this.m_cli.send('sendTo', [this.m_id, method, data]);
	}
	user(): Promise<Dict> {
		return this.m_cli.call('getUser', [this.m_id]);
	}
}