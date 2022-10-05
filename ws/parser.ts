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

import {EventNoticer,Event} from '../event';
import buffer,{IBuffer} from '../buffer';
import * as net from 'net';

/*
 * Unpacks a buffer to a number.
 *
 * @api public
 */

function _unpack(buffer: IBuffer) {
	var n = 0;
	for (var i = 0; i < buffer.length; i++) {
		n = i ? (n * 256) + buffer[i]: buffer[i];
	}
	return n;
}

function _concat(buffers: IBuffer[]) {
	return buffers.length == 1 ? buffers[0]: buffer.concat(buffers);
}

interface State {
	activeFragmentedOperation: any;
	lastFragment: boolean;
	masked: boolean;
	opcode: number;
}

interface Finish {
	(mask: null | ArrayLike<number>, data: IBuffer): void;
}

interface ExpectHandler {
	(buffer: IBuffer): void;
}

/**
 * @class PacketParser
 */
export class PacketParser {

	private state: State = {
		activeFragmentedOperation: null,
		lastFragment: false,
		masked: false,
		opcode: 0
	}
	private overflow: IBuffer | null = null;
	private expectOffset = 0;
	private expectBuffer: IBuffer | null = null;
	private expectHandler: ExpectHandler | null = null;
	private currentMessage: IBuffer[] | string | null = null;

	readonly onClose = new EventNoticer('Close', this);
	readonly onText = new EventNoticer<Event<PacketParser, string>>('Text', this);
	readonly onData = new EventNoticer<Event<PacketParser, IBuffer>>('Data', this);
	readonly onError = new EventNoticer<Event<PacketParser, Error>>('Error', this);
	readonly onPing = new EventNoticer<Event<PacketParser>>('Ping', this);
	readonly onPong = new EventNoticer<Event<PacketParser>>('Pong', this);

	private opcodeHandlers: { [opcode: string]: (data: IBuffer)=>void } = {
		'1': (data: IBuffer)=>{ // text
			this._decode(data, (mask, data)=>{
				if (this.currentMessage) {
					this.currentMessage += this.unmask(mask, data).toString('utf8');
				} else {
					this.currentMessage = this.unmask(mask, data).toString('utf8');
				}
				if (this.state.lastFragment) {
					this.onText.trigger(<string>this.currentMessage);
					this.currentMessage = null;
				}
				this.endPacket();
			});
		},
		'2': (data: IBuffer)=>{ // binary
			this._decode(data, (mask, data)=>{
				if (this.currentMessage) {
					(<IBuffer[]>this.currentMessage).push(this.unmask(mask, data));
				} else {
					this.currentMessage = [this.unmask(mask, data)];
				}
				if (this.state.lastFragment) {
					this.onData.trigger(_concat(<IBuffer[]>this.currentMessage));
					this.currentMessage = null;
				}
				this.endPacket();
			});
		},
		// 0x3 - 0x7: Retain, for non-control frame
		'8': (data: IBuffer)=>{ // close
			this.onClose.trigger({});
			this.reset();
		},
		'9': (data: IBuffer)=>{ // ping
			if (this.state.lastFragment == false) {
				this.error('fragmented ping is not supported');
				return;
			}
			this._decode(data, (mask, data)=>{
				this.onPing.trigger(this.unmask(mask, data));
				this.endPacket();
			});
		},
		'10': (data: IBuffer)=>{ // pong
			if (this.state.lastFragment == false) {
				this.error('fragmented pong is not supported');
				return;
			}
			this._decode(data, (mask, data)=>{
				this.onPong.trigger(this.unmask(mask, data));
				this.endPacket();
			});
		},
	};

	private _expectData(length: number, finish: Finish) {
		var self = this;
		if (self.state.masked) {
			self.expect('Mask', 4, function(data: IBuffer) {
				var mask = data;
				self.expect('Data', length, function (data: IBuffer) {
					finish(mask, data);
				});
			});
		}
		else {
			self.expect('Data', length, function(data: IBuffer) {
				finish(null, data);
			});
		}
	}

	private _decode(data: IBuffer, finish: Finish) {
		var self = this;
		// decode length
		var firstLength = data[1] & 0x7f;
		if (firstLength < 126) {
			self._expectData(firstLength, finish);
		}
		else if (firstLength == 126) {
			self.expect('Length', 2, function (data: IBuffer) {
				self._expectData(_unpack(data), finish);
			});
		}
		else if (firstLength == 127) {
			self.expect('Length', 8, function (data: IBuffer) {
				if (_unpack(data.slice(0, 4)) != 0) {
					self.error('packets with length spanning more than 32 bit is currently not supported');
					return;
				}
				// var lengthBytes = data.slice(4); // note: cap to 32 bit length
				self._expectData(_unpack(data.slice(4, 8)), finish);
			});
		}
	}
	/*
	 * WebSocket PacketParser
	 *
	 * @api public
	 */
	constructor() {
		this.expect('Opcode', 2, this.processPacket);
	}

	/*
	 * Add new data to the parser.
	 *
	 * @api public
	 */
	add(data: IBuffer) {
		if (this.expectBuffer == null) {
			this.addToOverflow(data);
			return;
		}
		var toRead = Math.min(data.length, this.expectBuffer.length - this.expectOffset);
		data.copy(this.expectBuffer, this.expectOffset, 0, toRead);
		this.expectOffset += toRead;
		if (toRead < data.length) {
			// at this point the overflow buffer shouldn't at all exist
			this.overflow = buffer.alloc(data.length - toRead);
			data.copy(this.overflow, 0, toRead, toRead + this.overflow.length);
		}
		if (this.expectOffset == this.expectBuffer.length) {
			var bufferForHandler = this.expectBuffer;
			this.expectBuffer = null;
			this.expectOffset = 0;
			(<ExpectHandler>this.expectHandler).call(this, bufferForHandler);
		}
	}

