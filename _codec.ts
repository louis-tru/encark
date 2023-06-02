/* ***** BEGIN LICENSE BLOCK *****
 * Distributed under the BSD license:
 *
 * Copyright (c) 2015, blue.chu
 * All rights reserved.
 * 
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *     * Redistributions of source code must retain the above copyright
 *       notice, self list of conditions and the following disclaimer.
 *     * Redistributions in binary form must reproduce the above copyright
 *       notice, self list of conditions and the following disclaimer in the
 *       documentation and/or other materials provided with the distribution.
 *     * Neither the name of blue.chu nor the
 *       names of its contributors may be used to endorse or promote products
 *       derived from self software without specific prior written permission.
 * 
 * self SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
 * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL blue.chu BE LIABLE FOR ANY
 * DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
 * LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
 * ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF self
 * SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 * 
 * ***** END LICENSE BLOCK ***** */

import utils from './util';
import errno from './errno';
import base_x, {Encoder} from './_base_x';

type ArrayNumber = ArrayLike<number>;

var b64pad = '=';
var hex_tab = '0123456789abcdef';
var base64_tab = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
var hex_keys = new Map<string, number>();
var base64_keys = new Map<string, number>([['=', 65 ]]);

hex_tab.split('').forEach((e,i)=>(hex_keys.set(e, i), hex_keys.set(e.toUpperCase(), i)));
base64_tab.split('').forEach((e,i)=>base64_keys.set(e, i));

const base58 = function() {
	var _base: Encoder;
	return ()=>{
		if (!_base)
			_base = base_x('123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz');
		return _base;
	};
}();

// ---------------------- utf8 ----------------------

// string => bytes
// convert unicode to utf-8 codeing
function encodeUTF8Word(unicode: number): number[] {
	// 1字节 0xxxxxxx
	// 2字节 110xxxxx 10xxxxxx
	// 3字节 1110xxxx 10xxxxxx 10xxxxxx
	// 4字节 11110xxx 10xxxxxx 10xxxxxx 10xxxxxx
	// 5字节 111110xx 10xxxxxx 10xxxxxx 10xxxxxx 10xxxxxx
	// 6字节 1111110x 10xxxxxx 10xxxxxx 10xxxxxx 10xxxxxx 10xxxxxx

	if (unicode < 0x7F + 1) {               // 单字节编码
		return [unicode];
	}
	else if (unicode < 0x7FF + 1) {         // 两字节编码
		return [
			0b11000000 | (unicode >> 6),
			0b10000000 | (unicode >> 0 & 0b00111111),
		];
	} else if (unicode < 0xFFFF + 1) {      // 三字节编码
		return [
			0b11100000 | (unicode >> 12),
			0b10000000 | (unicode >> 6 & 0b00111111),
			0b10000000 | (unicode >> 0 & 0b00111111),
		];
	} else if (unicode < 0x10FFFF + 1) {    // 四字节编码
		return [
			0b11110000 | (unicode >> 18),
			0b10000000 | (unicode >> 12 & 0b00111111),
			0b10000000 | (unicode >> 6  & 0b00111111),
			0b10000000 | (unicode >> 0  & 0b00111111),
		];
	} else if (unicode < 0x3FFFFFF + 1) {   // 五字节编码
		if (unicode > 0x200000 - 1) {
			return [
				0b11111000 | (unicode >> 24),
				0b10000000 | (unicode >> 18 & 0b00111111),
				0b10000000 | (unicode >> 12 & 0b00111111),
				0b10000000 | (unicode >> 6  & 0b00111111),
				0b10000000 | (unicode >> 0  & 0b00111111),
			];
		} else { // 这个区间没有编码
			return [];
		}
	} else {                                //六字节编码
		return [
			0b11111100 | (unicode >> 30),
			0b10000000 | (unicode >> 24 & 0b00111111),
			0b10000000 | (unicode >> 18 & 0b00111111),
			0b10000000 | (unicode >> 12 & 0b00111111),
			0b10000000 | (unicode >> 6  & 0b00111111),
			0b10000000 | (unicode >> 0  & 0b00111111),
		];
	}
}

