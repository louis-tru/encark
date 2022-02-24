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

import { Duplex as DuplexStream } from 'stream';

export type AppenData = Buffer | BufferList | Buffer[] | number[] | number | string;

export interface Callbak {
	(err?: Error | null, data?: Buffer): void;
}

export default class BufferList extends DuplexStream {

	private _bufs: Buffer[] = [];
	private _callback: Callbak | null = null;

	length = 0;

	constructor(callback?: Callbak | AppenData) {
		super();

		if (typeof callback == 'function') {
			this._callback = callback
	
			var piper = (err: Error)=>{
				if (this._callback) {
					this._callback(err)
					this._callback = null
				}
			};
	
			this.on('pipe', function onPipe (src) {
				src.on('error', piper)
			})
			this.on('unpipe', function onUnpipe (src) {
				src.removeListener('error', piper)
			})
		} else if (callback) {
			this.append(callback);
		}

	}

	private _offset(offset: number) {
		var tot = 0, i = 0, _t
		if (offset === 0)
			return [ 0, 0 ]
		for (; i < this._bufs.length; i++) {
			_t = tot + this._bufs[i].length
			if (offset < _t || i == this._bufs.length - 1)
				return [ i, offset - tot ]
			tot = _t
		}
		return [ 0, 0 ]
	}
	
	append(buf: AppenData) {
		var i = 0
	
		if (Buffer.isBuffer(buf)) {
			this._appendBuffer(buf);
		} else if (Array.isArray(buf)) {
			for (; i < buf.length; i++)
				this.append(buf[i])
		} else if (buf instanceof BufferList) {
			// unwrap argument into individual BufferLists
			for (; i < buf._bufs.length; i++)
				this.append(buf._bufs[i])
		} else if (buf != null) {
			// coerce number arguments to strings, since Buffer(number) does
			// uninitialized memory allocation
			if (typeof buf == 'number')
				buf = buf.toString();
	
			this._appendBuffer(Buffer.from(buf));
		}
	
		return this
	}
	
	private _appendBuffer(buf: Buffer) {
		this._bufs.push(buf)
		this.length += buf.length
	}
	
	_write(buf: Buffer, encoding?: string, callback?: ()=>void) {
		this._appendBuffer(buf)
	
		if (typeof callback == 'function')
			callback()
	}
	
	_read(size: number) {
		if (!this.length)
			return this.push(null)
	
		size = Math.min(size, this.length)
		this.push(this.slice(0, size))
		this.consume(size)
	}
	
	end(chunk: any) {
		super.end(chunk);
	
		if (this._callback) {
			this._callback(null, this.slice())
			this._callback = null
		}
		return this;
	}
	
	get(index: number) {
		return this.slice(index, index + 1)[0];
	}
	
	slice(start?: number, end?: number): Buffer {
		if (typeof start == 'number' && start < 0)
			start += this.length
		if (typeof end == 'number' && end < 0)
			end += this.length
		return this.copy(null, 0, start, end)
	}

	copy(dst?: Buffer|null, dstStart?: number, srcStart?: number, srcEnd?: number): Buffer {
		if (typeof srcStart != 'number' || srcStart < 0)
			srcStart = 0
		if (typeof srcEnd != 'number' || srcEnd > this.length)
			srcEnd = this.length
		if (srcStart >= this.length)
			return dst || Buffer.alloc(0)
		if (srcEnd <= 0)
			return dst || Buffer.alloc(0)
	
		var copy   = !!dst
			, off    = this._offset(srcStart)
			, len    = srcEnd - srcStart
			, bytes  = len
			, bufoff = (copy && dstStart) || 0
			, start  = off[1]
			, l
			, i
	
		// copy/slice everything
		if (srcStart === 0 && srcEnd == this.length) {
			if (!dst) { // slice, but full concat if multiple buffers
				return this._bufs.length === 1
					? this._bufs[0]
					: Buffer.concat(this._bufs, this.length)
			}
	
			// copy, need to copy individual buffers
			for (i = 0; i < this._bufs.length; i++) {
				this._bufs[i].copy(dst, bufoff)
				bufoff += this._bufs[i].length
			}
	
			return dst
		}
	
		// easy, cheap case where it's a subset of one of the buffers
		if (bytes <= this._bufs[off[0]].length - start) {
			if (dst) {
				this._bufs[off[0]].copy(dst, dstStart, start, start + bytes);
				return dst;
			} else {
				return this._bufs[off[0]].slice(start, start + bytes);
			}
		}
	
		if (!dst) // a slice, we need something to copy in to
			dst = Buffer.allocUnsafe(len)
	
		for (i = off[0]; i < this._bufs.length; i++) {
			l = this._bufs[i].length - start
	
			if (bytes > l) {
				this._bufs[i].copy(dst, bufoff, start)
			} else {
				this._bufs[i].copy(dst, bufoff, start, start + bytes)
				break
			}
	
			bufoff += l
			bytes -= l
	
			if (start)
				start = 0
		}
	
		return dst
	}
	
