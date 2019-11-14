
var utils = require('../util');
var cli = require('./cli');

async function test() {
	var a = new cli.FMTClient('a', 'fmt://127.0.0.1:8091/');
	var b = new cli.FMTClient('b', 'fmt://127.0.0.1:8092/');
	var c = new cli.FMTClient('c', 'fmt://127.0.0.1:8093/');

	a.addEventListener('A', function(e) {
		console.log('A', e.data);
	});

	b.addEventListener('A', function(e) {
		console.log('B', e.data);
	});

	c.addEventListener('A', function(e) {
		console.log('C', e.data);
	});

	await utils.sleep(100);

	for (var i = 0; i < 1e6; i++) {
		a.that('b').trigger('A', 'B-' + i);
		a.that('c').trigger('A', 'C-' + i);
		b.that('a').trigger('A', 'A-' + i);
		await utils.sleep(100);
	}

	console.log('ok');
}

test();