/*
 * A JavaScript implementation of the Secure Hash Algorithm, SHA-1, as defined
 * in FIPS PUB 180-1
 * Version 2.1a Copyright Paul Johnston 2000 - 2002.
 * Other contributors: Greg Holt, Andrew Kepert, Ydnar, Lostinet
 * Distributed under the BSD License
 * See http://pajhome.org.uk/crypt/md5 for details.
 */

var {chrsz,str2bin,bin2binl,binl2bin,bin2str,bin2hex,bin2b64} = require('./util');

/*
 * These are the functions you'll usually want to call
 * They take string arguments and return either hex or base-64 encoded strings
 */
function sha1_hex(s){ return bin2hex(sha1(s));}
function sha1_b64(s){ return bin2b64(sha1(s));}
function sha1_str(s){ return bin2str(sha1(s));}

/*
 * Perform a simple self-test to see if the VM is working
 */
function sha1_vm_test()
{
	var crypto = require('crypto');
	var sha1_ = crypto.createHash('sha1');
	sha1_.update('abc');
	console.log(sha1_.digest());
	console.log(Buffer.from(sha1('abc')));

	var hash = sha1_hex("abc");
	console.log(hash, '\na9993e364706816aba3e25717850c26c9cd0d89d');
	return hash == "a9993e364706816aba3e25717850c26c9cd0d89d";
}

// sha1_vm_test();

/*
 * Calculate the SHA-1 of an array of big-endian words, and a bit length
 */
function core_sha1(x, len)
{
	x = x.map(e=>transpose(e));

	// console.log(x, len);

	/* append padding */
	x[len >> 5] |= 0x80 << (24 - len % 32);
	x[((len + 64 >> 9) << 4) + 15] = len;

	var w = Array(80);
	var a =  1732584193;
	var b = -271733879;
	var c = -1732584194;
	var d =  271733878;
	var e = -1009589776;

	for(var i = 0; i < x.length; i += 16)
	{
		var olda = a;
		var oldb = b;
		var oldc = c;
		var oldd = d;
		var olde = e;

		for(var j = 0; j < 80; j++)
		{
			if(j < 16) w[j] = x[i + j];
			else w[j] = rol(w[j-3] ^ w[j-8] ^ w[j-14] ^ w[j-16], 1);
			var t = safe_add(safe_add(rol(a, 5), sha1_ft(j, b, c, d)),
											 safe_add(safe_add(e, w[j]), sha1_kt(j)));
			e = d;
			d = c;
			c = rol(b, 30);
			b = a;
			a = t;
		}

		a = safe_add(a, olda);
		b = safe_add(b, oldb);
		c = safe_add(c, oldc);
		d = safe_add(d, oldd);
		e = safe_add(e, olde);
	}
	// console.log([a, b, c, d, e]);

	return [a, b, c, d, e].map(e=>transpose(e));

}

function transpose(int32) {
	return (
		((int32 >> 24) & 0xff)   |
		((int32 >> 8)  & 0xff00) |
		((int32 << 8)  & 0xff0000) |
		((int32 << 24) & 0xff000000)
	);
}

/*
 * Perform the appropriate triplet combination function for the current
 * iteration
 */
function sha1_ft(t, b, c, d)
{
	if(t < 20) return (b & c) | ((~b) & d);
	if(t < 40) return b ^ c ^ d;
	if(t < 60) return (b & c) | (b & d) | (c & d);
	return b ^ c ^ d;
}

/*
 * Determine the appropriate additive constant for the current iteration
 */
function sha1_kt(t)
{
	return (t < 20) ?  1518500249 : (t < 40) ?  1859775393 :
				 (t < 60) ? -1894007588 : -899497514;
}

/*
 * Add integers, wrapping at 2^32. This uses 16-bit operations internally
 * to work around bugs in some JS interpreters.
 */
function safe_add(x, y)
{
	var lsw = (x & 0xFFFF) + (y & 0xFFFF);
	var msw = (x >> 16) + (y >> 16) + (lsw >> 16);
	return (msw << 16) | (lsw & 0xFFFF);
}

/*
 * Bitwise rotate a 32-bit number to the left.
 */
function rol(num, cnt)
{
	return (num << cnt) | (num >>> (32 - cnt));
}

function sha1(s) {
	if (typeof s == 'string') {
		s = str2bin(s);
	}	else if (s instanceof ArrayBuffer) {
		s = new Uint8Array(s);
	} else if (s && s.buffer instanceof ArrayBuffer) {
		s = new Uint8Array(s.buffer);
	}
	return binl2bin(core_sha1(bin2binl(s), s.length * chrsz));
}

sha1.sha1_hex = sha1_hex;
sha1.sha1_b64 = sha1_b64;
sha1.sha1_str = sha1_str;

module.exports = sha1;