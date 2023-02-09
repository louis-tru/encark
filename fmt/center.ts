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

import * as _center from './_center';
import {EventNoticer, Notification, Event} from '../event';
import * as server from '../_server';
import * as service from './service';
import * as node from './node';

// Fast Message Transfer Center, 快速消息传输中心

/**
 * @class FastMessageTransferCenterDelegate
 */
export class FastMessageTransferCenterDelegate {
	private m_host: FastMessageTransferCenter;
	private m_impl: _center.FastMessageTransferCenter_IMPL;

	constructor(host: FastMessageTransferCenter) {
		this.m_host = host;
		(<any>host).m_delegate = this; // TODO private visit
		this.m_impl = (<any>host).m_impl; // TODO private visit
	}

	get host() {
		return this.m_host;
	}

	exec(id: string, args: any[] = [], method?: string) {
		return this.m_impl.exec(id, args, method);
	}

	/** 
	 * @func auth() auth client, return client user info
	*/
	auth(fmtService: service.FMTService):Promise<Dict> | Dict | null {
		return {/* user info */};
	}

	/** 
	 * @func authFnode() auth fnode
	*/
	authFnode(fnodeRemoteService: node.FNodeRemoteService): boolean {
		return !!fnodeRemoteService.headers.certificate;
	}

	/**
	 * @func getCertificate() get current center certificate
	 */
	getCertificate() {
		return 'Certificate';
	}

	triggerTo(id: string, event: string, data: any, sender: string) {
		return this.exec(id, [event, data, sender], 'triggerTo');
	}

	callTo(id: string, method: string, data: any, timeout: number, sender: string) {
		return this.exec(id, [method, data, timeout, sender], 'callTo');
	}

	sendTo(id: string, method: string, data: any, sender: string) {
		return this.exec(id, [method, data, sender], 'sendTo');
	}

}

/**
 * @class FastMessageTransferCenter
 */
export class FastMessageTransferCenter extends Notification {

	private m_impl: _center.FastMessageTransferCenter_IMPL;
	private m_delegate: FastMessageTransferCenterDelegate;

	readonly onAddNode = new EventNoticer('AddNode', this);
	readonly onDeleteNode = new EventNoticer('DeleteNode', this);
	readonly onLogin = new EventNoticer('Login', this);
	readonly onLogout = new EventNoticer('Logout', this);

	get id() {
		return this.m_impl.id;
	}

	get publishURL() {
		return this.m_impl.publishURL;
	}

	get routeTable() {
		return this.m_impl.routeTable;
	}

	constructor(server: server.Server, fnodes: string[] = [/* 'fnode://127.0.0.1:9081/' */], publish?: string) {
		super();
		this.m_impl = new _center.FastMessageTransferCenter_IMPL(this, server, fnodes, publish);
		this.m_delegate = new FastMessageTransferCenterDelegate(this);
	}

	client(id: string) {
		return this.m_impl.client(id);
	}

	hasOnline(id: string) {
		return this.m_impl.hasOnline(id);
	}

	user(id: string) {
		return this.m_impl.user(id);
	}

	trigger(event: string, data: any) {
		this.publish(event, data);
		return 0;
	}

	publish(event: string, data: any) {
		return this.m_impl.publish(event, data);
	}

}