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

import {EventNoticer,Event} from '../event';

const POWS = [1, 256, 65536, 16777216];

export enum Constants {
	LENGTH_CODED_NULL = 251,
	LENGTH_CODED_16BIT_WORD = 252,
	LENGTH_CODED_24BIT_WORD = 253,
	LENGTH_CODED_64BIT_WORD = 254,

	// Parser states
	PACKET_LENGTH = 0,
	PACKET_NUMBER = 1,
	GREETING_PROTOCOL_VERSION = 2,
	GREETING_SERVER_VERSION = 3,
	GREETING_THREAD_ID = 4,
	GREETING_SCRAMBLE_BUFF_1 = 5,
	GREETING_FILLER_1 = 6,
	GREETING_SERVER_CAPABILITIES = 7,
	GREETING_SERVER_LANGUAGE = 8,
	GREETING_SERVER_STATUS = 9,
	GREETING_FILLER_2 = 10,
	GREETING_SCRAMBLE_BUFF_2 = 11,
	FIELD_COUNT = 12,
	ERROR_NUMBER = 13,
	ERROR_SQL_STATE_MARKER = 14,
	ERROR_SQL_STATE = 15,
	ERROR_MESSAGE = 16,
	AFFECTED_ROWS = 17,
	INSERT_ID = 18,
	SERVER_STATUS = 19,
	WARNING_COUNT = 20,
	MESSAGE = 21,
	EXTRA_LENGTH = 22,
	EXTRA_STRING = 23,
	FIELD_CATALOG_LENGTH = 24,
	FIELD_CATALOG_STRING = 25,
	FIELD_DB_LENGTH = 26,
	FIELD_DB_STRING = 27,
	FIELD_TABLE_LENGTH = 28,
	FIELD_TABLE_STRING = 29,
	FIELD_ORIGINAL_TABLE_LENGTH = 30,
	FIELD_ORIGINAL_TABLE_STRING = 31,
	FIELD_NAME_LENGTH = 32,
	FIELD_NAME_STRING = 33,
	FIELD_ORIGINAL_NAME_LENGTH = 34,
	FIELD_ORIGINAL_NAME_STRING = 35,
	FIELD_FILLER_1 = 36,
	FIELD_CHARSET_NR = 37,
	FIELD_LENGTH = 38,
	FIELD_TYPE = 39,
	FIELD_FLAGS = 40,
	FIELD_DECIMALS = 41,
	FIELD_FILLER_2 = 42,
	FIELD_DEFAULT = 43,
	EOF_WARNING_COUNT = 44,
	EOF_SERVER_STATUS = 45,
	COLUMN_VALUE_LENGTH = 46,
	COLUMN_VALUE_STRING = 47,

	// Packet types
	GREETING_PACKET = 0,
	OK_PACKET = 1,
	ERROR_PACKET = 2,
	RESULT_SET_HEADER_PACKET = 3,
	FIELD_PACKET = 4,
	EOF_PACKET = 5,
	ROW_DATA_PACKET = 6,
	ROW_DATA_BINARY_PACKET = 7,
	OK_FOR_PREPARED_STATEMENT_PACKET = 8,
	PARAMETER_PACKET = 9,
	USE_OLD_PASSWORD_PROTOCOL_PACKET= 10,
};

/**
 * @createTime 2012-01-12
 * @author louis.tru <louis.tru@gmail.com>
 * @copyright (C) 2011 louis.tru, http://mooogame.com
 * Released under MIT license, http://license.mooogame.com
 */

export interface PacketData {
	protocolVersion?: number;
	serverVersion?: string;
	threadId?: number;
	scrambleBuffer?: Buffer;
	serverCapabilities?: number;
	serverLanguage?: number;
	serverStatus?: number;
	fieldCount?: number;
	errno?: number;
	sqlStateMarker?: string;
	sqlState?: string;
	errorMessage?: string;
	affectedRows?: number;
	insertId?: number;
	warningCount?: number;
	message?: string;
	extra?: string;
	catalog?: string;
	db?: string;
	table?: string;
	originalTable?: string;
	name?: string;
	originalName?: string;
	charsetNumber?: number;
	fieldLength?: number;
	fieldType?: number;
	flags?: number;
	decimals?: number;
	columnLength?: number;
	sql?: string;
}

export interface IPacket {
	type: Constants;
	toJSON(): PacketData | Error;
}

