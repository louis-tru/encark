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

import utils from '../../util'
import errno from '../../errno';
import { Notification, Event, EventNoticer } from '../../event';
import { Types, Data, DataBuilder } from '../data';
import * as conv from './conv';
export * from './conv';

export const METHOD_CALL_TIMEOUT = 12e4; // 120s

const print_log = false; // utils.debug

declare class WSConversationIMPL extends conv.WSConversation {
	initialize(): Promise<void>;
	send(): Promise<void>;
	ping(): Promise<void>;
	pong(): Promise<void>;
}

if (utils.haveWeb) {
	var conv_impl = require('./conv_web').default;
} else if (utils.haveNode) {
	var conv_impl = require('./conv_web').default;
} else {
	throw new Error('Unimplementation');
}

export class WSConversation extends (conv_impl as typeof WSConversationIMPL) {}

interface CallData extends Data {
	ok(e: any): void;
	err(e: Error): void;
	timeout?: number;
	cancel?: boolean;
}

/**
 * @class WSClient
 */
export class WSClient extends Notification implements conv.MessageHandle {

	private m_calls: Map<number, CallData> = new Map();
	private m_loaded = false;
	private m_sends: CallData[] = [];
	private m_service_name: string;
	private m_conv: conv.WSConversation;
	private m_Intervalid: any;

	get name() { return this.m_service_name }
	get conv() { return this.m_conv }
	get loaded() { return this.m_loaded }

	readonly onLoad = new EventNoticer('Load', this);

	/**
	 * @constructor constructor(service_name, conv)
	 */
	constructor(service_name: string, conv: conv.WSConversation) {
		super();

		this.m_service_name = service_name;
		this.m_conv = conv;

		utils.assert(service_name);
		utils.assert(this.m_conv);

		this.m_conv.onOpen.on(e=>{
			this.m_Intervalid = setInterval(e=>this._checkTimeout(), 3e4); // 30s
		});

		this.m_conv.onClose.on(async e=>{
			this.m_loaded = false;
			var err = Error.new(errno.ERR_CONNECTION_DISCONNECTION);
			for (var [,handle] of this.m_calls) {
				handle.cancel = true;
				handle.err(err);
			}
			clearInterval(this.m_Intervalid);
			this.m_sends = []; // clear calling
		});

		this.addEventListener('Load', async e=>{
			console.log('CLI Load', conv.url.href);
			(<any>this).m_conv.m_token = e.data.token; // TODO private visit
			this.m_loaded = true;
			var sends = this.m_sends;
			this.m_sends = [];
			// await util.sleep(1000); // 
			for (var data of sends) {
				if (!data.cancel) {
					// console.log('CLI Load send');
					this._send(data).catch(data.err);
				}
			}
		});

		this.m_conv.bind(this);
	}

	private _checkMethodName(method: string) {
		utils.assert(/^[a-z]/i.test(method), errno.ERR_FORBIDDEN_ACCESS);
	}

	/**
	 * @func receiveMessage(msg)
	 */
	async receiveMessage(msg: DataBuilder) {
		var self = this;
		var { data, name = '', cb, sender } = msg;

		if (msg.isCallback()) {
			var handle = this.m_calls.get(cb as number);
			if (handle) {
				if (msg.error) { // throw error
					handle.err(Error.new(msg.error));
				} else {
					handle.ok(data);
				}
			}
		} else {
			var r: { data?: any, error?: Error } = {};
			if (msg.isCall()) {
				this._checkMethodName(name);
				if (print_log) 
					console.log('WSClient.Call', `${self.name}.${name}(${JSON.stringify(data, null, 2)})`);
				try {
					r.data = await self.handleCall(name, data || {}, sender || '');
				} catch(e: any) {
					r.error = e;
				}
			} else if (msg.isEvent()) {
				// console.log('CLI Event receive', name);
				try {
					var evt = new Event(data||{}, sender || '');
					this.triggerWithEvent(name, evt); // TODO
				} catch(err) {
					console.error(err);
				}
			} else {
				return;
			}

			if (cb) {
				self.m_conv.sendFormatData(Object.assign(r, {
					service: self.m_conv._service(self.name),
					type: Types.T_CALLBACK, 
					cb: cb,
				})).catch(console.warn); // callback
			}
		}

	}

	/**
	 * @class handleCall
	 */
	protected handleCall(method: string, data: any, sender?: string) {
		if (method in WSClient.prototype)
			throw Error.new(errno.ERR_FORBIDDEN_ACCESS);
		var fn = (<any>this)[method];
		if (typeof fn != 'function')
			throw Error.new(String.format('"{0}" no defined function', method));
		return fn.call(this, data, sender);
	}

	private async _send(data: CallData) {
		if (this.m_loaded) {
			await this.m_conv.sendFormatData(data);
			delete data.data;
		} else {
			this.m_sends.push(data);
			this.m_conv.connect(); // 尝试连接
		}
		return data;
	}

	private _checkTimeout() {
		var now = Date.now();
		for (var [,handle] of this.m_calls) {
			if (handle.timeout) {
				if (handle.timeout < now) { // timeouted
					handle.err(Error.new([...errno.ERR_METHOD_CALL_TIMEOUT,
						`Method call timeout, ${this.name}/${handle.name}`]));
					handle.cancel = true;
				}
			}
		}
	}

	private _call<T = any>(type: Types, name: string, data?: any, timeout?: number, sender?: string) {
		return utils.promise(async (resolve: (e?: T)=>void, reject)=>{
			var id = utils.id;
			var calls = this.m_calls;
			calls.set(id, <CallData>await this._send({
				timeout: timeout ? timeout + Date.now(): 0,
				ok: (e: any)=>(calls.delete(id),resolve(e)),
				err: (e: Error)=>(calls.delete(id),reject(e)),
				service: this.m_conv._service(this.name),
				type: type,
				name: name,
				data: data,
				cb: id,
				sender: sender,
			}));
		});
	}

	/**
	 * @func call(method, data, timeout)
	 */
	call<T = any>(method: string, data?: any, timeout = METHOD_CALL_TIMEOUT, sender?: string) {
		return this._call<T>(Types.T_CALL, method, data, timeout, sender);
	}

	/**
	 * @func send(method, data, sender) method call
	 */
	async send(method: string, data?: any, sender?: string) {
		await this._send({
			ok: ()=>{},
			err: ()=>{},
			service: this.conv._service(this.name),
			type: Types.T_CALL,
			name: method,
			data: data,
			sender: sender,
		});
	}

}
