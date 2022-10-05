/* ***** BEGIN LICENSE BLOCK *****
 * Distributed under the BSD license:
 *
 * Copyright (c) 2015, blue.chu
 * All rights reserved.
 * 
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *     * Redistributions of source code must retain the above copyright
 *       notice, this list of conditions and the following disclaimer.
 *     * Redistributions in binary form must reproduce the above copyright
 *       notice, this list of conditions and the following disclaimer in the
 *       documentation and/or other materials provided with the distribution.
 *     * Neither the name of blue.chu nor the
 *       names of its contributors may be used to endorse or promote products
 *       derived from this software without specific prior written permission.
 * 
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
 * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL blue.chu BE LIABLE FOR ANY
 * DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
 * LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
 * ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
 * SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 * 
 * ***** END LICENSE BLOCK ***** */

export class OutgoingPacket {

	/**
	 * index
	 * @type {Number}
	 */
	index: number = 0;
	buffer: Buffer;

	/**
	 * constructor function
	 * @param {Number} size
	 * @param {Number} num
	 * @constructor
	 */
	constructor(size: number, num?: number) {
		this.buffer = Buffer.alloc(size + 3 + 1);
		this.writeNumber(3, size);
		this.writeNumber(1, num || 0);
	}

	writeNumber(bytes: number, number: number) {
		for (var i = 0; i < bytes; i++) {
			this.buffer[this.index++] = (number >> (i * 8)) & 0xff;
		}
	}

	writeFiller(bytes: number) {
		for (var i = 0; i < bytes; i++) {
			this.buffer[this.index++] = 0;
		}
	}

	write(bufferOrString: Buffer | string, encoding?: BufferEncoding) {
		if (typeof bufferOrString == 'string') {
			this.index += this.buffer.write(bufferOrString, this.index, encoding);
			return;
		}
		bufferOrString.copy(this.buffer, this.index, 0);
		this.index += bufferOrString.length;
	}

	writeNullTerminated(bufferOrString: Buffer | string, encoding?: BufferEncoding) {
		this.write(bufferOrString, encoding);
		this.buffer[this.index++] = 0;
	}

	writeLengthCoded(bufferOrStringOrNumber: Buffer | string | number, encoding?: BufferEncoding) {
		if (bufferOrStringOrNumber === null) {
			this.buffer[this.index++] = 251;
			return;
		}

		if (typeof bufferOrStringOrNumber == 'number') {
			if (bufferOrStringOrNumber <= 250) {
				this.buffer[this.index++] = bufferOrStringOrNumber;
				return;
			}

			// @todo support 8-byte numbers and simplify this
			if (bufferOrStringOrNumber < 0xffff) {
				this.buffer[this.index++] = 252;
				this.buffer[this.index++] = (bufferOrStringOrNumber >> 0) & 0xff;
				this.buffer[this.index++] = (bufferOrStringOrNumber >> 8) & 0xff;
			} else if (bufferOrStringOrNumber < 0xffffff) {
				this.buffer[this.index++] = 253;
				this.buffer[this.index++] = (bufferOrStringOrNumber >> 0) & 0xff;
				this.buffer[this.index++] = (bufferOrStringOrNumber >> 8) & 0xff;
				this.buffer[this.index++] = (bufferOrStringOrNumber >> 16) & 0xff;
			} else {
				throw new Error('8 byte length coded numbers not supported yet');
			}
			return;
		}

		if (bufferOrStringOrNumber instanceof Buffer) {
			this.writeLengthCoded(bufferOrStringOrNumber.length);
			this.write(bufferOrStringOrNumber);
			return;
		}

		if (typeof bufferOrStringOrNumber == 'string') {
			this.writeLengthCoded(Buffer.byteLength(bufferOrStringOrNumber, encoding));
			this.write(bufferOrStringOrNumber, encoding);
			return;
		}

		throw new Error('passed argument not a buffer, string or number: ' + bufferOrStringOrNumber);
	}

}