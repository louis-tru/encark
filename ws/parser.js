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

var event = require('../event');
var Buffer = require('buffer').Buffer;

/*
 * Unpacks a buffer to a number.
 *
 * @api public
 */

function _unpack(buffer) {
	var n = 0;
	for (var i = 0; i < buffer.length; ++i) {
		n = (i == 0) ? buffer[i] : (n * 256) + buffer[i];
	}
	return n;
}

/**
 * @class PacketParser
 */
class PacketParser {

	/*
	 * WebSocket PacketParser
	 *
	 * @api public
	 */
	constructor() {
		event.initEvents(this, 'Close', 'Text', 'Data', 'Error', 'Ping');
		
		this.state = {
			activeFragmentedOperation: null,
			lastFragment: false,
			masked: false,
			opcode: 0
		};
		this.overflow = null;
		this.expectOffset = 0;
		this.expectBuffer = null;
		this.expectHandler = null;
		this.currentMessage = '';

		var self = this;

		this.opcodeHandlers = {
			// text
			'1': function(data) {
				var finish = function (mask, data) {
					self.currentMessage += self.unmask(mask, data);
					if (self.state.lastFragment) {
						var msg = self.currentMessage;
						self.onText.trigger(msg);
						self.currentMessage = '';
					}
					self.endPacket();
				};

				var expectData = function (length) {
					if (self.state.masked) {
						self.expect('Mask', 4, function (data) {
							var mask = data;
							self.expect('Data', length, function (data) {
								finish(mask, data);
							});
						});
					}
					else {
						self.expect('Data', length, function (data) {
							finish(null, data);
						});
					}
				};

				// decode length
				var firstLength = data[1] & 0x7f;
				if (firstLength < 126) {
					expectData(firstLength);
				}
				else if (firstLength == 126) {
					self.expect('Length', 2, function (data) {
						expectData(_unpack(data));
					});
				}
				else if (firstLength == 127) {
					self.expect('Length', 8, function (data) {
						if (_unpack(data.slice(0, 4)) != 0) {
							self.error('packets with length spanning more than 32 bit is currently not supported');
							return;
						}
						var lengthBytes = data.slice(4); // note: cap to 32 bit length
						expectData(_unpack(data));
					});
				}
			},
			// binary
			'2': function(data) {
				var finish = function (mask, data) {
					if (typeof self.currentMessage == 'string') {
						self.currentMessage = []; // build a buffer list
					}
					self.currentMessage.push(self.unmask(mask, data, true));
					if (self.state.lastFragment) {
						self.onData.trigger(self.concatBuffers(self.currentMessage));
						self.currentMessage = '';
					}
					self.endPacket();
				};
				
				var expectData = function (length) {
					if (self.state.masked) {
						self.expect('Mask', 4, function (data) {
							var mask = data;
							self.expect('Data', length, function (data) {
								finish(mask, data);
							});
						});
					}
					else {
						self.expect('Data', length, function (data) {
							finish(null, data);
						});
					}
				};

				// decode length
				var firstLength = data[1] & 0x7f;
				if (firstLength < 126) {
					expectData(firstLength);
				}
				else if (firstLength == 126) {
					self.expect('Length', 2, function (data) {
						expectData(_unpack(data));
					});
				}
				else if (firstLength == 127) {
					self.expect('Length', 8, function (data) {
						if (_unpack(data.slice(0, 4)) != 0) {
							self.error('packets with length spanning more than 32 bit is currently not supported');
							return;
						}
						var lengthBytes = data.slice(4); // note: cap to 32 bit length
						expectData(_unpack(data));
					});
				}
			},
			// close
			'8': function(data) {
				self.onClose.trigger();
				self.reset();
			},
			// ping
			'9': function(data) {
				if (self.state.lastFragment == false) {
					self.error('fragmented ping is not supported');
					return;
				}

				var finish = function (mask, data) {
					self.onPing.trigger(self.unmask(mask, data));
					self.endPacket();
				};

				var expectData = function (length) {
					if (self.state.masked) {
						self.expect('Mask', 4, function (data) {
							var mask = data;
							self.expect('Data', length, function (data) {
								finish(mask, data);
							});
						});
					}
					else {
						self.expect('Data', length, function (data) {
							finish(null, data);
						});
					}
				};

				// decode length
				var firstLength = data[1] & 0x7f;
				if (firstLength === 0) {
					finish(null, null);
				}
				else if (firstLength < 126) {
					expectData(firstLength);
				}
				else if (firstLength == 126) {
					self.expect('Length', 2, function (data) {
						expectData(_unpack(data));
					});
				}
				else if (firstLength == 127) {
					self.expect('Length', 8, function (data) {
						expectData(_unpack(data));
					});
				}
			},
		};

		this.expect('Opcode', 2, this.processPacket);
	}

