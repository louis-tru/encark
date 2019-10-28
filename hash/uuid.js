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

if (require('../util').haveNode) {
	var crypto = require('crypto');
	var rng = function nodeRNG() {
		return crypto.randomBytes(16);
	};
} else {

	// Unique ID creation requires a high quality random # generator.  In the
	// browser this is a little complicated due to unknown quality of Math.random()
	// and inconsistent support for the `crypto` API.  We do the best we can via
	// feature-detection

	// getRandomValues needs to be invoked in a context where "this" is a Crypto
	// implementation. Also, find the complete implementation of crypto on IE11.
	var getRandomValues = 
		(
			typeof(crypto) != 'undefined' && 
			crypto.getRandomValues && crypto.getRandomValues.bind(crypto)
		) || 
		(
			typeof(msCrypto) != 'undefined' && 
			typeof window.msCrypto.getRandomValues == 'function' && 
			msCrypto.getRandomValues.bind(msCrypto)
		);

	if (getRandomValues) {
		// WHATWG crypto RNG - http://wiki.whatwg.org/wiki/Crypto
		var rnds8 = new Uint8Array(16); // eslint-disable-line no-undef

		var rng = function whatwgRNG() {
			getRandomValues(rnds8);
			return rnds8;
		};
	} else {
		// Math.random()-based (RNG)
		//
		// If all else fails, use Math.random().  It's fast, but is of unspecified
		// quality.
		var rnds = new Array(16);

		var rng = function mathRNG() {
			for (var i = 0, r; i < 16; i++) {
				if ((i & 0x03) === 0) r = Math.random() * 0x100000000;
				rnds[i] = r >>> ((i & 0x03) << 3) & 0xff;
			}

			return rnds;
		};
	}
}

/**
 * Convert array of 16 byte values to UUID string format of the form:
 * XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX
 */
var byteToHex = [];
for (var i = 0; i < 256; ++i) {
	byteToHex[i] = (i + 0x100).toString(16).substr(1);
}

function bytesToUuid(buf, offset) {
	var i = offset || 0;
	var bth = byteToHex;
	// join used to fix memory issue caused by concatenation: https://bugs.chromium.org/p/v8/issues/detail?id=3175#c4
	return ([bth[buf[i++]], bth[buf[i++]], 
	bth[buf[i++]], bth[buf[i++]], '-',
	bth[buf[i++]], bth[buf[i++]], '-',
	bth[buf[i++]], bth[buf[i++]], '-',
	bth[buf[i++]], bth[buf[i++]], '-',
	bth[buf[i++]], bth[buf[i++]],
	bth[buf[i++]], bth[buf[i++]],
	bth[buf[i++]], bth[buf[i++]]]).join('');
}

function uuid_v4() {
	var rnds = rng();

	// Per 4.4, set bits for version and `clock_seq_hi_and_reserved`
	rnds[6] = (rnds[6] & 0x0f) | 0x40;
	rnds[8] = (rnds[8] & 0x3f) | 0x80;

	return bytesToUuid(rnds);
}

uuid_v4.rng = rng;

module.exports = uuid_v4;