	shallowSlice(start?: number, end?: number) {
		start = start || 0
		end = end || this.length
	
		if (start < 0)
			start += this.length
		if (end < 0)
			end += this.length
	
		var startOffset = this._offset(start)
			, endOffset = this._offset(end)
			, buffers = this._bufs.slice(startOffset[0], endOffset[0] + 1)
	
		if (endOffset[1] == 0)
			buffers.pop()
		else
			buffers[buffers.length-1] = buffers[buffers.length-1].slice(0, endOffset[1])
	
		if (startOffset[1] != 0)
			buffers[0] = buffers[0].slice(startOffset[1])
	
		return new BufferList(buffers)
	}
	
	toString(encoding?: BufferEncoding, start?: number, end?: number) {
		return this.slice(start, end).toString(encoding)
	}
	
	consume(bytes: number) {
		while (this._bufs.length) {
			if (bytes >= this._bufs[0].length) {
				bytes -= this._bufs[0].length
				this.length -= this._bufs[0].length
				this._bufs.shift()
			} else {
				this._bufs[0] = this._bufs[0].slice(bytes)
				this.length -= bytes
				break
			}
		}
		return this
	}
	
	duplicate() {
		var i = 0;
		var copy = new BufferList();
	
		for (; i < this._bufs.length; i++)
			copy.append(this._bufs[i])
	
		return copy;
	}
	
	destroy() {
		this._bufs.length = 0;
		this.length = 0;
		this.push(null);
		return this;
	}

	readDoubleBE(offset = 0) {
		return this.slice(offset, offset + 8).readDoubleBE(0);
	}

	readDoubleLE(offset = 0) {
		return this.slice(offset, offset + 8).readDoubleLE(0);
	}

	readFloatBE(offset = 0) {
		return this.slice(offset, offset + 4).readFloatBE(0);
	}

	readFloatLE(offset = 0) {
		return this.slice(offset, offset + 4).readFloatLE(0);
	}

	readInt32BE(offset = 0) {
		return this.slice(offset, offset + 4).readInt32BE(0);
	}

	readInt32LE(offset = 0) {
		return this.slice(offset, offset + 4).readInt32LE(0);
	}

	readUInt32BE(offset = 0) {
		return this.slice(offset, offset + 4).readUInt32BE(0);
	}

	readUInt32LE(offset = 0) {
		return this.slice(offset, offset + 4).readUInt32LE(0);
	}

	readInt16BE(offset = 0) {
		return this.slice(offset, offset + 2).readInt16BE(0);
	}

	readInt16LE(offset = 0) {
		return this.slice(offset, offset + 2).readInt16LE(0);
	}

	readUInt16BE(offset = 0) {
		return this.slice(offset, offset + 2).readUInt16BE(0);
	}

	readUInt16LE(offset = 0) {
		return this.slice(offset, offset + 2).readUInt16LE(0);
	}

	readInt8(offset = 0) {
		return this.slice(offset, offset + 1).readInt8(0);
	}

	readUInt8(offset = 0) {
		return this.slice(offset, offset + 1).readUInt8(0);
	}

}