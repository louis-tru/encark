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

var path = require('../path');
var event = require('../event');
var cli = require('../ws/cli');
var uuid = require('../hash/uuid');
var errno = require('../errno');
var utils = require('../util');

/**
 * @class WSConv
 */
class WSConv extends cli.WSConversation {
	constructor(s, headers) {
		super(s);
		this.m_headers = headers || {};
	}
	getRequestHeaders() {
		return this.m_headers;
	}
}

/**
 * @class WSClient
 */
class WSClient extends cli.WSClient {

	get autoConnect() {
		return this.m_autoConnect;
	}

	set autoConnect(value) {
		this.m_autoConnect = !!value;
	}

	constructor(host, url, headers) {
		var s = url.protocol == 'fmts:'? 'wss:': 'ws:';
				s += '//' + url.host + url.path;
		super('_fmt', new WSConv(s, headers));
		this.m_host = host;
		this.m_autoConnect = true;
		this.m_active_close = false;

		this.conv.onOpen.on(e=>{
			console.log('open ok', host.id);
			this.m_active_close = false;
			if (host.m_subscribe.size) {
				var events = [];
				for (var i of host.m_subscribe)
					events.push(i);
				this.call('subscribe', {events}).catch(console.error);
			}
		});

		this.conv.onClose.on(e=>{
			if (this.m_autoConnect && !this.m_active_close) { // auto connect
				console.log('reconnect Clo..', host.id);
				utils.sleep(500).then(e=>this.conv.connect());
			}
			this.trigger('Offline');
		});

		this.conv.onError.on(e=>{
			if (this.m_autoConnect && !this.m_active_close) { // auto connect
				console.log('reconnect Err..', host.id);
				utils.sleep(500).then(e=>this.conv.connect());
			}
		});

		this.addEventListener('Load', e=>{
			this.trigger('Online');
		});

		this.addEventListener('RepeatLoginError', e=>{
			console.error(`FMTService Repeat login, id=${host.id}`);
		});
	}

	/**
	 * @overwrite
	 */
	handleCall(method, data, sender) {
		return this.m_host.handleCall(method, data, sender);
	}

	/**
	 * @func close() close client
	 */
	close() {
		this.m_active_close = true;
		this.conv.close();
	}

}

/**
 * @class FMTClient
 */
class FMTClient extends event.Notification {

	get id() {
		return this.m_id;
	}

	get conv() {
		return this.m_cli.conv;
	}

	get loaded() {
		return this.m_cli.loaded;
	}

	get autoConnect() {
		return this.m_cli.autoConnect;
	}

	set autoConnect(value) {
		this.m_cli.autoConnect = value;
	}

	close() {
		this.m_cli.close();
	}

	constructor(id = uuid(), url = 'fmt://localhost/', headers = null) {
		super();
		url = new path.URL(url);
		url.setParam('id', id);
		this.m_id = String(id);
		this.m_url = url;
		this.m_subscribe = new Set();
		this.m_cli = new WSClient(this, url, headers);
	}

	that(id) {
		utils.assert(id != this.id);
		return new ThatClient(this, id);
	}

	/**
	 * @func handleCall()
	 */
	handleCall(method, data, sender) {
		if (method in FMTClient.prototype) {
			throw Error.new(errno.ERR_FORBIDDEN_ACCESS);
		}
		var fn = this[method];
		if (typeof fn != 'function') {
			throw Error.new('"{0}" no defined function'.format(method));
		}
		return fn.call(this, data, sender);
	}

	/**
	 * @func subscribe()
	 */
	subscribe(events) {
		events.forEach(e=>this.m_subscribe.add(e));
		return this.m_cli.call('subscribe', {events});
	}

	/**
	 * @func unsubscribe()
	 */
	unsubscribe(events) {
		events.forEach(e=>this.m_subscribe.delete(e));
		return this.m_cli.call('unsubscribe', {events});
	}

	// @overwrite:
	getNoticer(name) {
		if (!this.hasNoticer(name)) {
			this.m_cli.addEventListener(name, super.getNoticer(name)); // Forward event
		}
		return super.getNoticer(name);
	}

	// @overwrite:
	triggerListenerChange(name, count, change) {
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

/**
 * @class ThatClient
 */
class ThatClient {
	get id() {
		return this.m_id;
	}
	constructor(host, id) {
		this.m_host = host;
		this.m_id = String(id);
	}
	hasOnline() {
		return this.m_host.m_cli.call('hasOnline', [this.m_id]);
	}
	trigger(event, data) {
		return this.m_host.m_cli.call('triggerTo', [this.m_id, event, data]);
	}
	call(method, data, timeout = cli.METHOD_CALL_TIMEOUT) {
		return this.m_host.m_cli.call('callTo', [this.m_id, method, data, timeout], timeout);
	}
}

module.exports = {
	FMTClient,
};