// convert utf8 bytes to unicode
function decodeUTF8Word(bytes: ArrayNumber, offset: number) {
	var str = offset;
	var c = bytes[str]; str++;
	if ((c & 0x80) == 0) { // 小于 128 (c & 10000000) == 00000000
		//uft8单字节编码 0xxxxxxx
		return [1, c];
	}
	else if ((c & 0xe0) == 0xc0) { // (c & 11100000) == 11000000
		//uft8双字节编码 110xxxxx 10xxxxxx
		var r_c = 0;
		var c2 = bytes[str]; str++;
		r_c |= (c2 & ~0xc0);
		r_c |= ((c & ~0xe0) << 6);
		return [2,r_c];
	}
	else if ((c & 0xf0) == 0xe0) { //(c & 11110000) == 11100000
		//uft8三字节编码 1110xxxx 10xxxxxx 10xxxxxx
		var r_c = 0;
		var c2 = bytes[str]; str++;
		var c3 = bytes[str]; str++;
		r_c |= (c3 & ~0xc0);
		r_c |= ((c2 & ~0xc0) << 6);
		r_c |= ((c & ~0xf0) << 12);
		return [3,r_c];
	}
	else if ((c & 0xf8) == 0xf0) { // (c & 11111000) == 11110000
		//uft8四字节编码 11110xxx 10xxxxxx 10xxxxxx 10xxxxxx
		var r_c = 0;
		var c2 = bytes[str]; str++;
		var c3 = bytes[str]; str++;
		var c4 = bytes[str]; str++;
		r_c |= (c4 & ~0xc0);
		r_c |= ((c3 & ~0xc0) << 6);
		r_c |= ((c2 & ~0xc0) << 12);
		r_c |= ((c & ~0xf8) << 18);
		return [4,r_c];
	}
	else if ((c & 0xfc) == 0xf8) { // (c & 11111100) == 11111000
		//uft8五字节编码 , utf8最多可用6个字节表示31位二进制
		var r_c = 0;
		var c2 = bytes[str]; str++;
		var c3 = bytes[str]; str++;
		var c4 = bytes[str]; str++;
		var c5 = bytes[str]; str++;
		r_c |= (c5 & ~0xc0);
		r_c |= ((c4 & ~0xc0) << 6);
		r_c |= ((c3 & ~0xc0) << 12);
		r_c |= ((c2 & ~0xc0) << 18);
		r_c |= ((c & ~0xfc) << 24);
		return [5,r_c];
	}
	else if ((c & 0xfe) == 0xfc) { // (c & 11111110) == 11111100
		//uft8六字节编码
		var r_c = 0;
		var c2 = bytes[str]; str++;
		var c3 = bytes[str]; str++;
		var c4 = bytes[str]; str++;
		var c5 = bytes[str]; str++;
		var c6 = bytes[str]; str++;
		r_c |= (c6 & ~0xc0);
		r_c |= ((c5 & ~0xc0) << 6);
		r_c |= ((c4 & ~0xc0) << 12);
		r_c |= ((c3 & ~0xc0) << 18);
		r_c |= ((c2 & ~0xc0) << 24);
		r_c |= ((c & ~0xfe) << 30);
		return [6,r_c];
	}
	return [1,0]; // skip char
}

// convert unicode to utf-16 codeing
function encodeUTF16Word(unicode: number): number[] {
	// Unicode renge            Unicode                   UTF-16                                bytes
	// 0000 0000 ~ 0000 FFFF    xxxxxxxx xxxxxxxx         xxxxxxxx xxxxxxxx                     2
	// 0001 0000 ~ 0010 FFFF    yyyy yyyy yyxx xxxx xxxx  110110yy yyyyyyyy 110111xx xxxxxxxx   4
	if (unicode < 0xFFFF + 1) {  // 双字节编码 0xffff
		return [unicode];
	} else {                       // 四字节编码 0xffffffff
		unicode -= 0x10000;
		return [
			0b1101100000000000 | (unicode >> 10),
			0b1101110000000000 | (unicode & 0b1111111111),   // low
		];
	}
}

function decodeUTF16Word(bytes: ArrayNumber, offset: number) {
	let str = offset;
	let c = bytes[str]; str++;
	if (c >> 10 == 0b110110) { // 4 bytes encode
		let c2 = bytes[str];
		if (c2 >> 10 == 0b110111) {
			return [2, (((c & 0b1111111111) << 10) | (c2 & 0b1111111111)) + 0x10000];
		} else { // error use 2 bytes encode
			return [1, c];
		}
	} else { // 2 bytes encode 0xxxxxxx
		return [1, c];
	}
}

