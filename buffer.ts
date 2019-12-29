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
import _buffer, {ERR_INVALID_ARG_TYPE, ERR_OUT_OF_RANGE} from './_buffer';

const MathFloor = Math.floor;
const INTERFACE_BUFFER_TYPE = -12378;

export const TypedArrayConstructor = (<any>Uint8Array).prototype.__proto__.constructor;

export type TypedArray = Uint8Array | Uint8ClampedArray | Uint16Array | 
	Uint32Array | Int8Array | Int16Array | Int32Array | Float32Array | Float64Array;
export type ArrayBufferView = TypedArray | DataView;
export type Bytes = Uint8Array | Uint8ClampedArray;
export type BinaryLike = ArrayBufferView | ArrayBuffer | SharedArrayBuffer;
export type FromArg = string | BinaryLike | Iterable<number> | ArrayLike<number>;
export type Buffer = InterfaceBuffer;

export function isInterfaceBuffer(buffer: any) {
	if (buffer && buffer.__INTERFACE_BUFFER_TYPE__ == INTERFACE_BUFFER_TYPE)
		return true;
	return false;
}

export function isTypedArray(arr: TypedArray) {
	return arr instanceof TypedArrayConstructor;
}

export type BufferEncoding = 
	"ascii" | "utf8" | "utf-8" | "base64" | "latin1" | "binary" | "hex";

export interface InterfaceBuffer extends Uint8Array {
	toString(encoding?: string, start?: number, end?: number): string;
	copy(targetBuffer: Buffer, targetStart?: number, sourceStart?: number, sourceEnd?: number): number;
	clone(start?: number, end?: number): Buffer;
	slice(start?: number, end?: number): Buffer;
	filter(callbackfn: (value: number, index: number, array: Buffer) => any, thisArg?: any): Buffer;
	map(callbackfn: (value: number, index: number, array: Buffer) => number, thisArg?: any): Buffer;
	reverse(): Buffer;
	every(callbackfn: (value: number, index: number, array: Buffer) => unknown, thisArg?: any): boolean;
	some(callbackfn: (value: number, index: number, array: Buffer) => unknown, thisArg?: any): boolean;
	subarray(begin?: number, end?: number): Buffer;
	toJSON(): { type: 'InterfaceBuffer'; data: number[] };
	write(arg0: FromArg, offset?: number, encoding?: BufferEncoding): number;
	// read
	readInt8(offset?: number): number;
	readUInt8(offset?: number): number;
	readInt16BE(offset?: number): number;
	readUInt16BE(offset?: number): number;
	readInt32BE(offset?: number): number;
	readUInt32BE(offset?: number): number;
	readInt40BE(offset?: number): number;
	readUInt40BE(offset?: number): number;
	readInt48BE(offset?: number): number;
	readUInt48BE(offset?: number): number;
	readBigInt64BE(offset?: number): bigint;
	readBigUInt64BE(offset?: number): bigint;
	readIntBE(offset?: number, byteLength?: number): number;
	readUIntBE(offset?: number, byteLength?: number): number;
	readFloatBE(offset?: number): number;
	readDoubleBE(offset?: number): number;
	readBigUIntBE(offset?: number, end?: number): bigint;
	// write
	writeInt8(value: number, offset?: number): number;
	writeUInt8(value: number, offset?: number): number;
	writeInt16BE(value: number, offset?: number): number;
	writeUInt16BE(value: number, offset?: number): number;
	writeInt32BE(value: number, offset?: number): number;
	writeUInt32BE(value: number, offset?: number): number;
	writeInt48BE(value: number, offset?: number): number;
	writeUInt48BE(value: number, offset?: number): number;
	writeBigInt64BE(value: bigint, offset?: number): number;
	writeBigUInt64BE(value: bigint, offset?: number): number;
	writeIntBE(value: number, offset?: number, byteLength?: number): number;
	writeUIntBE(value: number, offset?: number, byteLength?: number): number;
	writeFloatBE(value: number, offset?: number): number;
	writeDoubleBE(value: number, offset?: number): number;
	writeBigIntLE(bigint: bigint, offset?: number): number;
}

function toInteger(n: number, defaultVal: number) {
	n = +n;
	if (!Number.isNaN(n) &&
			n >= Number.MIN_SAFE_INTEGER &&
			n <= Number.MAX_SAFE_INTEGER) {
		return ((n % 1) === 0 ? n : MathFloor(n));
	}
	return defaultVal;
}

