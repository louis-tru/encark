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

import {Buffer} from 'buffer';

export type TypedArray = Uint8Array | Uint8ClampedArray | Uint16Array | 
	Uint32Array | Int8Array | Int16Array | Int32Array | Float32Array | Float64Array;
export type ArrayBufferView = TypedArray | DataView;

export type Bytes = Uint8Array | Uint8ClampedArray | InterfaceBuffer;
export type BinaryLike = ArrayBufferView | ArrayBuffer | SharedArrayBuffer | InterfaceBuffer;

const _bufferDefault = _buffer.default;

export type BufferEncoding = 
	"ascii" | "utf8" | "utf-8" | "base64" | "latin1" | "binary" | "hex";

new Buffer('')

export function byteLength(
	string: string | BinaryLike,
	encoding?: BufferEncoding): number {
	if (typeof string !== 'string') {
		if ('byteLength' in string
			/*string as BinaryLike */
			/*string instanceof ArrayBuffer || string instanceof TypedArray*/) {
			return string.byteLength;
		}
		throw _bufferDefault.invalidArgType(string, 
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

// type Buffer = InterfaceBuffer;

/**
 * @class BufferIMPL
 */
class BufferIMPL extends Uint8Array implements InterfaceBuffer {

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

	copy(targetBuffer: InterfaceBuffer, targetStart?: number, sourceStart?: number, sourceEnd?: number): number {
		return _bufferDefault.copy(this, targetBuffer, targetStart, sourceStart, sourceEnd);
	}

	clone(start?: number, end?: number): InterfaceBuffer {
		return this.slice(start, end);
	}

	slice(start?: number, end?: number): InterfaceBuffer {
		return new BufferIMPL(super.slice(start, end).buffer);
	}

	filter(callbackfn: (value: number, index: number, array: InterfaceBuffer) => any, thisArg?: any): InterfaceBuffer {
		return new BufferIMPL(super.filter(
			<(value: number, index: number, array: Uint8Array) => any>callbackfn, thisArg).buffer);
	}
	
	map(callbackfn: (value: number, index: number, array: Buffer) => number, thisArg?: any): InterfaceBuffer {
		return new BufferIMPL(super.map(
			<(value: number, index: number, array: Uint8Array) => number>callbackfn, thisArg).buffer);
	}

	reverse(): InterfaceBuffer {
		return new BufferIMPL(super.reverse().buffer);
	}

	some(callbackfn: (value: number, index: number, array: InterfaceBuffer) => unknown, thisArg?: any): boolean {
		return super.some(<(value: number, index: number, array: Uint8Array) => unknown>callbackfn, thisArg);
	}

	subarray(begin?: number, end?: number): InterfaceBuffer {
		return new BufferIMPL(super.subarray(begin, end).buffer);
	}

	static isBuffer(buffer: any) {
		return buffer instanceof BufferIMPL;
	}

	static byteLength(string: string | BinaryLike, encoding?: BufferEncoding): number {
		return byteLength(string, encoding);
	}

	static from(
		value: string | BinaryLike | Iterable<number> | ArrayLike<number>,
		encodingOrMapfn?: BufferEncoding | ((v: number, k: number) => number),
		thisArg?: any): InterfaceBuffer 
	{
		if (typeof value === 'string') {
			var encoding: BufferEncoding = typeof encodingOrMapfn == 'string' ? encodingOrMapfn : 'utf8';
			if (encoding == 'utf8' || encoding == 'utf-8') {
				return new BufferIMPL(_codec.encodeUTF8(value));
			} else if (encoding == 'hex') {
				return new BufferIMPL(_codec.decodeHex(value));
			} else if (encoding == 'base64') {
				return new BufferIMPL(_codec.decodeBase64(value));
			} else if (encoding == 'latin1' || encoding == 'binary') {
				return new BufferIMPL(_codec.encodeLatin1From(value));
			} else if (encoding == 'ascii') {
				return new BufferIMPL(_codec.encodeAsciiFrom(value));
			} else {
				return new BufferIMPL(_codec.encodeUTF8(value));
			}
		} else if (value instanceof ArrayBuffer || value instanceof SharedArrayBuffer) {
			return new BufferIMPL(value);
		} else {
			var bf = Uint8Array.from(<any>value, <any>encodingOrMapfn, thisArg);
			(<any>bf).__proto__ = BufferIMPL.prototype;
			return <InterfaceBuffer>bf;
		}
	}

	static alloc(size: number): InterfaceBuffer {
		return new BufferIMPL( Number(size) || 0);
	}

	static allocUnsafe(size: number): InterfaceBuffer {
		return new BufferIMPL( Number(size) || 0);
		
	}

	static concat(list: (Bytes | ArrayLike<number>)[], length?: number): InterfaceBuffer {
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

		var bf = new BufferIMPL(length);
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

if ( !(<any>globalThis).Buffer ) {
	(<any>globalThis).Buffer = BufferIMPL;
}

export const Zero = BufferIMPL.alloc(0);

export default BufferIMPL;
