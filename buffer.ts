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
import _IBuffer, {ERR_INVALID_ARG_TYPE, ERR_OUT_OF_RANGE} from './_buffer';

const MathFloor = Math.floor;
const INTERFACE_IBuffer_TYPE = -12378;

export const TypedArrayConstructor = (<any>Uint8Array).prototype.__proto__.constructor;

export type TypedArray = Uint8Array | Uint8ClampedArray | Uint16Array | 
	Uint32Array | Int8Array | Int16Array | Int32Array | Float32Array | Float64Array;
export type ArrayIBufferView = TypedArray | DataView;
export type Bytes = Uint8Array | Uint8ClampedArray;
export type BinaryLike = ArrayBufferView | ArrayBuffer | SharedArrayBuffer;
export type FromArg = string | BinaryLike | Iterable<number> | ArrayLike<number>;
export type IBuffer = InterfaceBuffer;

export function isInterfaceBuffer(IBuffer: any) {
	if (IBuffer && IBuffer.__INTERFACE_IBuffer_TYPE__ == INTERFACE_IBuffer_TYPE)
		return true;
	return false;
}

export function isTypedArray(arr: TypedArray) {
	return arr instanceof TypedArrayConstructor;
}

export type IBufferEncoding = 
	"ascii" | "utf8" | "utf-8" | "base64" | "latin1" | "binary" | "hex";