	/*
	 * Adds a piece of data to the overflow.
	 *
	 * @api private
	 */
	addToOverflow(data: IBuffer) {
		if (this.overflow == null) this.overflow = data;
		else {
			var prevOverflow = this.overflow;
			this.overflow = buffer.alloc(this.overflow.length + data.length);
			prevOverflow.copy(this.overflow, 0);
			data.copy(this.overflow, prevOverflow.length);
		}
	}

	/*
	 * Waits for a certain amount of bytes to be available, then fires a callback.
	 *
	 * @api private
	 */
	expect(what: string, length: number, handler: ExpectHandler) {
		this.expectBuffer = buffer.alloc(length);
		this.expectOffset = 0;
		this.expectHandler = handler;
		if (this.overflow != null) {
			var toOverflow = this.overflow;
			this.overflow = null;
			this.add(toOverflow);
		}
	}

	/*
	 * Start processing a new packet.
	 *
	 * @api private
	 */
	processPacket(data: IBuffer) {
		if ((data[0] & 0x70) != 0) {
			this.error('reserved fields must be empty');
		}
		this.state.lastFragment = (data[0] & 0x80) == 0x80;
		this.state.masked = (data[1] & 0x80) == 0x80;

		var opcode = data[0] & 0xf;
		if (opcode == 0) {
			// continuation frame
			this.state.opcode = this.state.activeFragmentedOperation;
			if (!(this.state.opcode == 1 || this.state.opcode == 2)) {
				this.error('continuation frame cannot follow current opcode')
				return;
			}
		} else {
			this.state.opcode = opcode;
			if (this.state.lastFragment === false) {
				this.state.activeFragmentedOperation = opcode;
			}
		}
		var handler = this.opcodeHandlers[String(this.state.opcode)];
		if (typeof handler == 'undefined') {
			this.error('no handler for opcode ' + this.state.opcode);
		} else { 
			handler(data);
		}
	}

	/*
	 * Endprocessing a packet.
	 *
	 * @api private
	 */
	endPacket() {
		this.expectOffset = 0;
		this.expectBuffer = null;
		this.expectHandler = null;
		if (this.state.lastFragment && this.state.opcode == this.state.activeFragmentedOperation) {
			// end current fragmented operation
			this.state.activeFragmentedOperation = null;
		}
		this.state.lastFragment = false;
		this.state.opcode = this.state.activeFragmentedOperation != null ? 
			this.state.activeFragmentedOperation : 0;
		this.state.masked = false;
		this.expect('Opcode', 2, this.processPacket);
	}

	/*
	 * Reset the parser state.
	 *
	 * @api private
	 */
	reset() {
		this.state = {
			activeFragmentedOperation: null,
			lastFragment: false,
			masked: false,
			opcode: 0
		};
		this.expectOffset = 0;
		this.expectBuffer = null;
		this.expectHandler = null;
		this.overflow = null;
		this.currentMessage = null;
	}

	/*
	 * Unmask received data.
	 *
	 * @api private
	 */
	unmask(mask: ArrayLike<number> | null, buf: IBuffer) {
		if (mask != null) {
			for (var i = 0, ll = buf.length; i < ll; i++) {
				buf[i] ^= mask[i % 4];
			}
		}
		return buf;
	}

	/**
	 * Handles an error
	 *
	 * @api private
	 */
	error(reason: any) {
		this.reset();
		this.onError.trigger(Error.new(reason));
		return this;
	}
}

export interface SendCallback {
	(err?: Error): void;
}

/*
 * @func sendDataPacket() Frame server-to-client output as a text packet.
 * @static
 */
export function sendDataPacket(socket: net.Socket, data: IBuffer | string, cb?: SendCallback) {
	var opcode = 0x81; // text 0x81 | buffer 0x82 | close 0x88 | ping 0x89

	if (data instanceof Uint8Array) {
		opcode = 0x82;
		// data = buffer.from(data.buffer);
	} else { // send json string message
		var s = JSON.stringify(data);
		data = buffer.from(s);
	}

	var dataLength = data.length;
	var headerLength = 2;
	var secondByte = dataLength;

	/*
		0   - 125   : 2,	opcode|len|data
		126 - 65535 : 4,	opcode|126|len|len|data
		65536 -     : 10,	opcode|127|len|len|len|len|len|len|len|len|data
	*/
	/*
		opcode:
		0x81: text
		0x82: binary
		0x88: close
		0x89: ping
		0x8a: pong
	*/

	if (dataLength > 65535) {
		headerLength = 10;
		secondByte = 127;
	}
	else if (dataLength > 125) {
		headerLength = 4;
		secondByte = 126;
	}

	var header = buffer.alloc(headerLength);

	header[0] = opcode;
	header[1] = secondByte;

	switch (secondByte) {
		case 126:
			header[2] = dataLength >> 8;
			header[3] = dataLength % 256;
			break;
		case 127:
			var l = dataLength;
			for (var i = 9; i > 1; i--) {
				header[i] = l & 0xff;
				l >>= 8;
			}
	}

	return socket.write(buffer.concat([header, data]), cb);
}

/**
 * @func sendPingPacket()
 */
export function sendPingPacket(socket: net.Socket, cb?: SendCallback) {
	var header = buffer.alloc(3);
	header[0] = 0x89;
	header[1] = 1; // 1byte
	return socket.write(header, cb);
}

/**
 * @func sendPongPacket()
 */
export function sendPongPacket(socket: net.Socket, cb?: SendCallback) {
	var header = buffer.alloc(3);
	header[0] = 0x8a;
	header[1] = 1; // 1byte
	return socket.write(header, cb);
}