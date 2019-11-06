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

var hash_util = require('../hash/util');

var EXT_PING_MARK = '\ufffe';
var TYPES = {
	T_BIND: 0xf1,
	T_EVENT: 0xf2,
	T_CALL: 0xf3,
	T_CALLBACK: 0xf4,
};

function isValidEXT(type) {
	type >= TYPES.T_BIND && type < 0xff;
}

function decodeUTF8(buffer) {
	// to utf8 string
	return hash_util.bin2str_utf8(buffer);
}

function encodeUTF8(string) {
	// to buffer data
	return hash_util.str2bin(string);
}

/**
 * @class DataFormater
 */
class DataFormater {
	constructor(data) {
		Object.assign(this, data);
	}
	static parse(packet, isText) {
		if (isText) { // JSON data
			if (packet.length == 1 && packet == EXT_PING_MARK) {
				this.ping = true;
			} else {
				try {
					var [type,service,name,data,error,cb] = JSON.parse(packet);
					return Object.assign(new DataFormater(), {type,service,name,data,error,cb});
				} catch(err) {
					console.error(err);
				}
			}
		} else if (isValidEXT(packet[0])) { // buffer data
			try {
				// format: type|service...|0|name...|0|dataType|dataLen...|data...|cb
				var begin = 1, index, data;
				// read service:
				utils.assert((index = packet.indexOf(0, begin)) != -1);
				this.service = decodeUTF8(packet.slice(begin, index));
				begin = index + 1;
				// read name:
				utils.assert((index = packet.indexOf(0, begin)) != -1);
				this.name = decodeUTF8(packet.slice(begin, index));
				index++; // begin = index + 1;
				// read data:
				// dataFormat    | dataType
				// 0xf0          | 0x0f
				// 0: buffer     | 0: error
				// 1: json       | 1: data
				// dataLen:
				/*
					0   - 253   : 1,	len|data...
					254 - 65536 : 3,	254|len|len|data...
					65537 -     : 9,	255|len|len|len|len|len|len|len|len|data...
				*/
				// read data type:
				var dataFormat = packet[index] & 0xf0;
				utils.assert(dataFormat < 2);
				var dataType = packet[index] & 0x0f; index++;
				utils.assert(dataType < 2);

				// read data length:
				var dataLen = packet[index], end; index++;
				if (dataLen < 254) { // 0 - 253 byte length
					end = index + dataLen;
				} else if (dataLen < 255) { // 254 - 65536 byte length
					utils.assert(packet.length > index + 2);
					dataLen = (packet[index] << 8) | packet[index+1];
					index+=2;
					end = index + dataLen;
				} else { // 65537 - byte length
					dataLen = 0;
					utils.assert(packet.length > index + 8);
					for (var i = index + 8; index < i; index++) {
						dataLen |= packet[index];
						dataLen <<= 8;
					}
					end = index + dataLen;
				}
				utils.assert(packet.length > end);
				data = packet.slice(index, end);

				if (dataFormat == 1) { // json
					data = JSON.parse(decodeUTF8(data));
				}
				if (dataType == 1) { // data
					this.data = data;
				} else { // error
					this.error = data;
				}

				// read cb:
				var cb = 0;
				for ( index++; index < packet.length; index++ ) {
					cb |= packet[index];
					cb <<= 8;
				}
				this.cb = cb;

			} catch(err) {
				console.log('no parse EXT buffer data');
			}
		}
	}
	toBuffer() {
		var dataType = 1, dataFormat = 0;
		var data = this.data || '';
		if (this.error) {
			dataType = 0;
			data = this.error;
		}
		if (!(data instanceof Uint8Array)) {
			dataFormat = 1;
			data = encodeUTF8(JSON.stringify(data));
		}
		var service = encodeUTF8(this.service);
		var name = encodeUTF8(this.name || '');
		var dataLength = data.length;
		var headerLength = service.length + name.length + 5;
		var secondByte = dataLength;

		// format: type|service...|0|name...|0|dataType|dataLen...|data...|cb

		// dataFormat    | dataType
		// 0xf0          | 0x0f
		// 0: buffer     | 0: error
		// 1: json       | 1: data
		// dataLen:
		/*
			0   - 253   : 1,	len|data...
			254 - 65536 : 3,	254|len|len|data...
			65537 -     : 9,	255|len|len|len|len|len|len|len|len|data...
		*/
		if (dataLength > 65536) {
			headerLength += 8;
			secondByte = 255;
		} else if (dataLength > 253) {
			headerLength += 2;
			secondByte = 254;
		}
		// cb bytes
		var cb = [], i = this.cb;
		while (i) {
			cb.push(i & 0xff);
			i >>= 8;
		}
		// write header:
		var index = 0;
		var buffer = new Uint8Array(dataLength + headerLength + cb.length);
		buffer[index] = this.type; index++; // type
		buffer.set(service, index); index += service.length; // service
		buffer[index] = 0; index++;
		buffer.set(name, index); index += name.length; // name
		buffer[index] = 0; index++;
		buffer[index] = dataType | (dataFormat << 4); index++; // dataType
		buffer[index] = secondByte; index++; // secondByte
	
		// write data length header:
		switch (secondByte) {
			case 254:
				buffer[index] = dataLength >> 8; index++;
				buffer[index] = dataLength % 256; index++;
				break;
			case 255:
				var l = dataLength;
				for (var i = index + 7; i >= index; i--) {
					buffer[i] = l & 0xff;
					l >>= 8;
				}
				index += 8;
		}
		// write data:
		buffer.set(data, index); index += dataLength; // 
		// write cb:
		if (cb.length) {
			buffer.set(cb.reverse(), index);
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
	EXT_PING_MARK, DataFormater, decodeUTF8, encodeUTF8,
}, TYPES);