function copy(source: TypedArray, target: TypedArray, 
	targetStart?: number, sourceStart?: number, sourceEnd?: number) 
{
	if (!isTypedArray(source))
		throw ERR_INVALID_ARG_TYPE(source, ['Buffer', 'TypedArray'], 'source');
	if (!isTypedArray(target))
		throw ERR_INVALID_ARG_TYPE(target, ['Buffer', 'TypedArray'], 'target');

	if (targetStart === undefined) {
		targetStart = 0;
	} else {
		targetStart = toInteger(targetStart, 0);
		if (targetStart < 0)
			throw ERR_OUT_OF_RANGE('targetStart', '>= 0', targetStart);
	}

	if (sourceStart === undefined) {
		sourceStart = 0;
	} else {
		sourceStart = toInteger(sourceStart, 0);
		if (sourceStart < 0)
			throw ERR_OUT_OF_RANGE('sourceStart', '>= 0', sourceStart);
	}

	if (sourceEnd === undefined) {
		sourceEnd = source.byteLength;
	} else {
		sourceEnd = toInteger(sourceEnd, 0);
		if (sourceEnd < 0)
			throw ERR_OUT_OF_RANGE('sourceEnd', '>= 0', sourceEnd);
	}

	if (targetStart >= target.byteLength || sourceStart >= sourceEnd)
		return 0;

	if (sourceStart > source.byteLength) {
		throw ERR_OUT_OF_RANGE('sourceStart',
																`<= ${source.byteLength}`,
																sourceStart);
	}

	if (sourceEnd - sourceStart > target.byteLength - targetStart)
		sourceEnd = sourceStart + target.byteLength - targetStart;

	let nb = sourceEnd - sourceStart;
	const targetLen = target.byteLength - targetStart;
	const sourceLen = source.byteLength - sourceStart;
	if (nb > targetLen)
		nb = targetLen;
	if (nb > sourceLen)
		nb = sourceLen;

	var src: Uint8Array;
	if (sourceStart !== 0 || sourceEnd !== source.byteLength)
		src = new Uint8Array(source.buffer, source.byteOffset + sourceStart, nb);
	else
		src = new Uint8Array(source.buffer);
	(new Uint8Array(target.buffer)).set(src, targetStart);
	return nb;
}

