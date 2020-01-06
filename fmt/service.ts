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
import service from '../service';
import * as wss from '../ws/service';
import errno from '../errno';
import * as _center from './_center';
import {WSConversation} from '../ws/conv';

type IMPL = _center.FastMessageTransferCenter_IMPL;

/**
 * @class FMTService
 */
export class FMTService extends wss.WSService {

	private m_id: string;
	private m_uuid: string = uuid();
	private m_time: Date = new Date();
	private m_user: Dict = {};
	private m_center: IMPL | null = null;
	private m_subscribe = new Set<string>();

	private get _center(): IMPL {
		return this.m_center as IMPL;
	}

	get id() {
		return this.m_id;
	}

	get uuid() {
		return this.m_uuid;
	}

	get time() {
		return this.m_time;
	}

	get user() {
		return this.m_user;
	}

	constructor(conv: WSConversation) {
		super(conv);
		this.m_id = String(this.params.id);
	}

	async requestAuth() {
		var center = fmtc._fmtc(this.conv.server);
		utils.assert(center, 'FMTService.requestAuth() fmt center No found');
		var user = await (center as IMPL).delegate.auth(this);
		if (user) {
			this.m_user = { ...user, id: this.m_id };
			return true;
		}
		return false;
	}

	async load() {
		var center = fmtc._fmtc(this.conv.server) as IMPL;
		utils.assert(center, 'FMTService.load() FMTC No found');
		await utils.sleep(utils.random(0, 200));
		this.m_time = new Date();
		this.m_user.time = this.m_time;
		try {
			await center.loginFrom(this);
		} catch(err) {
			if (err.code == errno.ERR_REPEAT_LOGIN_FMTC[0])
				await this._repeatForceLogout();
			throw err;
		}
		this.m_center = center;
	}

	/**
	 * @overwrite
	 */
	async destroy() {
		var center = this.m_center;
		if (center) {
			this.m_center = null;
			await center.logoutFrom(this);
		}
	}

	/**
	 * @overwrite
	 */
	trigger(event: string, data?: any, sender?: string) {
		if (this.hasSubscribe({event})) {
			return super.trigger(event, data, sender);
		} else {
			return Promise.resolve();
		}
	}

	reportState(event: string, id: string, data?: any) {
		this.trigger(`${event}-${id}`, data);
	}

	_repeatForceLogout() {
		return Promise.race([this._trigger('ForceLogout'), utils.sleep(200)]);
	}

	/**
	 * @func forceLogout() close conv
	 */
	forceLogout() {
		this._repeatForceLogout()
			.then(()=>this.conv.close())
			.catch(()=>this.conv.close());
	}

	// ------------ api ------------

	subscribe({ events }: { events: string[]}) {
		for (var event of events)
			this.m_subscribe.add(event);
	}

	unsubscribe({ events }: { events: string[]}) {
		for (var event of events)
			this.m_subscribe.delete(event);
	}

	hasSubscribe({ event }: { event: string }) {
		return this.m_subscribe.has(event);
	}

	hasOnline([id]: [string]) {
		return this._center.hasOnline(id);
	}

	// /**
	//  * @func publishTo() publish multicast,broadcast event message
	//  */
	// publishTo({ event, data, gid = null }){}

	/**
	 * @func triggerTo() event message
	 */
	triggerTo([id, event, data]: [string, string, any]) {
		return this._center.delegate.triggerTo(id, event, data, this.m_id);
	}

	/**
	 * @func callTo()
	 */
	callTo([id, method, data, timeout]: [string, string, any, number?]) {
		timeout = Number(timeout) || wss.METHOD_CALL_TIMEOUT; // disable not timeout
		return this._center.delegate.callTo(id, method, data, timeout, this.m_id);
	}

	/**
	 * @func sendTo()
	 */
	sendTo([id, method, data]: [string, string, any]) {
		return this._center.delegate.sendTo(id, method, data, this.m_id);
	}

	getUser([id]: [string]) {
		return this._center.user(id);
	}

}

export class FMTServerClient {

	private m_id: string;
	private m_center: IMPL;

	get id() {
		return this.m_id;
	}

	constructor(center: IMPL, id: string) {
		this.m_id = id;
		this.m_center = center;
	}

	trigger(event: string, data?: any, sender = '') {
		return this.m_center.delegate.triggerTo(this.m_id, event, data, sender);
	}

	call(method: string, data?: any, timeout = wss.METHOD_CALL_TIMEOUT, sender = '') {
		timeout = Number(timeout) || wss.METHOD_CALL_TIMEOUT; // disable not timeout
		return this.m_center.delegate.callTo(this.m_id, method, data, timeout, sender);
	}

	send(method: string, data?: any, sender = '') {
		return this.m_center.delegate.sendTo(this.m_id, method, data, sender);
	}

	user() {
		return this.m_center.user(this.m_id);
	}

}

service.set('_fmt', FMTService);
