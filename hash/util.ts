
/*
 * A JavaScript implementation of the RSA Data Security, Inc. MD5 Message
 * Digest Algorithm, as defined in RFC 1321.
 * Version 2.1 Copyright (C) Paul Johnston 1999 - 2002.
 * Other contributors: Greg Holt, Andrew Kepert, Ydnar, Lostinet
 * Distributed under the BSD License
 * See http://pajhome.org.uk/crypt/md5 for more info.
 */

import _codec from '../_codec';
import buffer, {Bytes} from '../buffer';

/*
 * Configurable variables. You may need to tweak these to be compatible with
 * the server-side, but the defaults work in most cases.
 */
// var hexcase = 0;  /* hex output format. 0 - lowercase; 1 - uppercase        */
// var b64pad  = ""; /* base-64 pad character. "=" for strict RFC compliance   */
const chrsz   = 8;  /* bits per input character. 8 - ASCII; 16 - Unicode      */

const {
	encodeUTF8: str2bin, 
	convertHexString: bin2hex, 
	convertBase64String: bin2b64,
} = _codec;

/*
 * Convert a string to an array of little-endian words
 * If chrsz is ASCII, characters >255 have their hi-byte silently ignored.
 */
function bin2binl(bin: Bytes)
{
	var binl: number[] = [];
	for (var i = 0; i < bin.length * chrsz; i += chrsz)
		binl[i>>5] |= bin[i / chrsz] << (i%32);
	return binl;
}

/*
 * Convert an array of little-endian words to a bin
 */
function binl2bin(binl: number[])
{
	var bin: number[] = [];
	for(var i = 0; i < binl.length * 4; i++)
	{
		bin.push((binl[i>>2] >> ((i%4)*8)) & 0xFF);
	}
	return buffer.from(bin);
}

/*
 * Convert an array of little-endian words to a string
 */
function bin2str(bin: Bytes)
{
	var str = '';
	for(var i = 0; i < bin.length; i++)
		str += String.fromCharCode(bin[i]);
	return str;
}

export default {
	chrsz,
	str2bin,
	bin2binl,
	binl2bin,
	bin2str,
	bin2hex,
	bin2b64,
};