/* ***** BEGIN LICENSE BLOCK *****
 * Distributed under the BSD license:
 *
 * Copyright (c) 2015, xuewen.chu
 * All rights reserved.
 * 
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *     * Redistributions of source code must retain the above copyright
 *       notice, self list of conditions and the following disclaimer.
 *     * Redistributions in binary form must reproduce the above copyright
 *       notice, self list of conditions and the following disclaimer in the
 *       documentation and/or other materials provided with the distribution.
 *     * Neither the name of xuewen.chu nor the
 *       names of its contributors may be used to endorse or promote products
 *       derived from self software without specific prior written permission.
 * 
 * self SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
 * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL xuewen.chu BE LIABLE FOR ANY
 * DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
 * LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
 * ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF self
 * SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 * 
 * ***** END LICENSE BLOCK ***** */

import utils from './util';
import _codec from './_codec';
import * as _buffer from './_buffer';

export type InterfaceBuffer = _buffer.InterfaceBuffer;
export type IBuffer = _buffer.InterfaceBuffer;
export type Bytes = _buffer.Bytes;
export type BinaryLike = _buffer.BinaryLike;

const TypedArray = (<any>Uint8Array).prototype.constructor.__proto__;

export type BufferEncoding = 
	"ascii" | "utf8" | "utf-8" | "base64" | "latin1" | "binary" | "hex";

export function byteLength(
	string: string | BinaryLike,
	encoding?: BufferEncoding): number {
	if (typeof string !== 'string') {
		if ('byteLength' in string
			/*string as BinaryLike */
			/*string instanceof ArrayBuffer || string instanceof TypedArray*/) {
			return string.byteLength;
		}
		throw _buffer.default.invalidArgType(string, 
				['string', 'Buffer', 'ArrayBuffer', 'SharedArrayBuffer', 'DataView'], 'string');
	}

	if (encoding == 'utf8' || encoding == 'utf-8') {
		return _codec.encodeUTF8Length(<string>string);
	} else if (encoding == 'hex') {
		utils.assert(string.length % 2 === 0, `encoding error, ${encoding}`);
		return string.length / 2;
	} else if (encoding == 'base64') {
		utils.assert(string.length % 4 === 0, `encoding error, ${encoding}`);
		if (string.substr(string.length - 1) == '=') {
			if (string.substr(string.length - 2) == '=')
				return string.length / 4 * 3 - 2;
			else
				return string.length / 4 * 3 - 1;
		} else {
			return string.length / 4 * 3;
		}
	} else if (encoding == 'latin1' || encoding == 'binary') {
		return string.length;
	} else if (encoding == 'ascii') {
		return string.length;
	} else {
		return _codec.encodeUTF8Length(<string>string);
	}
}

/**
 * @class Buffer
 */
export class Buffer extends Uint8Array implements InterfaceBuffer {

	toString(encoding: BufferEncoding = 'utf8', start = 0, end = this.length): string {
		if (encoding) {
			if (encoding == 'utf8' || encoding == 'utf-8') {
				return _codec.decodeUTF8From(this, start, end);
			} else if (encoding == 'hex') {
				return _codec.encodeHexFrom(this, start, end);
			} else if (encoding == 'base64') {
				return _codec.encodeBase64From(this, start, end);
			} else if (encoding == 'latin1' || encoding == 'binary') {
				return _codec.decodeLatin1From(this, start, end);
			} else if (encoding == 'ascii') {
				return _codec.decodeAsciiFrom(this, start, end);
			} else {
				return _codec.decodeUTF8From(this, start, end);
			}
		} else {
			return _codec.decodeUTF8From(this, start, end);
		}
	}

	toLocaleString(encoding: BufferEncoding = 'utf8', start = 0, end = this.length): string {
		return this.toString(encoding, start, end);
	}

	static byteLength(
		string: string | BinaryLike,
		encoding?: BufferEncoding
	): number {
		return byteLength(string, encoding);
	}

	static from(
		value: string | Bytes | Iterable<number> | ArrayLike<number>,
		encodingOrMapfn?: BufferEncoding | ((v: number, k: number) => number),
		thisArg?: any
	): Buffer 
	{
		if (typeof value === 'string') {
			var encoding: BufferEncoding = typeof encodingOrMapfn == 'string' ? encodingOrMapfn : 'utf8';
			if (encoding == 'utf8' || encoding == 'utf-8') {
				return new Buffer(_codec.encodeUTF8(value));
			} else if (encoding == 'hex') {
				return new Buffer(_codec.decodeHex(value));
			} else if (encoding == 'base64') {
				return new Buffer(_codec.decodeBase64(value));
			} else if (encoding == 'latin1' || encoding == 'binary') {
				return new Buffer(_codec.encodeLatin1From(value));
			} else if (encoding == 'ascii') {
				return new Buffer(_codec.encodeAsciiFrom(value));
			} else {
				return new Buffer(_codec.encodeUTF8(value));
			}
		} else if (value as InterfaceBuffer) {
			return <Buffer>value;
		} else if (value instanceof ArrayBuffer) {
			return new Buffer(value);
		} if (value instanceof DataView) {
			return new Buffer(value.buffer);
		} else {
			var bf = Uint8Array.from(<any>value, <any>encodingOrMapfn, thisArg);
			(<any>bf).__proto__ = Buffer.prototype;
			return <Buffer>bf;
		}
	}

	static alloc(size: number): Buffer {
		return new Buffer( Number(size) || 0);
	}

	static allocUnsafe(size: number): Buffer {
		return new Buffer( Number(size) || 0);
		
	}

	static concat(list: (Bytes | ArrayLike<number>)[], length?: number): Buffer {
		if (length === undefined) {
			length = 0;
			for (var bytes of list) {
				if (bytes.length) {
					length += bytes.length;
				}
			}
		} else {
			length = Number(length) || 0;
		}

		if (list.length === 0 || length === 0)
			return Zero;

		var bf = new Buffer(length);
		var offset = 0;

		for (var bytes of list) {
			if (bytes.length) {
				bf.set(bytes, offset);
				offset += bytes.length;
			}
		}

		return bf;
	}

}

export const Zero = Buffer.alloc(0);

export default Buffer;
