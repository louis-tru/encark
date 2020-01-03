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
import jsonb from '../jsonb';
import {List} from '../event';

type Buffer = Uint8Array;

export enum Types {
	T_BIND = 0xf1,
	T_EVENT = 0xf2,
	T_CALL = 0xf3,
	T_CALLBACK = 0xf4,
	T_PING = 0xf5,
	T_PONG = 0xf6,
}

interface QValue {
	resolve(b: Buffer): void;
	reject(b: any): void
	result?: {
		error?: Error | null;
		data?: Buffer;
	}
}

interface Api {
	(buf: Buffer, callback: (error: Error | null, result: Buffer)=>void): void;
}

function gen_func(queue: List<QValue>, api: Api) {
	return function(buffer: Buffer): Promise<Buffer> {
		return new Promise((resolve, reject)=>{
			var item = queue.push({ resolve, reject });
			api(buffer, function (error, data) {
				(<QValue>item.value).result = { error, data };
				var first = queue.first;
				while (first) {
					var { result, resolve, reject } = (<QValue>first.value);
					if (result) {
						if (result.error) {
							reject(result.error);
						} else {
							resolve(<Buffer>result.data);
						}
						queue.shift();
						first = queue.first;
					} else {
						break;
					}
				}
			});
		})
	};
}

var _ungzip: (buffer: Buffer) => Promise<Buffer>;
var _gzip: (buffer: Buffer) => Promise<Buffer>;

if (utils.haveNode) {
	var zlib = require('zlib');
	_ungzip = gen_func(new List(), zlib.inflateRaw);
	_gzip = gen_func(new List(), zlib.deflateRaw);
}

function ungzip(buffer: Buffer) {
	return zlib ? _ungzip(buffer): buffer;
}

export const PING_BUFFER = jsonb.binaryify(Types.T_PING);
export const PONG_BUFFER = jsonb.binaryify(Types.T_PONG);

function toBuffer(data: any, isGzip: boolean): Promise<Uint8Array> {
	var bf = jsonb.binaryify(data);
	if (isGzip && _gzip) {
		return _gzip(bf);
	} else {
		return Promise.resolve(bf);
	}
}

export interface Data {
	type?: Types;
	service?: string;
	name?: string;
	data?: any;
	error?: Error;
	cb?: number;
	sender?: string;
}

export class DataBuilder {
	type?: Types;
	service?: string;
	name?: string;
	data?: any;
	error?: Error;
	cb?: number;
	sender?: string;

	constructor(opts: Data) {
		Object.assign(this, opts);
	}

	static async parse(packet: Buffer | string, isText: boolean, isGzip = false) {
		try {
			if (!isText && packet.length === 2) { // PING_BUFFER, PONG_BUFFER
				let type = packet[1];
				if (type == Types.T_PING || type == Types.T_PONG) {
					return new DataBuilder({type});
				}
			}
			var [type,service,name,data,error,cb,sender] = isText ? 
				JSON.parse(<string>packet): jsonb.parse(isGzip ? await ungzip(<Buffer>packet): <Buffer>packet);
			return new DataBuilder({type,service,name,data,error,cb,sender});
		} catch(err) {
			console.warn('no parse EXT buffer data', err, packet.length);
		}
	}

	builder(isGzip = false) {
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
		return this.type == Types.T_PING;
	}

	isPong() {
		return this.type == Types.T_PONG;
	}

	isBind() {
		return this.type == Types.T_BIND;
	}

	isEvent() {
		return this.type == Types.T_EVENT;
	}

	isCall() {
		return this.type == Types.T_CALL;
	}

	isCallback() {
		return this.type == Types.T_CALLBACK;
	}

}
