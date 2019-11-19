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

"use strict";

const utils = require('./util');
// Temporary buffers to convert numbers.
const float32Array = new Float32Array(1);
const uInt8Float32Array = new Uint8Array(float32Array.buffer);
const float64Array = new Float64Array(1);
const uInt8Float64Array = new Uint8Array(float64Array.buffer);
var _bigint = null;

if (global.BigInt) {
	(function(complete) {
		if (utils.haveWeb) {
			import('./_bigint').then(complete);
		} else {
			complete(utils._eval('require("./_bigint")'));
		}
	})(function(m) {
		_bigint = m;
		_bigint._set(checkInt);
		exports.readBigIntBE = m._readBigIntBE;
		exports.writeBigIntLE = m._writeBigIntLE;
	});
}

// Check endianness.
float32Array[0] = -1; // 0xBF800000
// Either it is [0, 0, 128, 191] or [191, 128, 0, 0]. It is not possible to
// check self with `os.endianness()` because that is determined at compile time.
const bigEndian = uInt8Float32Array[3] === 0;

function ERR_BUFFER_OUT_OF_BOUNDS(name) {
	if (name) {
		return new RangeError(`"${name}" is outside of buffer bounds`);
	}
	return new RangeError('Attempt to access memory outside buffer bounds');
}

function ERR_OUT_OF_RANGE(str,range,input) {
	return new RangeError(`ERR_OUT_OF_RANGE ${str}, ${range}, ${input}`);
}

function validateNumber(value, name) {
	if (typeof value !== 'number')
		throw new TypeError(`ERR_INVALID_ARG_TYPE ${name} number ${value}`);
}

function checkBounds(buf, offset, byteLength) {
	validateNumber(offset, 'offset');
	if (buf[offset] === undefined || buf[offset + byteLength] === undefined)
		boundsError(offset, buf.length - (byteLength + 1));
}

function checkInt(value, min, max, buf, offset, byteLength) {
	if (value > max || value < min) {
		const n = typeof min === 'bigint' ? 'n' : '';
		let range;
		if (byteLength > 3) {
			if (min == 0) {
				range = `>= 0${n} and < 2${n} ** ${(byteLength + 1) * 8}${n}`;
			} else {
				range = `>= -(2${n} ** ${(byteLength + 1) * 8 - 1}${n}) and < 2 ** ` +
								`${(byteLength + 1) * 8 - 1}${n}`;
			}
		} else {
			range = `>= ${min}${n} and <= ${max}${n}`;
		}
		throw ERR_OUT_OF_RANGE('value', range, value);
	}
	checkBounds(buf, offset, byteLength);
}

function boundsError(value, length, type) {
	if (Math.floor(value) !== value) {
		validateNumber(value, type);
		throw ERR_OUT_OF_RANGE(type || 'offset', 'an integer', value);
	}

	if (length < 0)
		throw ERR_BUFFER_OUT_OF_BOUNDS();

	throw ERR_OUT_OF_RANGE(type || 'offset',
														 `>= ${type ? 1 : 0} and <= ${length}`,
														 value);
}

// Read integers.
function readUInt8(self, offset = 0) {
	validateNumber(offset, 'offset');
	const val = self[offset];
	if (val === undefined)
		boundsError(offset, self.length - 1);

	return val;
}

function readInt8(self, offset = 0) {
	validateNumber(offset, 'offset');
	const val = self[offset];
	if (val === undefined)
		boundsError(offset, self.length - 1);

	return val | (val & 2 ** 7) * 0x1fffffe;
}

function readInt16BE(self, offset = 0) {
	validateNumber(offset, 'offset');
	const first = self[offset];
	const last = self[offset + 1];
	if (first === undefined || last === undefined)
		boundsError(offset, self.length - 2);

	const val = first * 2 ** 8 + last;
	return val | (val & 2 ** 15) * 0x1fffe;
}

