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
import _codec, {Bytes} from './_codec';
// import _buffer from './_buffer';

const {haveNode} = utils;

/**
 * @class SimpleBuffer
 */
export class SimpleBuffer extends Uint8Array {

	toString(encoding = 'utf8', start = 0, end = this.length): string {
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
	}

	toLocaleString(encoding = 'utf8', start = 0, end = this.length): string {
		return this.toString(encoding, start, end);
	}

	// from(value: string, encoding?: string): SimpleBuffer;
	// from(value: ArrayBuffer): SimpleBuffer;
	static from(value: any, ...args: any[]): SimpleBuffer {
		if (typeof value === 'string') {
			var encoding = args[0] || 'utf8';
			if (encoding == 'uft8' || encoding == 'utf-8') {
				return new SimpleBuffer(_codec.encodeUTF8(value));
			} else if (encoding == 'hex') {
				return new SimpleBuffer(_codec.decodeHex(value));
			} else if (encoding == 'base64') {
				return new SimpleBuffer(_codec.decodeBase64(value));
			} else if (encoding == 'latin1' || encoding == 'binary') {
				return new SimpleBuffer(_codec.encodeLatin1From(value));
			} else if (encoding == 'ascii') {
				return new SimpleBuffer(_codec.encodeAsciiFrom(value));
			} else {
				return new SimpleBuffer(_codec.encodeUTF8(value));
			}
		} else if (value instanceof ArrayBuffer) {
			return new SimpleBuffer(value);
		} else {
			var bf = Uint8Array.from(value, ...args);
			(<any>bf).__proto__ = SimpleBuffer.prototype;
			return bf;
		}
	}

	static alloc(size: number) {
		return new SimpleBuffer( Number(size) || 0);
	}

	static concat(list: Bytes[], length?: number) {

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
			return ZERO;

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

const ZERO = SimpleBuffer.alloc(0);

const _buffer: Buffer | SimpleBuffer = 
	haveNode ? require('buffer').Buffer: SimpleBuffer;

export default _buffer