// --------------------------------------------------

function encodeUTF8WordLength(unicode: number): number {
	if (unicode < 0x7F + 1) {             // 单字节编码
		return 1;
	} else if (unicode < 0x7FF + 1) {     // 两字节编码
		return 2;
	} else if (unicode < 0xFFFF + 1) {    // 三字节编码
		return 3;
	} else if (unicode < 0x10FFFF + 1) {  // 四字节编码
		return 4;
	} else if (unicode < 0x3FFFFFF + 1) { // 五字节编码
		if (unicode > 0x200000 - 1) {
			return 5;
		} else { // 这个区间没有编码
			return 1;
		}
	} else {                              //六字节编码
		return 6;
	}
}

function encodeUTF16WordLength(unicode: number): number {
	if (unicode < 0xFFFF + 1) {  // bytes 2
		return 1;
	} else {                     // bytes 4
		return 2;
	}
}

function encodeUTF8Length(str: string): number {
	var r = 0;
	for (var i = 0, l = str.length; i < l; i++) {
		r += encodeUTF8WordLength(str.charCodeAt(i));
	}
	return r;
}

// string => bytes
// Convert str to utf8 to a bytes
function encodeUTF8(str: string): number[] {
	var bytes: number[] = [];
	for (let i = 0, l = str.length; i < l;) {
		let [j,unicode] = decodeUTF16Word([
			str.charCodeAt(i),
			str.charCodeAt(i+1)
		], 0);
		bytes.push( ...encodeUTF8Word(unicode) );
		i += j;
	}
	return bytes;
}

// convert utf8 bytes to a str
function decodeUTF8From(bytes: ArrayNumber, start: number, end: number): string {
	checkOffset(bytes, start, end);
	var str = [];
	for(var i = start; i < end;) {
		let [len,unicode] = decodeUTF8Word(bytes, i);
		let utf16 = encodeUTF16Word(unicode);
		str.push(String.fromCharCode(...utf16));
		i+=len;
	}
	return str.join('');
}

// bytes => string
function decodeUTF8(bytes: ArrayNumber): string {
	return decodeUTF8From(bytes, 0, bytes.length);
}

// ---------------------- utf8 end ----------------------

// encode

// string => bytes
function encodeLatin1From(str: string): number[] {
	var bytes: number[] = [];
	for (var i = 0, l = str.length; i < l; i++)
		bytes.push(str.charCodeAt(i) % 256 );
	return bytes;
}

// string => bytes
function encodeAsciiFrom(str: string): number[] {
	var bytes: number[] = [];
	for (var i = 0, l = str.length; i < l; i++)
		bytes.push(str.charCodeAt(i) % 128 );
	return bytes;
}

// bytes => string
function encodeHexFrom(bytes: ArrayNumber, start: number, end: number): string {
	checkOffset(bytes, start, end);
	var str = '';
	for(var i = start; i < end; i++) {
		str += hex_tab.charAt(bytes[i] >> 4) + hex_tab.charAt(bytes[i] & 0xF);
	}
	return str;
}

// bytes => string
function encodeBase64From(bytes: ArrayNumber, start: number, end: number): string {
	checkOffset(bytes, start, end);
	var size = end - start;
	var str = '';
	for (var i = start; i < end; i += 3) {
		var triplet = (bytes[i] << 16) | (bytes[i+1] << 8) | bytes[i+2];
		for (var j = 0; j < 4; j++) {
			if (i * 8 + j * 6 > size * 8)
				str += b64pad;
			else 
				str += base64_tab.charAt((triplet >> 6*(3-j)) & 0x3F);
		}
	}
	return str;
}

function encodeBase58From(bytes: ArrayNumber, start: number, end: number): string {
	return base58().encode(bytes, start, end);
}

// decode

function checkOffset(bytes: ArrayNumber, start: number, end: number): void {
	utils.assert(start >= 0, errno.ERR_BAD_ARGUMENT);
	utils.assert(end >= start, errno.ERR_BAD_ARGUMENT);
	utils.assert(end <= bytes.length, errno.ERR_BAD_ARGUMENT);
	// utils.assert(end >= start, errno.ERR_BAD_ARGUMENT);
}

// bytes => string
function decodeLatin1From(bytes: ArrayNumber, start: number, end: number): string {
	checkOffset(bytes, start, end);
	var str = '';
	for(var i = start; i < end; i++)
		str += String.fromCharCode(bytes[i]);
	return str;
}