export class Packet implements IPacket {
	readonly onData = new EventNoticer('Data', this);
	readonly d: PacketData = {};

	type = Constants.LENGTH_CODED_NULL;
	number = 0;
	index = 0;
	length = 0;
	received = 0;

	toJSON(): PacketData | Error {
		var data = this.d;
		if (this.type == Constants.ERROR_PACKET) {
			var err = Error.new([data.errno, data.errorMessage]);
			for (var [key, val] of Object.entries(data))
				err[key] = val;
			return err;
		}
		return data;
	}
}

export class Parser {

	private _lengthCodedLength?: number;
	private _lengthCodedStringLength?: number;
	private packet: Packet | null = null;
	private greeted = false;
	private authenticated = false;
	private receivingFieldPackets = false;
	private receivingRowPackets = false;

	state = Constants.PACKET_LENGTH;

	/**
	 * @event onpacket
	 */
	readonly onPacket = new EventNoticer<Event<Packet>>('Packet', this);

	/**
	 * write buffer and parser
	 * @param {node.Buffer}
	 */
	write(buffer: Buffer) {
		var c: number = 0;
		var self = this;
		var state = this.state;
		var length = buffer.length;
		var packet = this.packet as Packet;
		var packet_: PacketData = {};

		function advance(newState?: Constants) {
			self.state = state = (newState === undefined)
				? self.state + 1
				: newState;
			packet.index = -1;
		}

		function lengthCoded(val?: number, nextState?: Constants): number | undefined {
			if (self._lengthCodedLength === undefined) {
				if (c === Constants.LENGTH_CODED_16BIT_WORD) {
					self._lengthCodedLength = 2;
				} else if (c === Constants.LENGTH_CODED_24BIT_WORD) {
					self._lengthCodedLength = 3;
				} else if (c === Constants.LENGTH_CODED_64BIT_WORD) {
					self._lengthCodedLength = 8;
				} else if (c === Constants.LENGTH_CODED_NULL) {
					advance(nextState);
					return; //null;
				} else if (c < Constants.LENGTH_CODED_NULL) {
					advance(nextState);
					return c;
				}
				return 0;
			}

			if (c) {
				if (val === undefined)
					throw new Error('Type error');
				val += POWS[packet.index - 1] * c;
			}

			if (packet.index === self._lengthCodedLength) {
				self._lengthCodedLength = undefined;
				advance(nextState);
			}

			return val;
		}

		function emitPacket() {
			if (packet) {
				self.packet = null;
				self.state = state = Constants.PACKET_LENGTH;
				self.greeted = true;
				delete packet.index;
				self.onPacket.trigger(packet);
				(<any>packet) = null;
			}
		}

		for (var i = 0; i < length; i++) {
			c = buffer[i];

			if (state > Constants.PACKET_NUMBER) {
				packet.received++;
			}

			switch (state) {
				// PACKET HEADER
				case 0: // PACKET_LENGTH:
					if (!packet) {
						packet = this.packet = new Packet();
						packet_ = packet.d;
					}

					// 3 bytes - Little endian
					packet.length += POWS[packet.index] * c;

					if (packet.index == 2) {
						advance();
					}
					break;
				case 1: // PACKET_NUMBER:
					// 1 byte
					packet.number = c;

					if (!this.greeted) {
						advance(Constants.GREETING_PROTOCOL_VERSION);
						break;
					}

					if (this.receivingFieldPackets) {
						advance(Constants.FIELD_CATALOG_LENGTH);
					} else if (this.receivingRowPackets) {
						advance(Constants.COLUMN_VALUE_LENGTH);
					} else {
						advance(Constants.FIELD_COUNT);
					}
					break;

				// GREETING_PACKET
				case 2: // GREETING_PROTOCOL_VERSION:
					// Nice undocumented MySql gem, the initial greeting can be an error
					// packet. Happens for too many connections errors.
					if (c === 0xff) {
						packet.type = Constants.ERROR_PACKET;
						advance(Constants.ERROR_NUMBER);
						break;
					}

					// 1 byte
					packet.type = Constants.GREETING_PACKET;
					packet_.protocolVersion = c;
					advance();
					break;
				case 3: // GREETING_SERVER_VERSION:
					if (packet.index == 0) {
						packet_.serverVersion = '';
					}

					// Null-Terminated String
					if (c != 0) {
						packet_.serverVersion += String.fromCharCode(c);
					} else {
						advance();
					}
					break;
				case 4: // GREETING_THREAD_ID:
					if (packet.index == 0) {
						packet_.threadId = 0;
					}

					// 4 bytes = probably Little endian, protocol docs are not clear
					(packet_.threadId as number) += POWS[packet.index] * c;

					if (packet.index == 3) {
						advance();
					}
					break;
				case 5: // GREETING_SCRAMBLE_BUFF_1:
					if (packet.index == 0) {
						packet_.scrambleBuffer = Buffer.alloc(8 + 12);
					}

					// 8 bytes
					(packet_.scrambleBuffer as Buffer)[packet.index] = c;

					if (packet.index == 7) {
						advance();
					}
					break;
				case 6: // GREETING_FILLER_1:
					// 1 byte - 0x00
					advance();
					break;
				case 7: // GREETING_SERVER_CAPABILITIES:
					if (packet.index == 0) {
						packet_.serverCapabilities = 0;
					}
					// 2 bytes = probably Little endian, protocol docs are not clear
					(packet_.serverCapabilities as number) += POWS[packet.index] * c;

					if (packet.index == 1) {
						advance();
					}
					break;
				case 8: // GREETING_SERVER_LANGUAGE:
					packet_.serverLanguage = c;
					advance();
					break;
				case 9: // GREETING_SERVER_STATUS:
					if (packet.index == 0) {
						packet_.serverStatus = 0;
					}

					// 2 bytes = probably Little endian, protocol docs are not clear
					(packet_.serverStatus as number) += POWS[packet.index] * c;

					if (packet.index == 1) {
						advance();
					}
					break;
				case 10: // GREETING_FILLER_2:
					// 13 bytes - 0x00
					if (packet.index == 12) {
						advance();
					}
					break;
				case 11: // GREETING_SCRAMBLE_BUFF_2:
					// 12 bytes - not 13 bytes like the protocol spec says ...
					if (packet.index < 12) {
						(packet_.scrambleBuffer as Buffer)[packet.index + 8] = c;
					}
					break;

				// OK_PACKET, ERROR_PACKET, or RESULT_SET_HEADER_PACKET
				case 12: // FIELD_COUNT:
					if (packet.index == 0) {
						if (c === 0xff) {
							packet.type = Constants.ERROR_PACKET;
							advance(Constants.ERROR_NUMBER);
							break;
						}

						if (c == 0xfe && !this.authenticated) {
							packet.type = Constants.USE_OLD_PASSWORD_PROTOCOL_PACKET;
							break;
						}

						if (c === 0x00) {
							// after the first OK PACKET, we are authenticated
							this.authenticated = true;
							packet.type = Constants.OK_PACKET;
							advance(Constants.AFFECTED_ROWS);
							break;
						}
					}

					this.receivingFieldPackets = true;
					packet.type = Constants.RESULT_SET_HEADER_PACKET;
					packet_.fieldCount = lengthCoded(packet_.fieldCount, Constants.EXTRA_LENGTH);

					break;

				// ERROR_PACKET
				case 13: // ERROR_NUMBER:
					if (packet.index == 0) {
						packet_.errno = 0;
					}

					// 2 bytes = Little endian
					(<number>packet_.errno) += POWS[packet.index] * c;

					if (packet.index == 1) {
						if (!this.greeted) {
							// Turns out error packets are confirming to the 4.0 protocol when
							// not greeted yet. Oh MySql, you are such a thing of beauty ...
							advance(Constants.ERROR_MESSAGE);
							break;
						}

						advance();
					}
					break;
				case 14: // ERROR_SQL_STATE_MARKER:
					// 1 character - always #
					packet_.sqlStateMarker = String.fromCharCode(c);
					packet_.sqlState = '';
					advance();
					break;
				case 15: // ERROR_SQL_STATE:
					// 5 characters
					if (packet.index < 5) {
						packet_.sqlState += String.fromCharCode(c);
					}

					if (packet.index == 4) {
						advance(Constants.ERROR_MESSAGE);
					}
					break;
				case 16: // ERROR_MESSAGE:
					if (packet.received <= packet.length) {
						packet_.errorMessage = (packet_.errorMessage || '') + String.fromCharCode(c);
					}
					break;

				// OK_PACKET
				case 17: // AFFECTED_ROWS:
					packet_.affectedRows = lengthCoded(packet_.affectedRows);
					break;
				case 18: // INSERT_ID:
					packet_.insertId = lengthCoded(packet_.insertId);
					break;
				case 19: // SERVER_STATUS:
					if (packet.index == 0) {
						packet_.serverStatus = 0;
					}

					// 2 bytes - Little endian
					(<number>packet_.serverStatus) += POWS[packet.index] * c;

					if (packet.index == 1) {
						advance();
					}
					break;
				case 20: // WARNING_COUNT:
					if (packet.index == 0) {
						packet_.warningCount = 0;
					}

					// 2 bytes - Little endian
					(<number>packet_.warningCount) += POWS[packet.index] * c;

					if (packet.index == 1) {
						packet_.message = '';
						advance();
					}
					break;
				case 21: // MESSAGE:
					if (packet.received <= packet.length) {
						packet_.message += String.fromCharCode(c);
					}
					break;

				// RESULT_SET_HEADER_PACKET
				case 22: // EXTRA_LENGTH:
					packet_.extra = '';
					self._lengthCodedStringLength = lengthCoded(self._lengthCodedStringLength);
					break;
				case 23: // EXTRA_STRING:
					packet_.extra += String.fromCharCode(c);
					break;

				// FIELD_PACKET or EOF_PACKET
				case 24: // FIELD_CATALOG_LENGTH:
					if (packet.index == 0) {
						if (c === 0xfe) {
							packet.type = Constants.EOF_PACKET;
							advance(Constants.EOF_WARNING_COUNT);
							break;
						}
						packet.type = Constants.FIELD_PACKET;
					}
					self._lengthCodedStringLength = lengthCoded(self._lengthCodedStringLength);
					break;
				case 25: // FIELD_CATALOG_STRING:
					if (packet.index == 0) {
						packet_.catalog = '';
					}
					packet_.catalog += String.fromCharCode(c);

					if (packet.index + 1 === self._lengthCodedStringLength) {
						advance();
					}
					break;
				case 26: // FIELD_DB_LENGTH:
					self._lengthCodedStringLength = lengthCoded(self._lengthCodedStringLength);
					if (self._lengthCodedStringLength == 0) {
						advance();
					}
					break;
				case 27: // FIELD_DB_STRING:
					if (packet.index == 0) {
						packet_.db = '';
					}
					packet_.db += String.fromCharCode(c);

					if (packet.index + 1 === self._lengthCodedStringLength) {
						advance();
					}
					break;
				case 28: // FIELD_TABLE_LENGTH:
					self._lengthCodedStringLength = lengthCoded(self._lengthCodedStringLength);
					if (self._lengthCodedStringLength == 0) {
						advance();
					}
					break;
				case 29: // FIELD_TABLE_STRING:
					if (packet.index == 0) {
						packet_.table = '';
					}
					packet_.table += String.fromCharCode(c);

					if (packet.index + 1 === self._lengthCodedStringLength) {
						advance();
					}
					break;
				case 30: // FIELD_ORIGINAL_TABLE_LENGTH:
					self._lengthCodedStringLength = lengthCoded(self._lengthCodedStringLength);
					if (self._lengthCodedStringLength == 0) {
						advance();
					}
					break;
				case 31: // FIELD_ORIGINAL_TABLE_STRING:
					if (packet.index == 0) {
						packet_.originalTable = '';
					}
					packet_.originalTable += String.fromCharCode(c);

					if (packet.index + 1 === self._lengthCodedStringLength) {
						advance();
					}
					break;
				case 32: // FIELD_NAME_LENGTH:
					self._lengthCodedStringLength = lengthCoded(self._lengthCodedStringLength);
					break;
				case 33: // FIELD_NAME_STRING:
					if (packet.index == 0) {
						packet_.name = '';
					}
					packet_.name += String.fromCharCode(c);

					if (packet.index + 1 === self._lengthCodedStringLength) {
						advance();
					}
					break;
				case 34: // FIELD_ORIGINAL_NAME_LENGTH:
					self._lengthCodedStringLength = lengthCoded(self._lengthCodedStringLength);
					if (self._lengthCodedStringLength == 0) {
						advance();
					}
					break;
				case 35: // FIELD_ORIGINAL_NAME_STRING:
					if (packet.index == 0) {
						packet_.originalName = '';
					}
					packet_.originalName += String.fromCharCode(c);

					if (packet.index + 1 === self._lengthCodedStringLength) {
						advance();
					}
					break;
				case 36: // FIELD_FILLER_1:
					// 1 bytes - 0x00
					advance();
					break;
				case 37: // FIELD_CHARSET_NR:
					if (packet.index == 0) {
						packet_.charsetNumber = 0;
					}

					// 2 bytes - Little endian
					(<number>packet_.charsetNumber) += Math.pow(256, packet.index) * c;

					if (packet.index == 1) {
						advance();
					}
					break;
				case 38: // FIELD_LENGTH:
					if (packet.index == 0) {
						packet_.fieldLength = 0;
					}

					// 4 bytes - Little endian
					(<number>packet_.fieldLength) += Math.pow(256, packet.index) * c;

					if (packet.index == 3) {
						advance();
					}
					break;
				case 39: // FIELD_TYPE:
					// 1 byte
					packet_.fieldType = c;
					advance();
				case 40: // FIELD_FLAGS:
					if (packet.index == 0) {
						packet_.flags = 0;
					}

					// 2 bytes - Little endian
					(<number>packet_.flags) += Math.pow(256, packet.index) * c;

					if (packet.index == 1) {
						advance();
					}
					break;
				case 41: // FIELD_DECIMALS:
					// 1 byte
					packet_.decimals = c;
					advance();
					break;
				case 42: // FIELD_FILLER_2:
					// 2 bytes - 0x00
					if (packet.index == 1) {
						advance();
					}
					break;
				case 43: // FIELD_DEFAULT:
					// TODO: Only occurs for mysql_list_fields()
					break;

				// EOF_PACKET
				case 44: // EOF_WARNING_COUNT:
					if (packet.index == 0) {
						packet_.warningCount = 0;
					}

					// 2 bytes - Little endian
					(<number>packet_.warningCount) += Math.pow(256, packet.index) * c;

					if (packet.index == 1) {
						advance();
					}
					break;
				case 45: // EOF_SERVER_STATUS:
					if (packet.index == 0) {
						packet_.serverStatus = 0;
					}

					// 2 bytes - Little endian
					(<number>packet_.serverStatus) += Math.pow(256, packet.index) * c;

					if (packet.index == 1) {
						if (this.receivingFieldPackets) {
							this.receivingFieldPackets = false;
							this.receivingRowPackets = true;
						} else {
						}
					}
					break;
				case 46: // COLUMN_VALUE_LENGTH:
					if (packet.index == 0) {
						packet_.columnLength = 0;
						packet.type = Constants.ROW_DATA_PACKET;
					}

					if (packet.received == 1) {
						if (c === 0xfe) {
							packet.type = Constants.EOF_PACKET;
							this.receivingRowPackets = false;
							advance(Constants.EOF_WARNING_COUNT);
							break;
						}
						this.onPacket.trigger(packet);
					}

					packet_.columnLength = lengthCoded(packet_.columnLength);

					if (!packet_.columnLength && !this._lengthCodedLength) {
						packet.onData.trigger({ buffer: packet_.columnLength === undefined ? null : Buffer.alloc(0), remaining: 0 });
						if (packet.received < packet.length) {
							advance(Constants.COLUMN_VALUE_LENGTH);
						} else {
							self.packet = null;
							(<any>packet) = null;
							self.state = state = Constants.PACKET_LENGTH;
							continue;
						}
					}
					break;
				case 47: // COLUMN_VALUE_STRING:
					if (packet_.columnLength === undefined)
						throw new Error('Type error');
					var remaining = packet_.columnLength - packet.index, read;
					if (i + remaining > buffer.length) {
						read = buffer.length - i;
						packet.index += read;
						packet.onData.trigger({ buffer: buffer.slice(i, buffer.length), remaining: remaining - read });
						// the -1 offsets are because these values are also manipulated by the loop itself
						packet.received += read - 1;
						i = buffer.length;
					} else {
						packet.onData.trigger({ buffer: buffer.slice(i, i + remaining), remaining: 0 });
						i += remaining - 1;
						packet.received += remaining - 1;
						advance(Constants.COLUMN_VALUE_LENGTH);
						// advance() sets this to -1, but packet.index++ is skipped, so we need to manually fix
						packet.index = 0;
					}

					if (packet.received == packet.length) {
						self.packet = null;
						(<any>packet) = null;
						self.state = state = Constants.PACKET_LENGTH;
					}

					continue;
			}

			packet.index++;

			if (state > Constants.PACKET_NUMBER && packet.received === packet.length) {
				emitPacket();
			}
		}
	}

}