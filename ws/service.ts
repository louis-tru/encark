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
import {Service} from '../service';
import {Session} from '../session';
import errno from '../errno';
import {Types, DataBuilder, Data} from './data';
import * as conv from './conv';

export const METHOD_CALL_TIMEOUT = 12e4; // 120s

interface CallData extends Data {
	ok(e: any): void;
	err(e: Error): void;
	timeout?: number;
	cancel?: boolean;
}

/**
 * @class WSService
 */
export class WSService extends Service implements conv.MessageHandle {

	private m_conv: conv.WSConversation;
	private m_session: Session | null = null;
	private m_calls = new Map<number, CallData>();
	private m_loaded = false;
	private m_Intervalid: any;
	
	get conv() {
		return this.m_conv;
	}

	get session() {
		if (!this.m_session) {
			this.m_session = new Session(this);
		}
		return this.m_session;
	}

	get loaded() {
		return this.m_loaded;
	}

	constructor(conv: conv.WSConversation) {
		super(conv.request);
		this.m_conv = conv;
		this.m_Intervalid = setInterval(()=>this._checkInterval(), 3e4); // 30s

		this.m_conv.onClose.on(async ()=>{
			var err = Error.new(errno.ERR_CONNECTION_DISCONNECTION);
			for (var [,handle] of this.m_calls) {
				handle.cancel = true;
				handle.err(err);
			}
			clearInterval(this.m_Intervalid);
		});
	}

	async load() {}
	async destroy() {}

	private _checkMethodName(method: string) {
		utils.assert(/^[a-z]/i.test(method), errno.ERR_FORBIDDEN_ACCESS);
	}

	/**
	 * @fun receiveMessage() # 消息处理器
	 */
	async receiveMessage(msg: DataBuilder) {
		if (!this.m_loaded) 
			console.warn('Unable to process message WSService.receiveMessage, loaded=false');

		var self = this;
		var { data, name = '', cb, sender } = msg;

		if (msg.isCallback()) {
			var handle = this.m_calls.get(<number>cb);
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
				if (this.server.printLog) 
					console.log('WSClient.Call', `${self.name}.${name}(${JSON.stringify(data, null, 2)})`);
				try {
					r.data = await self.handleCall(name, data || {}, sender || '');
				} catch(e) {
					r.error = e;
				}
			} /*else if (msg.isEvent()) { // none event
				try {
					this.trigger(name, data);
				} catch(err) {
					console.error(err);
				}
			} */ else {
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
	 * @func handleCall
	 */
	private handleCall(method: string, data: any, sender?: string) {
		if (method in WSService.prototype)
			throw Error.new(errno.ERR_FORBIDDEN_ACCESS);
		var fn: (data: any, sender?: string)=>any = (<any>this)[method];
		if (typeof fn != 'function')
			throw Error.new(String.format('"{0}" no defined function', method));
		return fn.call(this, data, sender);
	}

	async _send(data: CallData) {
		await this.m_conv.sendFormatData(data);
		delete data.data;
		return data;
	}

	private _checkInterval() {
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

	private _call<T = any>(type: Types, name: string, data: any, timeout?: number, sender?: string) {
		return utils.promise(async (resolve: (e?: T)=>void, reject)=>{
			var id = utils.id;
			var calls = this.m_calls;
			calls.set(id, <CallData>await this._send({
				timeout: timeout ? timeout + Date.now(): 0,
				ok: (e: any)=>(calls.delete(id),resolve(e)),
				err: (e: Error)=>(calls.delete(id),reject(e)),
				service: this.conv._service(this.name),
				type: type,
				name: name,
				data: data,
				cb: id,
				sender: sender,
			}));
			// console.log('SER send', name);
		});
	}

	async _trigger(event: string, data?: any, sender?: string) {
		await this._send({
			ok: ()=>{},
			err: ()=>{},
			service: this.conv._service(this.name),
			type: Types.T_EVENT,
			name: event,
			data: data,
			sender: sender,
		});
	}

	/**
	 * @func call(method, data)
	 * @async
	 */
	call<T = any>(method: string, data?: any, timeout = METHOD_CALL_TIMEOUT, sender?: string) {
		return this._call<T>(Types.T_CALL, method, data, timeout, sender);
	}

	/**
	 * @func  trigger(event, data)
	 * @async
	 */
	trigger(event: string, data?: any, sender?: string) {
		return this._trigger(event, data, sender);
	}

	/**
	 * @func send(method, data, sender) method call, No response
	 * @async
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

WSService.type = 'event';