function readUInt16BE(self, offset = 0) {
	validateNumber(offset, 'offset');
	const first = self[offset];
	const last = self[offset + 1];
	if (first === undefined || last === undefined)
		boundsError(offset, self.length - 2);

	return first * 2 ** 8 + last;
}

function readInt32BE(self, offset = 0) {
	validateNumber(offset, 'offset');
	const first = self[offset];
	const last = self[offset + 3];
	if (first === undefined || last === undefined)
		boundsError(offset, self.length - 4);

	return (first << 24) + // Overflow
		self[++offset] * 2 ** 16 +
		self[++offset] * 2 ** 8 +
		last;
}

function readUInt32BE(self, offset = 0) {
	validateNumber(offset, 'offset');
	const first = self[offset];
	const last = self[offset + 3];
	if (first === undefined || last === undefined)
		boundsError(offset, self.length - 4);

	return first * 2 ** 24 +
		self[++offset] * 2 ** 16 +
		self[++offset] * 2 ** 8 +
		last;
}

function readInt40BE(self, offset = 0) {
	validateNumber(offset, 'offset');
	const first = self[offset];
	const last = self[offset + 4];
	if (first === undefined || last === undefined)
		boundsError(offset, self.length - 5);

	return (first | (first & 2 ** 7) * 0x1fffffe) * 2 ** 32 +
		self[++offset] * 2 ** 24 +
		self[++offset] * 2 ** 16 +
		self[++offset] * 2 ** 8 +
		last;
}

function readUInt40BE(self, offset = 0) {
	validateNumber(offset, 'offset');
	const first = self[offset];
	const last = self[offset + 4];
	if (first === undefined || last === undefined)
		boundsError(offset, self.length - 5);

	return first * 2 ** 32 +
		self[++offset] * 2 ** 24 +
		self[++offset] * 2 ** 16 +
		self[++offset] * 2 ** 8 +
		last;
}

function readInt48BE(self, offset = 0) {
	validateNumber(offset, 'offset');
	const first = self[offset];
	const last = self[offset + 5];
	if (first === undefined || last === undefined)
		boundsError(offset, self.length - 6);

	const val = self[++offset] + first * 2 ** 8;
	return (val | (val & 2 ** 15) * 0x1fffe) * 2 ** 32 +
		self[++offset] * 2 ** 24 +
		self[++offset] * 2 ** 16 +
		self[++offset] * 2 ** 8 +
		last;
}

function readUInt48BE(self, offset = 0) {
	validateNumber(offset, 'offset');
	const first = self[offset];
	const last = self[offset + 5];
	if (first === undefined || last === undefined)
		boundsError(offset, self.length - 6);

	return (first * 2 ** 8 + self[++offset]) * 2 ** 32 +
		self[++offset] * 2 ** 24 +
		self[++offset] * 2 ** 16 +
		self[++offset] * 2 ** 8 +
		last;
}

function readBigInt64BE(self, offset = 0) {
	validateNumber(offset, 'offset');
	const first = self[offset];
	const last = self[offset + 7];
	if (first === undefined || last === undefined)
		boundsError(offset, self.length - 8);

	if (_bigint) {
		return _bigint._readBigInt64BE(self, offset);
	}

	console.warn('Not support bigint');

	const hi = 
		(first << 24) + // Overflow
		self[++offset] * 2 ** 16 +
		self[++offset] * 2 ** 8 +
		self[++offset];

	const lo = 
		self[++offset] * 2 ** 24 +
		self[++offset] * 2 ** 16 +
		self[++offset] * 2 ** 8 +
		last;

	return hi * 2 ** 32 + lo;
}

function readBigUInt64BE(self, offset = 0) {
	validateNumber(offset, 'offset');
	const first = self[offset];
	const last = self[offset + 7];
	if (first === undefined || last === undefined)
		boundsError(offset, self.length - 8);

	if (_bigint) {
		return _bigint._readBigUInt64BE(self, offset)
	}

	console.warn('Not support bigint');

	const hi = first * 2 ** 24 +
		self[++offset] * 2 ** 16 +
		self[++offset] * 2 ** 8 +
		self[++offset];

	const lo = self[++offset] * 2 ** 24 +
		self[++offset] * 2 ** 16 +
		self[++offset] * 2 ** 8 +
		last;

	return hi * 2 ** 32 + lo;
}

