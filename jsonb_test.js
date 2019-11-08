
var jsonb = require('./jsonb');

var bin = jsonb.binaryify({
	a: [0,1,2,3,4, 'ABCDEFG', {AA:0xf, B: 1000000000000000n, C: 0.00000005000001, D: 15423154.23131312}],
	b: 100,
	c: new Uint8Array(100),
	d: Float64Array.from([0.1,100,12121.900001,100.2]),
	e: new Date(),
	f: -10000000000000000000000000000000000000000000000000000000000000000000000001n,
	g: -10000000001,
	h: 100000000000000000000000000000000000000000000000000000000000000000000000045874n,
	i: Infinity,
	j: -Infinity,
	k: [
		NaN,
		'ASASASASASASSASAS---你好吗工模s---',
		null,
		undefined,
		0,
		true,
		'AA',
		false,

	],
});

console.log(bin);

var obj = jsonb.parse(bin);

console.log(obj);

console.log('OK');