// bytes => string
function decodeAsciiFrom(bytes: ArrayNumber, start: number, end: number): string {
	checkOffset(bytes, start, end);
	var str = '';
	for(var i = start; i < end; i++)
		str += String.fromCharCode(bytes[i] % 128);
	return str;
}

// hex string => bytes
function decodeHex(str: string): number[] {
	var ERR_BAD_ARGUMENT = errno.ERR_BAD_ARGUMENT;
	utils.assert(str.length % 2 === 0, ERR_BAD_ARGUMENT);
	var bytes = [];
	for (var i = 0, l = str.length; i < l; i+=2) {
		var a = <number>hex_keys.get(str[i]);
		var b = <number>hex_keys.get(str[i+1]);
		// utils.assert(a !== undefined, ERR_BAD_ARGUMENT);
		// utils.assert(b !== undefined, ERR_BAD_ARGUMENT);
		bytes.push( a << 4 | b );
	}
	return bytes;
}

function isHexString(str: string) {
	if (str.length % 2 !== 0)
		return false;
	return /^[0-9a-f]+$/i.test(str);
}

function isBase64String(str: string) {
	if (str.length % 4 !== 0)
		return false;
	return /^[0-9a-f\+\/\=]+$/i.test(str);
}

function isBase58String(str: string) {
	return /^[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]+$/i.test(str);
}

// base64 string => bytes
function decodeBase64(str: string): number[] {
	// var ERR_BAD_ARGUMENT = errno.ERR_BAD_ARGUMENT;
	// utils.assert(str.length % 4 === 0, ERR_BAD_ARGUMENT);
	let mod = str.length % 4;
	if (mod)
		str += Array.from({ length: 5 - mod }).join('=');
	var bytes = [];
	for (var i = 0, l = str.length; i < l; i+=4) {
		var a = <number>base64_keys.get(str[i]);
		var b = <number>base64_keys.get(str[i+1]);
		var c = <number>base64_keys.get(str[i+2]);
		var d = <number>base64_keys.get(str[i+3]);
		// utils.assert(a !== undefined, ERR_BAD_ARGUMENT);
		// utils.assert(b !== undefined, ERR_BAD_ARGUMENT);
		// utils.assert(c !== undefined, ERR_BAD_ARGUMENT);
		// utils.assert(d !== undefined, ERR_BAD_ARGUMENT);
		// console.log(str[i],str[i+1],str[i+2],str[i+3])
		// console.log(a,b,c,d)
		var triplet;
		triplet = (a << 18) | (b << 12);
		bytes.push((triplet >> 16) & 0xff); // 1 bytes
		if (c == 65)
			continue; 
		triplet |= (c << 6); 
		bytes.push((triplet >> 8) & 0xff); // 2 bytes
		if (d == 65)
			continue;
		triplet |= d;
		bytes.push(triplet & 0xff); // 3 bytes
	}
	return bytes;
}

// base58 string => bytes
function decodeBase58(str: string): Uint8Array {
	return base58().decode(str);
}

/*
 * Convert an array of bytes to a hex string.
 */
function convertHexString(bytes: ArrayNumber) {
	return encodeHexFrom(bytes, 0, bytes.length);
}

/*
 * Convert an array of bytes to a base64 string.
 */
function convertBase64String(bytes: ArrayNumber) {
	return encodeBase64From(bytes, 0, bytes.length);
}

/*
 * Convert an array of bytes to a base64 string.
 */
function convertBase58String(bytes: ArrayNumber) {
	return encodeBase58From(bytes, 0, bytes.length);
}

export default {
	// is
	isHexString,
	isBase64String,
	isBase58String,
	// encode
	encodeUTF8Word,
	encodeUTF8,
	encodeLatin1From,
	encodeAsciiFrom,
	encodeHexFrom,
	encodeBase64From,
	encodeBase58From,
	encodeUTF16Word,
	decodeUTF16Word,
	encodeUTF16WordLength,
	// decode
	decodeUTF8Word,
	decodeUTF8From,
	decodeUTF8,
	decodeLatin1From,
	decodeAsciiFrom,
	decodeHex,
	decodeBase64,
	decodeBase58,
	// ext
	convertHexString,
	convertBase64String,
	convertBase58String,
	// length
	encodeUTF8WordLength,
	encodeUTF8Length,
};