function readIntBE(self, offset = 0, byteLength = 4) {
	validateNumber(offset, 'offset');

	if (byteLength === 6)
		return readInt48BE(self, offset);
	if (byteLength === 5)
		return readInt40BE(self, offset);
	if (byteLength === 3)
		return readInt24BE(self, offset);
	if (byteLength === 4)
		return readInt32BE(self, offset);
	if (byteLength === 2)
		return readInt16BE(self, offset);
	if (byteLength === 1)
		return readInt8(self, offset);

	boundsError(byteLength, 6, 'byteLength');
}

function readUIntBE(self, offset = 0, byteLength = 4) {
	validateNumber(offset, 'offset');

	if (byteLength === 6)
		return readUInt48BE(self, offset);
	if (byteLength === 5)
		return readUInt40BE(self, offset);
	if (byteLength === 3)
		return readUInt24BE(self, offset);
	if (byteLength === 4)
		return readUInt32BE(self, offset);
	if (byteLength === 2)
		return readUInt16BE(self, offset);
	if (byteLength === 1)
		return readUInt8(self, offset);

	boundsError(byteLength, 6, 'byteLength');
}

// Read floats
function readFloatBackwards(self, offset = 0) {
	validateNumber(offset, 'offset');
	const first = self[offset];
	const last = self[offset + 3];
	if (first === undefined || last === undefined)
		boundsError(offset, self.length - 4);

	uInt8Float32Array[3] = first;
	uInt8Float32Array[2] = self[++offset];
	uInt8Float32Array[1] = self[++offset];
	uInt8Float32Array[0] = last;
	return float32Array[0];
}

function readFloatForwards(self, offset = 0) {
	validateNumber(offset, 'offset');
	const first = self[offset];
	const last = self[offset + 3];
	if (first === undefined || last === undefined)
		boundsError(offset, self.length - 4);

	uInt8Float32Array[0] = first;
	uInt8Float32Array[1] = self[++offset];
	uInt8Float32Array[2] = self[++offset];
	uInt8Float32Array[3] = last;
	return float32Array[0];
}

function readDoubleBackwards(self, offset = 0) {
	validateNumber(offset, 'offset');
	const first = self[offset];
	const last = self[offset + 7];
	if (first === undefined || last === undefined)
		boundsError(offset, self.length - 8);

	uInt8Float64Array[7] = first;
	uInt8Float64Array[6] = self[++offset];
	uInt8Float64Array[5] = self[++offset];
	uInt8Float64Array[4] = self[++offset];
	uInt8Float64Array[3] = self[++offset];
	uInt8Float64Array[2] = self[++offset];
	uInt8Float64Array[1] = self[++offset];
	uInt8Float64Array[0] = last;
	return float64Array[0];
}

function readDoubleForwards(self, offset = 0) {
	validateNumber(offset, 'offset');
	const first = self[offset];
	const last = self[offset + 7];
	if (first === undefined || last === undefined)
		boundsError(offset, self.length - 8);

	uInt8Float64Array[0] = first;
	uInt8Float64Array[1] = self[++offset];
	uInt8Float64Array[2] = self[++offset];
	uInt8Float64Array[3] = self[++offset];
	uInt8Float64Array[4] = self[++offset];
	uInt8Float64Array[5] = self[++offset];
	uInt8Float64Array[6] = self[++offset];
	uInt8Float64Array[7] = last;
	return float64Array[0];
}