	/*
	 * Add new data to the parser.
	 *
	 * @api public
	 */
	add(data) {
		if (this.expectBuffer == null) {
			this.addToOverflow(data);
			return;
		}
		var toRead = Math.min(data.length, this.expectBuffer.length - this.expectOffset);
		data.copy(this.expectBuffer, this.expectOffset, 0, toRead);
		this.expectOffset += toRead;
		if (toRead < data.length) {
			// at this point the overflow buffer shouldn't at all exist
			this.overflow = Buffer.alloc(data.length - toRead);
			data.copy(this.overflow, 0, toRead, toRead + this.overflow.length);
		}
		if (this.expectOffset == this.expectBuffer.length) {
			var bufferForHandler = this.expectBuffer;
			this.expectBuffer = null;
			this.expectOffset = 0;
			this.expectHandler.call(this, bufferForHandler);
		}
	}

	/*
	 * Adds a piece of data to the overflow.
	 *
	 * @api private
	 */
	addToOverflow(data) {
		if (this.overflow == null) this.overflow = data;
		else {
			var prevOverflow = this.overflow;
			this.overflow = Buffer.alloc(this.overflow.length + data.length);
			prevOverflow.copy(this.overflow, 0);
			data.copy(this.overflow, prevOverflow.length);
		}
	}

	/*
	 * Waits for a certain amount of bytes to be available, then fires a callback.
	 *
	 * @api private
	 */
	expect(what, length, handler) {
		this.expectBuffer = Buffer.alloc(length);
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
	processPacket(data) {
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
		var handler = this.opcodeHandlers[this.state.opcode];
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
		this.currentMessage = '';
	}

	/*
	 * Unmask received data.
	 *
	 * @api private
	 */
	unmask(mask, buf, binary) {
		if (mask != null) {
			for (var i = 0, ll = buf.length; i < ll; i++) {
				buf[i] ^= mask[i % 4];
			}
		}
		if (binary) return buf;
		return buf != null ? buf.toString('utf8') : '';
	}

	/**
	 * Concatenates a list of buffers.
	 *
	 * @api private
	 */
	concatBuffers(buffers) {
		var length = 0;
		for (var i = 0, l = buffers.length; i < l; ++i) {
			length += buffers[i].length;
		}
		var mergedBuffer = Buffer.alloc(length);
		var offset = 0;
		for (var i = 0, l = buffers.length; i < l; ++i) {
			buffers[i].copy(mergedBuffer, offset);
			offset += buffers[i].length;
		}
		return mergedBuffer;
	}

	/**
	 * Handles an error
	 *
	 * @api private
	 */
	error(reason) {
		this.reset();
		this.onError.trigger(reason);
		return this;
	}
}

/*
 * @func sendDataPacket() Frame server-to-client output as a text packet.
 * @static
 */
function sendDataPacket(socket, data, cb) {
	var opcode = 0x81; // text 0x81 | buffer 0x82 | close 0x88 | ping 0x89

	if (data instanceof Uint8Array) {
		opcode = 0x82;
		// data = Buffer.from(data.buffer);
	} else { // send json string message
		data = JSON.stringify(data);
		data = Buffer.from(data);
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
	*/

	if (dataLength > 65535) {
		headerLength = 10;
		secondByte = 127;
	}
	else if (dataLength > 125) {
		headerLength = 4;
		secondByte = 126;
	}

	var header = Buffer.alloc(headerLength);

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

	return socket.write(Buffer.concat([header, data]), cb);
}

/**
 * @func sendPingPacket()
 * @static
 */
function sendPingPacket(socket, cb) {
	var header = Buffer.alloc(2);
	header[0] = 0x89;
	header[1] = 0;
	return socket.write(header, cb);
}

module.exports = {
	PacketParser,
	sendDataPacket,
	sendPingPacket,
};
