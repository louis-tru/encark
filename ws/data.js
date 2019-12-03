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

const jsonb = require('../jsonb');
const TYPES = {
	T_BIND: 0xf1,
	T_EVENT: 0xf2,
	T_CALL: 0xf3,
	T_CALLBACK: 0xf4,
	T_PING: 0xf5,
	T_PONG: 0xf6,
};

if (require('../util').haveNode) {
	var zlib = require('zlib');
}

function ungzip(buffer) {
	return zlib ? new Promise((resolve, reject)=>{
		zlib.inflateRaw(buffer, function (err, data) {
			if (err) {
				reject(err);
			} else {
				resolve(data);
			}
		});
	}): buffer;
}

function gzip(buffer) {
	return zlib ? new Promise((resolve, reject)=>{
		zlib.deflateRaw(buffer, function (err, data) {
			if (err) {
				reject(err);
			} else {
				resolve(data);
			}
		});
	}): buffer;
}

var PING_BUFFER = jsonb.binaryify(TYPES.T_PING);
var PONG_BUFFER = jsonb.binaryify(TYPES.T_PONG);

function toBuffer(data, isGzip) {
	data = jsonb.binaryify(data);
	if (isGzip) {
		return gzip(data);
	}
	return data;
}

/**
 * @class DataFormater
 */
class DataFormater {

	constructor(data) {
		Object.assign(this, data);
	}

	static async parse(packet, isText, isGzip = false) {
		try {
			if (!isText && packet.length === 2) { // PING_BUFFER, PONG_BUFFER
				var type = packet[1];
				if (type == TYPES.T_PING || type == TYPES.T_PONG) {
					return new DataFormater({type});
				}
			}
			var [type,service,name,data,error,cb,sender] = isText ? 
				JSON.parse(packet): jsonb.parse(isGzip ? await ungzip(packet): packet);
			return new DataFormater({type,service,name,data,error,cb,sender});
		} catch(err) {
			console.warn('no parse EXT buffer data', err);
		}
	}

	toBuffer(isGzip = false) {
		return toBuffer([
			this.type, this.service, this.name,
			this.data, this.error, this.cb, this.sender
		], isGzip);
	}

	toJSON() {
		return [
			this.type, this.service, this.name,
			this.data, this.error, this.cb, this.sender
		];
	}

	isPing() {
		return this.type == TYPES.T_OING;
	}

	isPong() {
		return this.type == TYPES.T_PONG;
	}

	isBind() {
		return this.type == TYPES.T_BIND;
	}

	isEvent() {
		return this.type == TYPES.T_EVENT;
	}

	isCall() {
		return this.type == TYPES.T_CALL;
	}

	isCallback() {
		return this.type == TYPES.T_CALLBACK;
	}
	
}

module.exports = Object.assign({ DataFormater, PING_BUFFER, PONG_BUFFER }, TYPES);