// Write integers.
function writeU_Int8(buf, value, offset, min, max) {
	value = +value;
	// `checkInt()` can not be used here because it checks two entries.
	validateNumber(offset, 'offset');
	if (value > max || value < min) {
		throw ERR_OUT_OF_RANGE('value', `>= ${min} and <= ${max}`, value);
	}
	if (buf[offset] === undefined)
		boundsError(offset, buf.length - 1);

	buf[offset] = value;
	return offset + 1;
}

function writeU_Int16BE(buf, value, offset, min, max) {
	value = +value;
	checkInt(value, min, max, buf, offset, 1);

	buf[offset++] = (value >>> 8);
	buf[offset++] = value;
	return offset;
}

function writeU_Int32BE(buf, value, offset, min, max) {
	value = +value;
	checkInt(value, min, max, buf, offset, 3);

	buf[offset + 3] = value;
	value = value >>> 8;
	buf[offset + 2] = value;
	value = value >>> 8;
	buf[offset + 1] = value;
	value = value >>> 8;
	buf[offset] = value;
	return offset + 4;
}

function writeU_Int40BE(buf, value, offset, min, max) {
	value = +value;
	checkInt(value, min, max, buf, offset, 4);

	buf[offset++] = Math.floor(value * 2 ** -32);
	buf[offset + 3] = value;
	value = value >>> 8;
	buf[offset + 2] = value;
	value = value >>> 8;
	buf[offset + 1] = value;
	value = value >>> 8;
	buf[offset] = value;
	return offset + 4;
}

function writeU_Int48BE(buf, value, offset, min, max) {
	value = +value;
	checkInt(value, min, max, buf, offset, 5);

	const newVal = Math.floor(value * 2 ** -32);
	buf[offset++] = (newVal >>> 8);
	buf[offset++] = newVal;
	buf[offset + 3] = value;
	value = value >>> 8;
	buf[offset + 2] = value;
	value = value >>> 8;
	buf[offset + 1] = value;
	value = value >>> 8;
	buf[offset] = value;
	return offset + 4;
}

function writeInt8(self, value, offset = 0) {
	return writeU_Int8(self, value, offset, -0x80, 0x7f);
}

function writeUInt8(self, value, offset = 0) {
	return writeU_Int8(self, value, offset, 0, 0xff);
}

function writeInt16BE(self, value, offset = 0) {
	return writeU_Int16BE(self, value, offset, -0x8000, 0x7fff);
}

function writeUInt16BE(self, value, offset = 0) {
	return writeU_Int16BE(self, value, offset, 0, 0xffff);
}

function writeInt32BE(self, value, offset = 0) {
	return writeU_Int32BE(self, value, offset, -0x80000000, 0x7fffffff);
}

function writeUInt32BE(self, value, offset = 0) {
	return writeU_Int32BE(self, value, offset, 0, 0xffffffff);
}

function writeInt48BE(self, value, offset = 0) {
	return writeU_Int48BE(self, value, offset, -0x800000000000, 0x7fffffffffff);
}

function writeUInt48BE(self, value, offset = 0) {
	return writeU_Int48BE(self, value, offset, 0, 0xffffffffffffff);
}

function writeBigInt64BE(self, value, offset = 0) {
	return _bigint._writeBigInt64BE(self, value, offset);
}

function writeBigUInt64BE(self, value, offset = 0) {
	return _bigint._writeBigUInt64BE(self, value, offset);
}

function writeIntBE(self, value, offset = 0, byteLength = 4) {
	if (byteLength === 6)
		return writeU_Int48BE(self, value, offset, -0x800000000000, 0x7fffffffffff);
	if (byteLength === 5)
		return writeU_Int40BE(self, value, offset, -0x8000000000, 0x7fffffffff);
	if (byteLength === 3)
		return writeU_Int24BE(self, value, offset, -0x800000, 0x7fffff);
	if (byteLength === 4)
		return writeU_Int32BE(self, value, offset, -0x80000000, 0x7fffffff);
	if (byteLength === 2)
		return writeU_Int16BE(self, value, offset, -0x8000, 0x7fff);
	if (byteLength === 1)
		return writeU_Int8(self, value, offset, -0x80, 0x7f);

	boundsError(byteLength, 6, 'byteLength');
}

