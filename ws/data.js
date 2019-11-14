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

var utils = require('../util');
var jsonb = require('../jsonb');
var EXT_PING_MARK = '\ufffe';
var TYPES = {
	T_BIND: 0xf1,
	T_EVENT: 0xf2,
	T_CALL: 0xf3,
	T_CALLBACK: 0xf4,
};

if (require('../util').haveNode) {
	var zlib = require('zlib');
}

function isValidEXT(type) {
	return type >= TYPES.T_BIND && type < 0xff;
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

/**
 * @class DataFormater
 */
class DataFormater {
	constructor(data) {
		Object.assign(this, data);
	}
	static async parse(packet, isText, isGzip = false) {
		if (isText) { // JSON data
			if (packet.length == 1 && packet == EXT_PING_MARK) {
				return Object.assign(new DataFormater(), {ping: true});
			}
		}
		try {
			var [type,service,name,data,error,cb] = isText ? 
				JSON.parse(packet): jsonb.parse(isGzip ? await ungzip(packet): packet);
			return Object.assign(new DataFormater(), {type,service,name,data,error,cb});
		} catch(err) {
			console.warn('no parse EXT buffer data', err, packet);
			return new DataFormater();
		}
	}
	toBuffer(isGzip = false) {
		var buffer = jsonb.binaryify([
			this.type, this.service, this.name,
			this.data, this.error, this.cb,
		]);
		if (isGzip) {
			return gzip(buffer);
		}
		return buffer;
	}
	toJSON() {
		return [
			this.type, this.service, this.name,
			this.data, this.error, this.cb,
		];
	}
	isPing() {
		return this.ping;
	}
	isValidEXT() {
		return isValidEXT(this.type);
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

module.exports = Object.assign({ 
	EXT_PING_MARK, DataFormater,
}, TYPES);
