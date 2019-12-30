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

import { EventNoticer } from '../event';
import { Packet, Constants, PacketData } from './parser';

export enum FieldType {
	FIELD_TYPE_DECIMAL = 0x00,
	FIELD_TYPE_TINY = 0x01,
	FIELD_TYPE_SHORT = 0x02,
	FIELD_TYPE_LONG = 0x03,
	FIELD_TYPE_FLOAT = 0x04,
	FIELD_TYPE_DOUBLE = 0x05,
	FIELD_TYPE_NULL = 0x06,
	FIELD_TYPE_TIMESTAMP = 0x07,
	FIELD_TYPE_LONGLONG = 0x08,
	FIELD_TYPE_INT24 = 0x09,
	FIELD_TYPE_DATE = 0x0a,
	FIELD_TYPE_TIME = 0x0b,
	FIELD_TYPE_DATETIME = 0x0c,
	FIELD_TYPE_YEAR = 0x0d,
	FIELD_TYPE_NEWDATE = 0x0e,
	FIELD_TYPE_VARCHAR = 0x0f,
	FIELD_TYPE_BIT = 0x10,
	FIELD_TYPE_NEWDECIMAL = 0xf6,
	FIELD_TYPE_ENUM = 0xf7,
	FIELD_TYPE_SET = 0xf8,
	FIELD_TYPE_TINY_BLOB = 0xf9,
	FIELD_TYPE_MEDIUM_BLOB = 0xfa,
	FIELD_TYPE_LONG_BLOB = 0xfb,
	FIELD_TYPE_BLOB = 0xfc,
	FIELD_TYPE_VAR_STRING = 0xfd,
	FIELD_TYPE_STRING = 0xfe,
	FIELD_TYPE_GEOMETRY = 0xff
};

export class Field {
	readonly name: string;
	readonly type: FieldType;
	constructor(name: string, type: FieldType) {
		this.name = name;
		this.type = type;
	}
}

export class Query {
	private _eofs = 0;
	private _fields: Field[] | null = null;
	private _rowIndex: number = 0;
	private _row?: Dict;
	readonly sql: string;
	readonly onError = new EventNoticer<Error>('Error', this);
	readonly onResolve = new EventNoticer<PacketData>('Resolve', this);
	readonly onField = new EventNoticer<Field>('Field', this);
	readonly onRow = new EventNoticer<Dict>('Row', this);
	readonly onEnd = new EventNoticer<void>('End', this);

	constructor(sql: string) {
		this.sql = sql;
	}

	handlePacket(packet: Packet) {
		// We can't do this require() on top of the file.
		// That's because there is circular dependency and we're overwriting
		var self = this;

		switch (packet.type) {
			case Constants.OK_PACKET:
				this.onResolve.trigger(<PacketData>packet.toJSON());
				if (packet.d.serverStatus == 2 || packet.d.serverStatus == 3) {
					this.onEnd.trigger();
				}
				break;
			case Constants.ERROR_PACKET:
				// packet.sql = self.sql;
				this.onError.trigger(<Error>packet.toJSON());
				break;
			case Constants.FIELD_PACKET:
				if (!this._fields) {
					this._fields = [];
					this.onResolve.trigger({});
				}
				var field = new Field(packet.d.name || '', packet.d.fieldType || -1);
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
					if (packet.d.serverStatus == 34 || packet.d.serverStatus == 2) {
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

					// NOTE: need to handle more data types, such as binary data
					if (value !== null) {
						var str_value = value.toString('utf8');

						switch (field.type) {
							case FieldType.FIELD_TYPE_TIMESTAMP:
							case FieldType.FIELD_TYPE_DATE:
							case FieldType.FIELD_TYPE_DATETIME:
							case FieldType.FIELD_TYPE_NEWDATE:
								row[field.name] = new Date(str_value);
								break;
							case FieldType.FIELD_TYPE_TINY:
							case FieldType.FIELD_TYPE_SHORT:
							case FieldType.FIELD_TYPE_LONG:
							case FieldType.FIELD_TYPE_LONGLONG:
							case FieldType.FIELD_TYPE_INT24:
							case FieldType.FIELD_TYPE_YEAR:
								row[field.name] = parseInt(str_value, 10);
								break;
							case FieldType.FIELD_TYPE_FLOAT:
							case FieldType.FIELD_TYPE_DOUBLE:
								// decimal types cannot be parsed as floats because
								// V8 Numbers have less precision than some MySQL Decimals
								row[field.name] = parseFloat(str_value);
								break;
							case FieldType.FIELD_TYPE_BIT:
								row[field.name] = str_value == '\u0000' ? false : true;
								break;
							default:
								row[field.name] = str_value;
								break;
						}
					}
					
					if (self._rowIndex == fields.length) {
						delete self._row;
						delete self._rowIndex;
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
