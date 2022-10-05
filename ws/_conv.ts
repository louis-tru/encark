/* ***** BEGIN LICENSE BLOCK *****
 * Distributed under the BSD license:
 *
 * Copyright (c) 2015, blue.chu
 * All rights reserved.
 * 
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *     * Redistributions of source code must retain the above copyright
 *       notice, this list of conditions and the following disclaimer.
 *     * Redistributions in binary form must reproduce the above copyright
 *       notice, this list of conditions and the following disclaimer in the
 *       documentation and/or other materials provided with the distribution.
 *     * Neither the name of blue.chu nor the
 *       names of its contributors may be used to endorse or promote products
 *       derived from this software without specific prior written permission.
 * 
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
 * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL blue.chu BE LIABLE FOR ANY
 * DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
 * LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
 * ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
 * SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 * 
 * ***** END LICENSE BLOCK ***** */

import utils from '../util';
import { DataBuilder, Types, Data } from './data';
import buffer, { Zero, IBuffer } from '../buffer';
import {EventNoticer, Event} from '../event';

export const KEEP_ALIVE_TIME = 5e4; // 50s

export interface MessageHandle {
	receiveMessage(data: Data): Promise<void>;
}

export abstract class ConversationBasic {

	protected m_overflow = false;
	protected m_last_packet_time = Date.now();
	protected m_KEEP_ALIVE_TIME = KEEP_ALIVE_TIME;
	protected m_isGzip = false;
	protected m_replyPong = true;
	protected m_handles: Dict<MessageHandle> = {};
	protected m_services_count = 0;
	protected m_token = '';
	protected m_isOpen = false;
	protected m_default_service = '';

	readonly onClose = new EventNoticer('Close', this);
	readonly onOpen = new EventNoticer('Open', this);
	readonly onPing = new EventNoticer<Event<ConversationBasic, IBuffer>>('Ping', this);
	readonly onPong = new EventNoticer<Event<ConversationBasic, IBuffer>>('Pong', this);
	readonly onDrain = new EventNoticer('Drain', this);
	readonly onOverflow = new EventNoticer('Overflow', this);

	get overflow() {
		return this.m_overflow;
	}

	get lastPacketTime() {
		return this.m_last_packet_time;
	}

	get keepAliveTime() {
		return this.m_KEEP_ALIVE_TIME;
	}

	set keepAliveTime(value) {
		this.m_KEEP_ALIVE_TIME = Math.max(5e3, Number(value) || KEEP_ALIVE_TIME);
	}

	get isGzip() {
		return this.m_isGzip;
	}

	get replyPong() {
		return this.m_replyPong;
	}

	get token() {
		return this.m_token;
	}

	get isOpen() {
		return this.m_isOpen;
	}

	_service(service: string) {
		return this.m_services_count == 1 ? undefined: service;
	}

	get handles() {
		return {...this.m_handles};
	}

	// server impl
	protected abstract bindServices(services: string[]): Promise<void>;

	/**
	 * @fun parse # parser message
	 * @arg packet {String|Buffer}
	 * @arg {Boolean} isText
	 */
	protected async handlePacket(packet: IBuffer | string, isText: boolean) {
		this.m_last_packet_time = Date.now();
		var data = await DataBuilder.parse(packet, isText, this.isGzip);
		if (!data)
			return;
		if (!this.isOpen)
			return console.warn('ConversationBasic.handlePacket, connection close status');

		switch (data.type) {
			case Types.T_BIND:
				this.bindServices([<string>data.service]).catch(console.warn);
				break;
			case Types.T_PING: // ping Extension protocol 
				this.handlePing(Zero);
				break;
			case Types.T_PONG: // pong Extension protocol 
				this.handlePong(Zero);
				break;
			default:
				var handle = this.m_handles[data.service || this.m_default_service];
				if (handle) {
					handle.receiveMessage(data).catch((e:any)=>console.warn(e));
				} else {
					console.log('Could not find the message handler, '+
											'discarding the message, ' + data.service);
				}
		}
	}

	handlePing(data: IBuffer) {
		this.m_last_packet_time = Date.now();
		if (this.replyPong)
			this.pong().catch(console.warn);
		this.onPing.trigger(data);
	}

	handlePong(data: IBuffer) {
		this.m_last_packet_time = Date.now();
		this.onPong.trigger(data);
	}

	async sendFormatData(data: Data) {
		var df = new DataBuilder(data);
		var bf = await df.builder(this.isGzip);
		await this.send(buffer.from(bf));
	}

	abstract send(data: IBuffer): Promise<void>;
	abstract ping(): Promise<void>;
	abstract pong(): Promise<void>;
	abstract close(): void;

	protected static write<A extends any[], R>(self: ConversationBasic, api: (...args: any[])=>R, args: A): Promise<void> {
		return utils.promise(function(resolve, reject) {
			var ok = api(...args, function(err?: Error) {
				if (err) {
					reject(Error.new(err));
				} else {
					resolve();
				}
			});
			if (!ok) {
				if (!self.m_overflow) {
					self.m_overflow = true;
					self.onOverflow.trigger({});
				}
			}
		});
	}
}

