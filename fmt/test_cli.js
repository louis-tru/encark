
var utils = require('../util');
var cli = require('./cli');

async function test() {
	var a = new cli.FMTClient('a', 'fmt://127.0.0.1:8091/');
	var b = new cli.FMTClient('b', 'fmt://127.0.0.1:8092/');
	var c = new cli.FMTClient('c', 'fmt://127.0.0.1:8093/');
	var d = new cli.FMTClient('d', 'fmt://127.0.0.1:8094/');

	a.addEventListener('A', function(e) {
		console.log('A', e.data);
	});

	b.addEventListener('A', function(e) {
		console.log('B', e.data);
	});

	c.addEventListener('A', function(e) {
		console.log('C', e.data);
	});

	d.addEventListener('A', function(e) {
		console.log('D', e.data);
	});

	var st = Date.now();

	for (var i = 0; i < 1e6; i++) {
		try {
			await a.that('b').trigger('A', 'B-' + i);
			await b.that('a').trigger('A', 'A-' + i);
			await a.that('c').trigger('A', 'C-' + i);
			await c.that('d').trigger('A', 'D-' + i);
		} catch(err) {
			console.error(err);
		}
		var now = Date.now();
		console.log(now - st);
		st = now;
	}

	console.log('ok');
}

test();