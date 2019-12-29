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

import utils from '../util';
import util from './util';
import buffer, {Buffer, Bytes} from '../buffer';

const {bin2str,bin2hex,bin2b64} = util;

/*
 * These are the functions you'll usually want to call
 * They take string arguments and return either hex or base-64 encoded strings
 */
export function sha1_hex(s: string | Bytes) { return bin2hex(sha1(s)) }
export function sha1_b64(s: string | Bytes) { return bin2b64(sha1(s)) }
export function sha1_str(s: string | Bytes) { return bin2str(sha1(s)) }

/*
 * Perform a simple self-test to see if the VM is working
 */
function sha1_vm_test()
{
	var crypto = require('crypto');
	var sha1_ = crypto.createHash('sha1');
	sha1_.update('abc');
	console.log(sha1_.digest());
	console.log(buffer.from(sha1('abc')));

	var hash = sha1_hex("abc");
	console.log(hash, '\na9993e364706816aba3e25717850c26c9cd0d89d');
	return hash == "a9993e364706816aba3e25717850c26c9cd0d89d";
}

// sha1_vm_test();

var sha1: (s: string | Bytes)=>Buffer;

if (utils.haveNode) {
	let crypto = require('crypto');
	sha1 = (s: string | Bytes)=><Buffer>crypto.createHash('sha1').update(s).digest();
} else {
	sha1 = require('./_sha1').default;
}

export default sha1;