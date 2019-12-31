
var jsonb = require('./jsonb').default;

var bin2 = jsonb.binaryify({
  "from": "0x09cA99fDB2D767803d8bA566054dC822c771daB4",
  "gas": 100000000,
  "gasLimit": 100000000,
  "gasPrice": 100660,
  "value": "0x00",
  "nonce": 10433,
  "to": "0xe024af92e51067b1f678752f55a4c2b0b1f6a759",
  "data": "0xa69beaba93f88f35dc3f85970d16871bce9b8a05f15c63fac5d04cd1ed136a00437e4e43"
});

var obj2 = jsonb.parse(bin2);

console.log(obj2);

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

var binerr = jsonb.binaryify(Error.new('ABCDEFG'));

console.log(binerr);

var objerr = jsonb.parse(binerr);

console.log(objerr);

// 

debugger
var big = jsonb.binaryify(new ArrayBuffer(65536));
console.log(big);
console.log('jsonb.parse(big)');
var bigraw = jsonb.parse(big);
console.log(bigraw);

console.log('OK');