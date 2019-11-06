
/*
 * A JavaScript implementation of the RSA Data Security, Inc. MD5 Message
 * Digest Algorithm, as defined in RFC 1321.
 * Version 2.1 Copyright (C) Paul Johnston 1999 - 2002.
 * Other contributors: Greg Holt, Andrew Kepert, Ydnar, Lostinet
 * Distributed under the BSD License
 * See http://pajhome.org.uk/crypt/md5 for more info.
 */

/*
 * Configurable variables. You may need to tweak these to be compatible with
 * the server-side, but the defaults work in most cases.
 */
var hexcase = 0;  /* hex output format. 0 - lowercase; 1 - uppercase        */
var b64pad  = ""; /* base-64 pad character. "=" for strict RFC compliance   */
var chrsz   = 8;  /* bits per input character. 8 - ASCII; 16 - Unicode      */

// convert unicode to utf-8 codeing
function unicode2utf8(unicode) {
	var bytes = [];
	if (unicode < 0x7F + 1) {             // 单字节编码
		bytes.push(unicode);
	} else {
		var len = 1;
		if (unicode < 0x7FF + 1) {            // 两字节编码
			len = 2;
			bytes.push(0b11000000);
		} else if (unicode < 0xFFFF + 1) {      // 三字节编码
			len = 3;
			bytes.push(0b11100000);
		} else if (unicode < 0x10FFFF + 1) {    // 四字节编码
			len = 4;
			bytes.push(0b11110000);
		} else if (unicode < 0x3FFFFFF + 1) {   // 五字节编码
			if (unicode > 0x200000 - 1) {
				len = 5;
				bytes.push(0b11111000);
			} else { // 这个区间没有编码
				return bytes;
			}
		} else {                               //六字节编码
			len = 6;
			bytes.push(0b11111100);
		}
		for (var i = len - 1; i > 0; i--) {
			bytes[i] = 0b10000000 | (unicode & 0b00111111);
			unicode >>= 6;
		}
		bytes[0] |= unicode;
	}
	return bytes;
}

// 解码单个unicode
function bin2str_utf8_next(bin, index) {
	var str = index;
	var c = bin[str]; str++;
	if ((c & 0x80) == 0) { // 小于 128 (c & 10000000) == 00000000
		//uft8单字节编码 0xxxxxxx
		return [1, c];
	}
	else if ((c & 0xe0) == 0xc0) { // (c & 11100000) == 11000000
		//uft8双字节编码 110xxxxx 10xxxxxx
		var r_c = 0;
		var c2 = bin[str]; str++;
		r_c |= (c2 & ~0xc0);
		r_c |= ((c & ~0xe0) << 6);
		return [2,r_c];
	}
	else if ((c & 0xf0) == 0xe0) { //(c & 11110000) == 11100000
		//uft8三字节编码 1110xxxx 10xxxxxx 10xxxxxx
		var r_c = 0;
		var c2 = bin[str]; str++;
		var c3 = bin[str]; str++;
		r_c |= (c3 & ~0xc0);
		r_c |= ((c2 & ~0xc0) << 6);
		r_c |= ((c & ~0xf0) << 12);
		return [3,r_c];
	}
	else if ((c & 0xf8) == 0xf0) { // (c & 11111000) == 11110000
		//uft8四字节编码 11110xxx 10xxxxxx 10xxxxxx 10xxxxxx
		var r_c = 0;
		var c2 = bin[str]; str++;
		var c3 = bin[str]; str++;
		var c4 = bin[str]; str++;
		r_c |= (c4 & ~0xc0);
		r_c |= ((c3 & ~0xc0) << 6);
		r_c |= ((c2 & ~0xc0) << 12);
		r_c |= ((c & ~0xf8) << 18);
		return [4,r_c];
	}
	else if ((c & 0xfc) == 0xf8) { // (c & 11111100) == 11111000
		//uft8五字节编码 , utf8最多可用6个字节表示31位二进制
		var r_c = 0;
		var c2 = bin[str]; str++;
		var c3 = bin[str]; str++;
		var c4 = bin[str]; str++;
		var c5 = bin[str]; str++;
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
		var c2 = bin[str]; str++;
		var c3 = bin[str]; str++;
		var c4 = bin[str]; str++;
		var c5 = bin[str]; str++;
		var c6 = bin[str]; str++;
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

// Convert str to utf8 to a bin
function str2bin(str) {
	var bin = [];
	for (var i = 0, l = str.length; i < l; i++) {
		bin.push( ...unicode2utf8(str.charCodeAt(i)) );
	}
	return bin;
}

// convert utf8 bin to a str
function bin2str_utf8(bin)
{
	var str = [];
	for(var i = 0; i < bin.length;) {
		var [len,unicode] = bin2str_utf8_next(bin, i);
		str.push(String.fromCharCode(unicode));
		i+=len;
	}
	return str.join('');
}

/*
 * Convert a string to an array of little-endian words
 * If chrsz is ASCII, characters >255 have their hi-byte silently ignored.
 */
function bin2binl(bin)
{
	var binl = [];
	for (var i = 0; i < bin.length * chrsz; i += chrsz)
		binl[i>>5] |= bin[i / chrsz] << (i%32);
	return binl;
}

/*
 * Convert an array of little-endian words to a bin
 */
function binl2bin(binl)
{
	var bin = [];
	for(var i = 0; i < binl.length * 4; i++)
	{
		bin.push((binl[i>>2] >> ((i%4)*8)) & 0xFF);
	}
	return bin;
}

/*
 * Convert an array of little-endian words to a string
 */
function bin2str(bin)
{
	var str = '';
	for(var i = 0; i < bin.length; i++)
		str += String.fromCharCode(bin[i]);
	return str;
}

/*
 * Convert an array of bytes to a hex string.
 */
function bin2hex(bin)
{
	var hex_tab = hexcase ? "0123456789ABCDEF" : "0123456789abcdef";
	var str = "";
	for(var i = 0; i < bin.length; i++)
	{
		str += hex_tab.charAt(bin[i] >> 4) + hex_tab.charAt(bin[i] & 0xF);
	}
	return str;
}

/*
 * Convert an array of bytes to a base-64 string
 */
function bin2b64(bin)
{
	var tab = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
	var str = "";
	for (var i = 0; i < bin.length; i += 3)
	{
		var triplet = (bin[i] << 16) | (bin[i+1] << 8) | bin[i+2];
		for (var j = 0; j < 4; j++)
		{
			if (i * 8 + j * 6 > bin.length * 8) str += b64pad;
			else str += tab.charAt((triplet >> 6*(3-j)) & 0x3F);
		}
	}
	return str;
}

module.exports = {
	hexcase,
	b64pad,
	chrsz,
	str2bin,
	bin2binl,
	binl2bin,
	bin2str,
	bin2str_utf8,
	bin2hex,
	bin2b64,
};