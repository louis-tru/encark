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

import utils from '../../util';
import url, {URL} from '../../path';
import errno from '../../errno';
import { Types } from '../data';
import { ConversationBasic, KEEP_ALIVE_TIME } from '../_conv';
export * from '../_conv';
import { Signer } from '../../request';
import { EventNoticer } from '../../event';
import * as cli from './index';

var USE_GZIP_DATA = false;

/**
 * @class WSConversation
 */
export abstract class WSConversation extends ConversationBasic {

	protected m_connect = false; // 是否尝试连接中
	protected m_signer: Signer | null = null;
	private   m_IntervalId: any;
	protected m_url: URL;
	private   m_autoReconnect = 0; // reconnect time

	readonly onError = new EventNoticer<Error>('Error', this);

	get autoReconnect() {
		return this.m_autoReconnect;
	}

	set autoReconnect(value: number) {
		this.m_autoReconnect = Math.min(Math.max(0, Number(value) || 0), 5e3);
	}

	get keepAliveTime() {
		return this.m_KEEP_ALIVE_TIME;
	}

	set keepAliveTime(value) {
		this.m_KEEP_ALIVE_TIME = Math.max(5e3, Number(value) || KEEP_ALIVE_TIME);
		this._keepAlive();
	}

	get url() {
		return this.m_url;
	}

	private _keepAlive() {
		this._clearKeepAlive();
		if (this.m_isOpen) {
			this.m_IntervalId = setInterval(()=>{
				if (this.keepAliveTime * 2 + this.lastPacketTime < Date.now()) {
					this._error(Error.new(errno.ERR_WS_CLIENT_NO_ALIVE));
					this.close();
				} else {
					this.ping();
				}
			}, utils.random(0, Math.floor(this.m_KEEP_ALIVE_TIME / 10)) + this.m_KEEP_ALIVE_TIME);
		}
	}

	private _clearKeepAlive() {
		if (this.m_IntervalId) {
			clearInterval(this.m_IntervalId);
			this.m_IntervalId = 0;
		}
	}

	private _autoReconnect(reason: string) {
		if (!this.m_isOpen && this.m_autoReconnect) { // keep connect
			utils.sleep(this.m_autoReconnect).then(()=>{
				console.log(`Reconnect ${reason} Clo.. ${this.m_url.href}`);
				this.connect();
			});
		}
	}

	setGzip(value: boolean) {
		utils.assert(!this.m_isOpen, 'Can only be set before opening');
		this.m_isGzip = !!value;
	}

	constructor(path: string) {
		super();
		path = path || utils.config.web_service || 'ws://localhost';
		utils.assert(path, 'Server path is not correct');
		path = url.resolve(path);
		this.m_url = new URL(path.replace(/^http/, 'ws'));
	}

	protected bindServices(services: string[]): Promise<void> {
		throw Error.new(errno.ERR_METHOD_UNREALIZED);
	}

	/**
	 * @fun bind # 绑定
	 * @arg client {Client}
	 */
	bind(client: cli.WSClient) {
		var name = client.name;
		if (name in this.m_handles) {
			throw new Error('No need to repeat binding');
		} else {
			if (!this.m_default_service)
				this.m_default_service = name;
			this.m_handles[name] = client;
			this.m_services_count++;
			if (this.m_isOpen) {
				this.sendFormatData({ service: name, type: Types.T_BIND });
			} else {
				utils.nextTick(()=>this.connect()); // 还没有打开连接,下一帧开始尝试连接
			}
		}
	}

	protected /*async */_open() {
		utils.assert(!this.m_isOpen);
		utils.assert(this.m_connect);
		// await utils.sleep(1e2); // 100ms
		this.m_isOpen = true;
		this.m_connect = false;
		this.m_last_packet_time = Date.now();
		this.m_overflow = false;
		this.onOpen.trigger({});
		this._keepAlive();
	}

	protected _error(err: Error) {
		if (this.m_connect)
			this.close();
		utils.nextTick(()=>this.onError.trigger(err));
		this._autoReconnect('Error');
	}

	get signer() {
		return this.m_signer;
	}

	set signer(value) {
		if (value) {
			utils.assert(value instanceof Signer, 'Type Error');
			this.m_signer = value;
		}
	}

	/**
	 * @rewrite
	 * @func getRequestHeaders
	 */
	getRequestHeaders(): Dict | null {
		return null;
	}

	/**
	 * @fun close # close conversation connection
	 */
	close() {
		if (this.m_connect) {
			// console.log('**** close conversation connection');
			this.m_connect = false;
		}
		if (this.m_isOpen) {
			this.m_isOpen = false;
			this.m_token = '';
			this._clearKeepAlive();
			this.onClose.trigger({});
			this._autoReconnect('Close');
			console.log('CLI Conversation Close', (<any>this).m_url?.href);
		}
	}

	/**
	 * @fun connect # connercion server
	 */
	connect() {
		if (!this.m_isOpen && !this.m_connect) {
			utils.assert(this.m_default_service, 'connection must bind service'); // 连接必需要绑定服务才能使用
			console.log('Connection..', (<any>this).m_url?.href, this.m_connect);
			this.m_connect = true;
			this.initialize();
		}
	}

	/**
	 * @fun init # init conversation
	 */
	abstract initialize(): void;

}

export default {
	get USE_GZIP_DATA() { return USE_GZIP_DATA },
	set USE_GZIP_DATA(value: boolean) { USE_GZIP_DATA = value },
};