function byteLength(
	string: string | BinaryLike,
	encoding?: BufferEncoding): number {
	if (typeof string !== 'string') {
		if ('byteLength' in string
			/*string as BinaryLike */
			/*string instanceof ArrayBuffer || string instanceof TypedArray*/) {
			return string.byteLength;
		}
		throw ERR_INVALID_ARG_TYPE(string, 
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

function from(
	value: FromArg,
	encodingOrMapfn?: BufferEncoding | ((v: number, k: number) => number),
	thisArg?: any): Buffer 
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
	} else if (value instanceof TypedArrayConstructor) {
		return new BufferIMPL((<TypedArray>value).buffer);
	} else if (value instanceof ArrayBuffer || value instanceof SharedArrayBuffer) {
		return new BufferIMPL(value);
	} else if (value instanceof DataView) {
		return new BufferIMPL(value.buffer);
	} else {
		var bf = Uint8Array.from(<any>value, <any>encodingOrMapfn, thisArg);
		(<any>bf).__proto__ = BufferIMPL.prototype;
		return <BufferIMPL>bf;
	}
}

function alloc(size: number): Buffer {
	return new BufferIMPL( Number(size) || 0);
}

function allocUnsafe(size: number): Buffer {
	return new BufferIMPL( Number(size) || 0);
}

function concat(list: (Bytes | ArrayLike<number>)[], length?: number): Buffer {
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

class BufferIMPL extends Uint8Array implements Buffer {

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

	copy(targetBuffer: Buffer, targetStart?: number, sourceStart?: number, sourceEnd?: number): number {
		return copy(this, targetBuffer, targetStart, sourceStart, sourceEnd);
	}

	clone(start?: number, end?: number): Buffer {
		return this.slice(start, end);
	}

	slice(start?: number, end?: number): Buffer {
		return new BufferIMPL(super.slice(start, end).buffer);
	}

	filter(callbackfn: (value: number, index: number, array: Buffer) => any, thisArg?: any): Buffer {
		return new BufferIMPL(super.filter(
			<(value: number, index: number, array: Uint8Array) => any>callbackfn, thisArg).buffer);
	}
	
	map(callbackfn: (value: number, index: number, array: Buffer) => number, thisArg?: any): Buffer {
		return new BufferIMPL(super.map(
			<(value: number, index: number, array: Uint8Array) => number>callbackfn, thisArg).buffer);
	}

	reverse(): Buffer {
		return new BufferIMPL(super.reverse().buffer);
	}

	every(callbackfn: (value: number, index: number, array: Buffer) => unknown, thisArg?: any): boolean {
		return super.every(<(value: number, index: number, array: Uint8Array) => unknown>callbackfn, thisArg);
	}

	some(callbackfn: (value: number, index: number, array: Buffer) => unknown, thisArg?: any): boolean {
		return super.some(<(value: number, index: number, array: Uint8Array) => unknown>callbackfn, thisArg);
	}

	subarray(begin?: number, end?: number): Buffer {
		return new BufferIMPL(super.subarray(begin, end).buffer);
	}

	toJSON(): { type: 'InterfaceBuffer'; data: number[] } {
		var data = new Array(this.length);
		this.forEach((i,j)=>data[j]=i);
		return { type: 'InterfaceBuffer', data };
	}

	write(arg0: FromArg, offset?: number, encoding?: BufferEncoding): number {
		var buffer = from(arg0, encoding);
		this.set(buffer, offset);
		return buffer.length;
	}

	readInt8(offset = 0) {
		return _buffer.readInt8(this, offset);
	}
	readUInt8(offset = 0) {
		return _buffer.readUInt8(this, offset);
	}
	readInt16BE(offset = 0) {
		return _buffer.readInt16BE(this, offset);
	}
	readUInt16BE(offset = 0) {
		return _buffer.readUInt16BE(this, offset);
	}
	readInt32BE(offset = 0) {
		return _buffer.readInt32BE(this, offset);
	}
	readUInt32BE(offset = 0) {
		return _buffer.readUInt32BE(this, offset);
	}
	readInt40BE(offset = 0) {
		return _buffer.readInt40BE(this, offset);
	}
	readUInt40BE(offset = 0) {
		return _buffer.readUInt40BE(this, offset);
	}
	readInt48BE(offset = 0) {
		return _buffer.readInt48BE(this, offset);
	}
	readUInt48BE(offset = 0) {
		return _buffer.readUInt48BE(this, offset);
	}
	readBigInt64BE(offset = 0) {
		return _buffer.readBigInt64BE(this, offset);
	}
	readBigUInt64BE(offset = 0) {
		return _buffer.readBigUInt64BE(this, offset);
	}
	readIntBE(offset = 0, byteLength = 4) {
		return _buffer.readIntBE(this, offset, byteLength);
	}
	readUIntBE(offset = 0, byteLength = 4) {
		return _buffer.readUIntBE(this, offset, byteLength);
	}
	readFloatBE(offset: number = 0) {
		return _buffer.readFloatBE(this, offset);
	}
	readDoubleBE(offset: number = 0) {
		return _buffer.readDoubleBE(this, offset);
	}
	readBigUIntBE(offset: number, end: number) {
		return _buffer.readBigUIntBE(this, offset, end);
	}
	// write
	writeInt8(value: number, offset = 0) {
		return _buffer.writeInt8(this, value, offset);
	}
	writeUInt8(value: number, offset = 0) {
		return _buffer.writeUInt8(this, value, offset);
	}
	writeInt16BE(value: number, offset = 0) {
		return _buffer.writeInt16BE(this, value, offset);
	}
	writeUInt16BE(value: number, offset = 0) {
		return _buffer.writeUInt16BE(this, value, offset);
	}
	writeInt32BE(value: number, offset = 0) {
		return _buffer.writeInt32BE(this, value, offset);
	}
	writeUInt32BE(value: number, offset = 0) {
		return _buffer.writeUInt32BE(this, value, offset);
	}
	writeInt48BE(value: number, offset = 0) {
		return _buffer.writeInt48BE(this, value, offset);
	}
	writeUInt48BE(value: number, offset = 0) {
		return _buffer.writeUInt48BE(this, value, offset);
	}
	writeBigInt64BE(value: bigint, offset = 0) {
		return _buffer.writeBigInt64BE(this, value, offset);
	}
	writeBigUInt64BE(value: bigint, offset = 0) {
		return _buffer.writeBigUInt64BE(this, value, offset);
	}
	writeIntBE(value: number, offset = 0, byteLength = 4) {
		return _buffer.writeIntBE(this, value, offset, byteLength);
	}
	writeUIntBE(value: number, offset = 0, byteLength = 4) {
		return _buffer.writeUIntBE(this, value, offset, byteLength);
	}
	writeFloatBE(value: number, offset = 0) {
		return _buffer.writeFloatBE(this, value, offset);
	}
	writeDoubleBE(value: number, offset = 0) {
		return _buffer.writeDoubleBE(this, value, offset);
	}
	writeBigIntLE(bigint: bigint, offset = 0) {
		var arr: number[] = [];
		var l = _buffer.writeBigIntLE(arr, bigint);
		this.set(arr, offset);
		return l;
	}
}

export const Zero = alloc(0);

Object.defineProperty(BufferIMPL.prototype, '__INTERFACE_BUFFER_TYPE__', {
	configurable: false,
	enumerable: false,
	value: INTERFACE_BUFFER_TYPE,
	writable: false,
});

export default {
	Buffer,
	byteLength,
	isInterfaceBuffer,
	from,
	alloc,
	allocUnsafe,
	concat,
};
