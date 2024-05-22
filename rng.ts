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

import utils from './util';
import buffer, {IBuffer} from './buffer';

const rnds16 = buffer.alloc(16);

function getRnds(len: number) {
	return len == 16 ? rnds16: buffer.alloc(len);
}

// Math.random()-based (RNG)
//
// If all else fails, use Math.random().  It's fast, but is of unspecified
// quality.
var _rng: (len: number)=>IBuffer = function(len: number) {
	var rnds = getRnds(len);
	for (var i = 0, r = 0; i < 16; i++) {
		if ((i & 0x03) === 0) r = Math.random() * 0x100000000;
		rnds[i] = r >>> ((i & 0x03) << 3) & 0xff;
	}
	return rnds;
};

if (utils.isNode) { // node 
	const crypto = require('crypto');
	_rng = function(len: number) {
		return buffer.from(crypto.randomBytes(len));
	};
} else if (utils.isWeb) {

	// Unique ID creation requires a high quality random # generator.  In the
	// browser this is a little complicated due to unknown quality of Math.random()
	// and inconsistent support for the `crypto` API.  We do the best we can via
	// feature-detection

	var _self = globalThis as any;

	// getRandomValues needs to be invoked in a context where "this" is a Crypto
	// implementation. Also, find the complete implementation of crypto on IE11.
	let getRandomValues: (b: IBuffer)=>IBuffer =
		(
			typeof crypto != 'undefined' && 
			crypto.getRandomValues && crypto.getRandomValues.bind(crypto)
		) || 
		(
			typeof _self.msCrypto != 'undefined' && 
			typeof _self.msCrypto.getRandomValues == 'function' && 
			_self.msCrypto.getRandomValues.bind(_self.msCrypto)
		);

	if (getRandomValues) {
		// WHATWG crypto RNG - http://wiki.whatwg.org/wiki/Crypto
			// eslint-disable-line no-undef
		_rng = function(len: number) {
			var rnds = getRnds(len);
			return buffer.from(getRandomValues(rnds));
		};
	}
}

export function rng(len: number) {
	return _rng(len);
}

export function rng16() {
	return _rng(16);
}