function writeUIntBE(self, value, offset = 0, byteLength = 4) {
	if (byteLength === 6)
		return writeU_Int48BE(self, value, offset, 0, 0xffffffffffffff);
	if (byteLength === 5)
		return writeU_Int40BE(self, value, offset, 0, 0xffffffffff);
	if (byteLength === 3)
		return writeU_Int24BE(self, value, offset, 0, 0xffffff);
	if (byteLength === 4)
		return writeU_Int32BE(self, value, offset, 0, 0xffffffff);
	if (byteLength === 2)
		return writeU_Int16BE(self, value, offset, 0, 0xffff);
	if (byteLength === 1)
		return writeU_Int8(self, value, offset, 0, 0xff);

	boundsError(byteLength, 6, 'byteLength');
}

// Write floats.
function writeFloatForwards(self, val, offset = 0) {
	val = +val;
	checkBounds(self, offset, 3);

	float32Array[0] = val;
	self[offset++] = uInt8Float32Array[0];
	self[offset++] = uInt8Float32Array[1];
	self[offset++] = uInt8Float32Array[2];
	self[offset++] = uInt8Float32Array[3];
	return offset;
}

function writeFloatBackwards(self, val, offset = 0) {
	val = +val;
	checkBounds(self, offset, 3);

	float32Array[0] = val;
	self[offset++] = uInt8Float32Array[3];
	self[offset++] = uInt8Float32Array[2];
	self[offset++] = uInt8Float32Array[1];
	self[offset++] = uInt8Float32Array[0];
	return offset;
}

function writeDoubleForwards(self, val, offset = 0) {
	val = +val;
	checkBounds(self, offset, 7);

	float64Array[0] = val;
	self[offset++] = uInt8Float64Array[0];
	self[offset++] = uInt8Float64Array[1];
	self[offset++] = uInt8Float64Array[2];
	self[offset++] = uInt8Float64Array[3];
	self[offset++] = uInt8Float64Array[4];
	self[offset++] = uInt8Float64Array[5];
	self[offset++] = uInt8Float64Array[6];
	self[offset++] = uInt8Float64Array[7];
	return offset;
}

function writeDoubleBackwards(self, val, offset = 0) {
	val = +val;
	checkBounds(self, offset, 7);

	float64Array[0] = val;
	self[offset++] = uInt8Float64Array[7];
	self[offset++] = uInt8Float64Array[6];
	self[offset++] = uInt8Float64Array[5];
	self[offset++] = uInt8Float64Array[4];
	self[offset++] = uInt8Float64Array[3];
	self[offset++] = uInt8Float64Array[2];
	self[offset++] = uInt8Float64Array[1];
	self[offset++] = uInt8Float64Array[0];
	return offset;
}

var readFloatBE = bigEndian ? readFloatForwards : readFloatBackwards;
var readDoubleBE = bigEndian ? readDoubleForwards : readDoubleBackwards;
var writeFloatBE = bigEndian ? writeFloatForwards : writeFloatBackwards;
var writeDoubleBE = bigEndian ? writeDoubleForwards : writeDoubleBackwards;

module.exports = exports = {
	get isBigInt() { return !!_bigint },
	// read
	readInt8, readUInt8,
	readInt16BE, readUInt16BE,
	readInt32BE, readUInt32BE,
	readInt40BE, readUInt40BE,
	readInt48BE, readUInt48BE,
	readBigInt64BE, readBigUInt64BE,
	readIntBE, readUIntBE,
	readFloatBE, readDoubleBE,
	// write
	writeInt8, writeUInt8,
	writeInt16BE, writeUInt16BE,
	writeInt32BE, writeUInt32BE,
	writeInt48BE, writeUInt48BE,
	writeBigInt64BE, writeBigUInt64BE,
	writeIntBE, writeUIntBE,
	writeFloatBE, writeDoubleBE,
};