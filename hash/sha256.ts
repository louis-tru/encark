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

import utils from '../util';
import util from './util';
import buffer, {IBuffer, Bytes} from '../buffer';

const {bin2str,bin2hex,bin2b64} = util;

/*
 * These are the functions you'll usually want to call
 * They take string arguments and return either hex or base-64 encoded strings
 */
export function sha256_hex(s: string | Bytes) { return bin2hex(sha256(s)) }
export function sha256_b64(s: string | Bytes) { return bin2b64(sha256(s)) }
export function sha256_str(s: string | Bytes) { return bin2str(sha256(s)) }

export var sha256: (s: string | Bytes)=>IBuffer;

if (utils.isNode) {
	let crypto = require('crypto');
	sha256 = (s: string | Bytes)=>buffer.from(crypto.createHash('sha256').update(s).digest());
} else {
	sha256 = require('./_sha256').default;
}

export default sha256;

/*
 * Perform a simple self-test to see if the VM is working
 */
function sha256_vm_test()
{
	var crypto = require('crypto');
	var sha1_ = crypto.createHash('sha256');
	sha1_.update('abc');
	console.log(sha1_.digest());
	console.log(buffer.from(sha256('abc')));

	var hash = sha256_hex("abc");
	console.log(hash, '\nba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
	return hash == "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
}

// sha256_vm_test();