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
import buffer from '../../buffer';
import errno from '../../errno';
import {PING_BUFFER,PONG_BUFFER} from '../data';
import {WSConversationBasic, SendData} from './conv';

const WebSocket = globalThis.WebSocket;

// Web implementation
export default class WebConversation extends WSConversationBasic {

	private m_req: any;

	setGzip(value: boolean) {
		// web disable gzip
	}

	/**
	 * @ovrewrite 
	 */
	initialize() {
		utils.assert(!this.m_req, 'No need to repeat open');

		var self = this;
		var url = this.m_url;
		var bind_services = Object.keys(this.m_handles).join(',');
		var headers = this.getRequestHeaders() || {};

		if (this.m_signer) {
			Object.assign(headers, this.m_signer.sign(url.path));
		}
		url.setParam('_headers', JSON.stringify(headers));
		url.setParam('bind_services', bind_services);

		var req = this.m_req = new WebSocket(url.href);

		req.onopen = function(e) {
			console.log('CLI WebConversation Upgrade', self.m_url.href);

			if (!self.m_connect) {
				self.close(); return;
			}
			// self.m_token = res.headers['session-token'] || '';

			req.onmessage = function(e) {
				var data = e.data;
				if (data instanceof ArrayBuffer) {
					self.handlePacket(buffer.from(data), false);
				} else if (data instanceof Blob && (<any>data).arrayBuffer) { // Compatible with old browser
					(<any>data).arrayBuffer().then((e: any)=>self.handlePacket(buffer.from(e), false));
				} else { // string
					self.handlePacket(data, true);
				}
			};

			req.onclose = function(e) {
				self.close();
			};

			self._open();
		};

		req.binaryType = 'arraybuffer';

		req.onerror = function(e: Event) {
			console.log('CLI WebConversation error', self.m_url.href);
			self._error(Error.new(e));
			self.close();
		};

		console.log('CLI WebConversation init', self.m_url.href, self.m_connect);
	}

	/**
	 * @ovrewrite 
	 */
	close() {
		var req = this.m_req;
		if (req) {
			this.m_req = null;
			try {
				req.close();
			} catch(err) {
				console.error(err);
			}
		}
		super.close();
	}

	/**
	 * @ovrewrite 
	 */
	async send(data: SendData) {
		utils.assert(this.isOpen, errno.ERR_CONNECTION_CLOSE_STATUS);
		if (data instanceof ArrayBuffer) {
			this.m_req.send(data);
		} else if (typeof data == 'string') {  // send json string message
			this.m_req.send(data);
		} else {
			this.m_req.send(data.buffer);
		}
	}

	/**
	 * @ovrewrite 
	 */
	async ping() {
		utils.assert(this.isOpen, errno.ERR_CONNECTION_CLOSE_STATUS);
		this.m_req.send(PING_BUFFER);
	}

	/**
	 * @ovrewrite 
	 */
	async pong() {
		utils.assert(this.isOpen, errno.ERR_CONNECTION_CLOSE_STATUS);
		this.m_req.send(PONG_BUFFER);
	}

}