export interface InterfaceBuffer extends Uint8Array {
	toString(encoding?: string, start?: number, end?: number): string;
	copy(targetIBuffer: IBuffer, targetStart?: number, sourceStart?: number, sourceEnd?: number): number;
	clone(start?: number, end?: number): IBuffer;
	slice(start?: number, end?: number): IBuffer;
	filter(callbackfn: (value: number, index: number, array: IBuffer) => any, thisArg?: any): IBuffer;
	map(callbackfn: (value: number, index: number, array: IBuffer) => number, thisArg?: any): IBuffer;
	reverse(): IBuffer;
	every(callbackfn: (value: number, index: number, array: IBuffer) => unknown, thisArg?: any): boolean;
	some(callbackfn: (value: number, index: number, array: IBuffer) => unknown, thisArg?: any): boolean;
	subarray(begin?: number, end?: number): IBuffer;
	toJSON(): { type: 'InterfaceBuffer'; data: number[] };
	write(arg0: FromArg, offset?: number, encoding?: IBufferEncoding): number;
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
	readBigUIntLE(offset?: number, end?: number): bigint;
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
		throw ERR_INVALID_ARG_TYPE(source, ['IBuffer', 'TypedArray'], 'source');
	if (!isTypedArray(target))
		throw ERR_INVALID_ARG_TYPE(target, ['IBuffer', 'TypedArray'], 'target');

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
	encoding?: IBufferEncoding): number {
	if (typeof string !== 'string') {
		if ('byteLength' in string
			/*string as BinaryLike */
			/*string instanceof ArrayIBuffer || string instanceof TypedArray*/) {
			return string.byteLength;
		}
		throw ERR_INVALID_ARG_TYPE(string, 
				['string', 'IBuffer', 'ArrayIBuffer', 'SharedArrayIBuffer', 'DataView'], 'string');
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

interface From {
	(data: string, encoding?: IBufferEncoding): IBuffer;
	(data: ArrayBuffer | SharedArrayBuffer, byteOffset?: number, length?: number): IBuffer;
	(data: TypedArray | DataView): IBuffer;
	(data: Iterable<number> | ArrayLike<number>, mapfn?: (v: number, k: number) => number, thisArg?: any): IBuffer;
}

const from = function(
	value: FromArg,
	encodingOrMapfn?: IBufferEncoding | ((v: number, k: number) => number),
	thisArg?: any): IBuffer 
{
	if (typeof value === 'string') {
		var encoding: IBufferEncoding = typeof encodingOrMapfn == 'string' ? encodingOrMapfn : 'utf8';
		if (encoding == 'utf8' || encoding == 'utf-8') {
			return new IBufferIMPL(_codec.encodeUTF8(value));
		} else if (encoding == 'hex') {
			return new IBufferIMPL(_codec.decodeHex(value));
		} else if (encoding == 'base64') {
			return new IBufferIMPL(_codec.decodeBase64(value));
		} else if (encoding == 'latin1' || encoding == 'binary') {
			return new IBufferIMPL(_codec.encodeLatin1From(value));
		} else if (encoding == 'ascii') {
			return new IBufferIMPL(_codec.encodeAsciiFrom(value));
		} else {
			return new IBufferIMPL(_codec.encodeUTF8(value));
		}
	} else if (value instanceof TypedArrayConstructor) { // 
		var bf = value as Uint8Array;
		return new IBufferIMPL(bf.buffer, bf.byteOffset, bf.byteLength);
	} else if (value instanceof ArrayBuffer || value instanceof SharedArrayBuffer) {
		return new IBufferIMPL(value, Number(encodingOrMapfn) || 0, Number(thisArg) || value.byteLength);
	} else if (value instanceof DataView) { // 
		return new IBufferIMPL(value.buffer, value.byteOffset, value.byteLength);
	} else {
		var bf = Uint8Array.from(value as any, encodingOrMapfn as any, thisArg);
		(bf as any).__proto__ = IBufferIMPL.prototype;
		return bf as IBufferIMPL;
	}
} as From;

function alloc(size: number, initFill?: number): IBuffer {
	var buf = new IBufferIMPL( Number(size) || 0);
	if (initFill)
		buf.fill(Number(initFill) || 0);
	return buf;
}

function allocUnsafe(size: number, initFill?: number): IBuffer {
	var buf = new IBufferIMPL( Number(size) || 0);
	if (initFill)
		buf.fill(Number(initFill) || 0);
	return buf;
}

function concat(list: (Bytes | ArrayLike<number>)[], length?: number): IBuffer {
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

	var bf = new IBufferIMPL(length);
	var offset = 0;

	for (var bytes of list) {
		if (bytes.length) {
			bf.set(bytes, offset);
			offset += bytes.length;
		}
	}

	return bf;
}

export class IBufferIMPL extends Uint8Array implements IBuffer {

	toString(encoding: IBufferEncoding = 'utf8', start = 0, end = this.length): string {
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

	copy(targetIBuffer: IBuffer, targetStart?: number, sourceStart?: number, sourceEnd?: number): number {
		return copy(this, targetIBuffer, targetStart, sourceStart, sourceEnd);
	}

	clone(start?: number, end?: number): IBuffer {
		return this.slice(start, end);
	}

	slice(start?: number, end?: number): IBuffer {
		return new IBufferIMPL(super.slice(start, end).buffer);
	}

	filter(callbackfn: (value: number, index: number, array: IBuffer) => any, thisArg?: any): IBuffer {
		return new IBufferIMPL(super.filter(
			<(value: number, index: number, array: Uint8Array) => any>callbackfn, thisArg).buffer);
	}
	
	map(callbackfn: (value: number, index: number, array: IBuffer) => number, thisArg?: any): IBuffer {
		return new IBufferIMPL(super.map(
			<(value: number, index: number, array: Uint8Array) => number>callbackfn, thisArg).buffer);
	}

	reverse(): IBuffer {
		return new IBufferIMPL(super.reverse().buffer);
	}

	every(callbackfn: (value: number, index: number, array: IBuffer) => unknown, thisArg?: any): boolean {
		return super.every(<(value: number, index: number, array: Uint8Array) => unknown>callbackfn, thisArg);
	}

	some(callbackfn: (value: number, index: number, array: IBuffer) => unknown, thisArg?: any): boolean {
		return super.some(<(value: number, index: number, array: Uint8Array) => unknown>callbackfn, thisArg);
	}

	subarray(begin?: number, end?: number): IBuffer {
		return new IBufferIMPL(super.subarray(begin, end).buffer);
	}

	toJSON(): { type: 'InterfaceBuffer'; data: number[] } {
		var data = new Array(this.length);
		this.forEach((i,j)=>data[j]=i);
		return { type: 'InterfaceBuffer', data };
	}

	write(arg0: FromArg, offset?: number, encoding?: IBufferEncoding): number {
		var buf = from(arg0 as any, encoding);
		this.set(buf, offset);
		return buf.length;
	}

	readInt8(offset = 0) {
		return _IBuffer.readInt8(this, offset);
	}
	readUInt8(offset = 0) {
		return _IBuffer.readUInt8(this, offset);
	}
	readInt16BE(offset = 0) {
		return _IBuffer.readInt16BE(this, offset);
	}
	readUInt16BE(offset = 0) {
		return _IBuffer.readUInt16BE(this, offset);
	}
	readInt32BE(offset = 0) {
		return _IBuffer.readInt32BE(this, offset);
	}
	readUInt32BE(offset = 0) {
		return _IBuffer.readUInt32BE(this, offset);
	}
	readInt40BE(offset = 0) {
		return _IBuffer.readInt40BE(this, offset);
	}
	readUInt40BE(offset = 0) {
		return _IBuffer.readUInt40BE(this, offset);
	}
	readInt48BE(offset = 0) {
		return _IBuffer.readInt48BE(this, offset);
	}
	readUInt48BE(offset = 0) {
		return _IBuffer.readUInt48BE(this, offset);
	}
	readBigInt64BE(offset = 0) {
		return _IBuffer.readBigInt64BE(this, offset);
	}
	readBigUInt64BE(offset = 0) {
		return _IBuffer.readBigUInt64BE(this, offset);
	}
	readIntBE(offset = 0, byteLength = 4) {
		return _IBuffer.readIntBE(this, offset, byteLength);
	}
	readUIntBE(offset = 0, byteLength = 4) {
		return _IBuffer.readUIntBE(this, offset, byteLength);
	}
	readFloatBE(offset: number = 0) {
		return _IBuffer.readFloatBE(this, offset);
	}
	readDoubleBE(offset: number = 0) {
		return _IBuffer.readDoubleBE(this, offset);
	}
	readBigUIntBE(offset: number = 0, end: number = this.length) {
		return _IBuffer.readBigUIntBE(this, offset, end);
	}
	readBigUIntLE(offset: number = 0, end: number = this.length) {
		return _IBuffer.readBigUIntLE(this, offset, end);
	}
	// write
	writeInt8(value: number, offset = 0) {
		return _IBuffer.writeInt8(this, value, offset);
	}
	writeUInt8(value: number, offset = 0) {
		return _IBuffer.writeUInt8(this, value, offset);
	}
	writeInt16BE(value: number, offset = 0) {
		return _IBuffer.writeInt16BE(this, value, offset);
	}
	writeUInt16BE(value: number, offset = 0) {
		return _IBuffer.writeUInt16BE(this, value, offset);
	}
	writeInt32BE(value: number, offset = 0) {
		return _IBuffer.writeInt32BE(this, value, offset);
	}
	writeUInt32BE(value: number, offset = 0) {
		return _IBuffer.writeUInt32BE(this, value, offset);
	}
	writeInt48BE(value: number, offset = 0) {
		return _IBuffer.writeInt48BE(this, value, offset);
	}
	writeUInt48BE(value: number, offset = 0) {
		return _IBuffer.writeUInt48BE(this, value, offset);
	}
	writeBigInt64BE(value: bigint, offset = 0) {
		return _IBuffer.writeBigInt64BE(this, value, offset);
	}
	writeBigUInt64BE(value: bigint, offset = 0) {
		return _IBuffer.writeBigUInt64BE(this, value, offset);
	}
	writeIntBE(value: number, offset = 0, byteLength = 4) {
		return _IBuffer.writeIntBE(this, value, offset, byteLength);
	}
	writeUIntBE(value: number, offset = 0, byteLength = 4) {
		return _IBuffer.writeUIntBE(this, value, offset, byteLength);
	}
	writeFloatBE(value: number, offset = 0) {
		return _IBuffer.writeFloatBE(this, value, offset);
	}
	writeDoubleBE(value: number, offset = 0) {
		return _IBuffer.writeDoubleBE(this, value, offset);
	}
	writeBigIntLE(bigint: bigint, offset = 0) {
		var arr: number[] = [];
		var l = _IBuffer.writeBigIntLE(arr, bigint);
		this.set(arr, offset);
		return l;
	}
}

export const Zero = alloc(0);

Object.defineProperty(IBufferIMPL.prototype, '__INTERFACE_IBuffer_TYPE__', {
	configurable: false,
	enumerable: false,
	value: INTERFACE_IBuffer_TYPE,
	writable: false,
});

export default {
	byteLength,
	isInterfaceBuffer,
	from,
	alloc,
	allocUnsafe,
	concat,
};