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

import { EventNoticer, Event } from '../event';
import { Packet, Constants, PacketData } from './parser';
import {ServerStatus} from './constants';

export class Field {
	readonly name: string;
	readonly type: FieldType;
	constructor(name: string, type: FieldType) {
		this.name = name;
		this.type = type;
	}
}

export enum FieldType {
	FIELD_TYPE_DECIMAL     = 0,
	FIELD_TYPE_TINY        = 1,
	FIELD_TYPE_SHORT       = 2,
	FIELD_TYPE_LONG        = 3,
	FIELD_TYPE_FLOAT       = 4,
	FIELD_TYPE_DOUBLE      = 5,
	FIELD_TYPE_NULL        = 6,
	FIELD_TYPE_TIMESTAMP   = 7,
	FIELD_TYPE_LONGLONG    = 8,
	FIELD_TYPE_INT24       = 9,
	FIELD_TYPE_DATE        = 10,
	FIELD_TYPE_TIME        = 11,
	FIELD_TYPE_DATETIME    = 12,
	FIELD_TYPE_YEAR        = 13,
	FIELD_TYPE_NEWDATE     = 14,
	FIELD_TYPE_VARCHAR     = 15,
	FIELD_TYPE_BIT         = 16,
	FIELD_TYPE_TIMESTAMP2  = 17, //
	FIELD_TYPE_DATETIME2   = 18, //
	FIELD_TYPE_TIME2       = 19, //
	FIELD_TYPE_JSON        = 245, //
	FIELD_TYPE_NEWDECIMAL  = 246,
	FIELD_TYPE_ENUM        = 247,
	FIELD_TYPE_SET         = 248,
	FIELD_TYPE_TINY_BLOB   = 249,
	FIELD_TYPE_MEDIUM_BLOB = 250,
	FIELD_TYPE_LONG_BLOB   = 251,
	FIELD_TYPE_BLOB        = 252,
	FIELD_TYPE_VAR_STRING  = 253,
	FIELD_TYPE_STRING      = 254,
	FIELD_TYPE_GEOMETRY    = 255,
};

export class Query {
	private _eofs = 0;
	private _fields: Field[] | null = null;
	private _rowIndex: number = 0;
	private _row?: Dict;
	readonly sql: string;
	readonly onError = new EventNoticer<Event<Query, Error>>('Error', this);
	readonly onResolve = new EventNoticer<Event<Query, PacketData | null>>('Resolve', this);
	readonly onField = new EventNoticer<Event<Query, Field>>('Field', this);
	readonly onRow = new EventNoticer<Event<Query, Dict>>('Row', this);
	readonly onEnd = new EventNoticer<Event<Query, void>>('End', this);

	constructor(sql: string) {
		this.sql = sql;
	}

	private _ParseField(type: FieldType, str_value: string) {
		// NOTE: need to handle more data types, such as binary data
		switch (type) {
			case FieldType.FIELD_TYPE_TIMESTAMP:
			case FieldType.FIELD_TYPE_DATE:
			case FieldType.FIELD_TYPE_DATETIME:
			case FieldType.FIELD_TYPE_NEWDATE:
			case FieldType.FIELD_TYPE_TIMESTAMP2:
			case FieldType.FIELD_TYPE_DATETIME2:
				return new Date(str_value);
			case FieldType.FIELD_TYPE_DECIMAL:
			case FieldType.FIELD_TYPE_TINY:
			case FieldType.FIELD_TYPE_SHORT:
			case FieldType.FIELD_TYPE_LONG:
			case FieldType.FIELD_TYPE_LONGLONG:
			case FieldType.FIELD_TYPE_INT24:
			case FieldType.FIELD_TYPE_YEAR:
				return parseInt(str_value, 10);
			case FieldType.FIELD_TYPE_FLOAT:
			case FieldType.FIELD_TYPE_DOUBLE:
				// decimal types cannot be parsed as floats because
				// V8 Numbers have less precision than some MySQL Decimals
				return parseFloat(str_value);
			case FieldType.FIELD_TYPE_BIT:
				return str_value == '\u0000' ? false : true;
			case FieldType.FIELD_TYPE_JSON:
				return JSON.parse(str_value);
			case FieldType.FIELD_TYPE_TIME2:
			case FieldType.FIELD_TYPE_TIME:
			default:
				return str_value;
		}
	}

	handlePacket(packet: Packet) {
		// We can't do this require() on top of the file.
		// That's because there is circular dependency and we're overwriting
		var self = this;
		var serverStatus = packet.data.serverStatus || 0;

		switch (packet.type) {
			case Constants.OK_PACKET:
				this.onResolve.trigger(<PacketData>packet.toJSON());
				if (serverStatus & ServerStatus.SERVER_MORE_RESULTS_EXISTS) {
					// more results
				} else {
					this.onEnd.trigger();
				}
				break;
			case Constants.ERROR_PACKET:
				packet.data.sql = self.sql;
				this.onError.trigger(Error.new(packet.toJSON()).ext({sql: this.sql}));
				break;
			case Constants.FIELD_PACKET:
				if (!this._fields) {
					this._fields = [];
					this.onResolve.trigger(null);
				}
				var field = new Field(packet.data.name || '', packet.data.fieldType || -1);
				this._fields.push(field);
				this.onField.trigger(field);
				break;
			case Constants.EOF_PACKET:
				if (!this._eofs) {
					this._eofs = 1;
				} else {
					this._eofs++; 
				}
				if (this._eofs == 2) {
					this._fields = null;
					this._eofs = 0;
					if (serverStatus & ServerStatus.SERVER_MORE_RESULTS_EXISTS) {
						// more results
					} else {
						this.onEnd.trigger();
					}
				}
				break;
			case Constants.ROW_DATA_PACKET: {
				let row: Dict = {};
				let field: Field | null = null;
				let value: Buffer | null = null;
				let fields = <Field[]>this._fields;
				this._rowIndex = 0;
				this._row = row;

				packet.onData.on(function(e) {
					var data = e.data;
					var buffer = data.buffer;
					var remaining = data.remaining;

					if (!field)
						field = fields[self._rowIndex];

					if (buffer) {
						if (value) {
							value = Buffer.concat([value, buffer]);
						} else {
							value = buffer;
						}
					}
					else {
						row[field.name] = value = null;
					}

					if (remaining !== 0) {
						return;
					}

					self._rowIndex++;

					if (value !== null) {
						row[field.name] = self._ParseField(field.type, value.toString('utf8'));
					}

					if (self._rowIndex == fields.length) {
						delete self._row;
						delete (self as any)._rowIndex;
						self.onRow.trigger(row);
						return;
					}

					field = null;
					value = null;
				});

				break;
			}
			default: break;
		}
	}
}
