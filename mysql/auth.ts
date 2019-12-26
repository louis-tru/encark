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

// import Buffer from '../buffer';
import * as crypto from 'crypto';
import { Bytes } from '../buffer';

export function xor(a: string, b: string): Buffer {
	var _a = Buffer.from(a, 'binary');
	var _b = Buffer.from(b, 'binary');
	var result = Buffer.allocUnsafe(a.length);
	for (var i = 0; i < a.length; i++) {
		result[i] = (_a[i] ^ _b[i]);
	}
	return result;
}

export function sha1(msg: string): string {
	var hash = crypto.createHash('sha1');
	hash.update(msg, 'latin1');
	return hash.digest('latin1');
}

// This is a port of sql/password.c:hash_password which needs to be used for
// pre-4.1 passwords.
export function hashPassword(pwd: string | Buffer) {
	var nr = [0x5030, 0x5735],
		add = 7,
		nr2 = [0x1234, 0x5671],
		result = Buffer.alloc(8);

	var password: Buffer = <Buffer>pwd;

	if (typeof pwd == 'string') {
		password = Buffer.from(pwd);
	}

	for (var i = 0; i < password.length; i++) {
		var c = password[i];
		if (c == 32 || c == 9) {
			// skip space in password
			continue;
		}

		// nr^= (((nr & 63)+add)*c)+ (nr << 8);
		// nr = xor(nr, add(mul(add(and(nr, 63), add), c), shl(nr, 8)))
		nr = xor32(nr, add32(mul32(
			add32(and32(nr, [0, 63]), [0, add]), [0, c]), shl32(nr, 8)));

		// nr2+=(nr2 << 8) ^ nr;
		// nr2 = add(nr2, xor(shl(nr2, 8), nr))
		nr2 = add32(nr2, xor32(shl32(nr2, 8), nr));

		// add+=tmp;
		add += c;
	}

	int31Write(result, nr, 0);
	int31Write(result, nr2, 4);

	return result;
}

export function int31Write(buffer: Bytes, number: number[], offset: number) {
	buffer[offset] = (number[0] >> 8) & 0x7F;
	buffer[offset + 1] = (number[0]) & 0xFF;
	buffer[offset + 2] = (number[1] >> 8) & 0xFF;
	buffer[offset + 3] = (number[1]) & 0xFF;
}

export function token(password: string, scramble: Buffer) {
	if (!password) {
		return Buffer.alloc(0);
	}
	// password must be in binary format, not utf8
	var stage1 = sha1((Buffer.from(password, 'utf8')).toString('binary'));
	var stage2 = sha1(stage1);
	var stage3 = sha1(scramble.toString('binary') + stage2);
	return xor(stage3, stage1);
}

interface NumberLimit {
	max_value: number;
	max_value_dbl: number;
	seed1: number;
	seed2: number;
};

export function randomInit(seed1: number, seed2: number): NumberLimit {
	return {
		max_value: 0x3FFFFFFF,
		max_value_dbl: 0x3FFFFFFF,
		seed1: seed1 % 0x3FFFFFFF,
		seed2: seed2 % 0x3FFFFFFF
	};
}

export function myRnd(r: NumberLimit) {
	r.seed1 = (r.seed1 * 3 + r.seed2) % r.max_value;
	r.seed2 = (r.seed1 + r.seed2 + 33) % r.max_value;

	return r.seed1 / r.max_value_dbl;
}

export function scramble323(message: string, password: string) {
	var to = Buffer.alloc(8),
		hashPass = hashPassword(password),
		hashMessage = hashPassword(message.slice(0, 8)),
		seed1 = int32Read(hashPass, 0) ^ int32Read(hashMessage, 0),
		seed2 = int32Read(hashPass, 4) ^ int32Read(hashMessage, 4),
		r = randomInit(seed1, seed2);

	for (var i = 0; i < 8; i++) {
		to[i] = Math.floor(myRnd(r) * 31) + 64;
	}
	var extra = (Math.floor(myRnd(r) * 31));

	for (var i = 0; i < 8; i++) {
		to[i] ^= extra;
	}

	return to;
}

export function fmt32(x: Bytes) {
	var a = x[0].toString(16),
		b = x[1].toString(16);

	if (a.length == 1) a = '000' + a;
	if (a.length == 2) a = '00' + a;
	if (a.length == 3) a = '0' + a;
	if (b.length == 1) b = '000' + b;
	if (b.length == 2) b = '00' + b;
	if (b.length == 3) b = '0' + b;
	return '' + a + '/' + b;
}

export function xor32(a: Bytes, b: Bytes) {
	return [a[0] ^ b[0], a[1] ^ b[1]];
}

export function add32(a: Bytes, b: Bytes) {
	var w1 = a[1] + b[1],
		w2 = a[0] + b[0] + ((w1 & 0xFFFF0000) >> 16);

	return [w2 & 0xFFFF, w1 & 0xFFFF];
}

export function mul32(a: Bytes, b: Bytes) {
	// based on this example of multiplying 32b ints using 16b
	// http://www.dsprelated.com/showmessage/89790/1.php
	var w1 = a[1] * b[1],
		w2 = (((a[1] * b[1]) >> 16) & 0xFFFF) + ((a[0] * b[1]) & 0xFFFF) + (a[1] * b[0] & 0xFFFF);

	return [w2 & 0xFFFF, w1 & 0xFFFF];
}

export function and32(a: Bytes, b: Bytes) {
	return [a[0] & b[0], a[1] & b[1]];
}

export function shl32(a: Bytes, b: number) {
	// assume b is 16 or less
	var w1 = a[1] << b,
		w2 = (a[0] << b) | ((w1 & 0xFFFF0000) >> 16);
	return [w2 & 0xFFFF, w1 & 0xFFFF];
}

export function int32Read(buffer: Bytes, offset: number) {
	return (buffer[offset] << 24)
		+ (buffer[offset + 1] << 16)
		+ (buffer[offset + 2] << 8)
		+ (buffer[offset + 3]);
}