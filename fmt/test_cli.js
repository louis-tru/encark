
var utils = require('../util');
var cli = require('./cli');

async function test() {
	var a = new cli.FMTClient('a', 'fmt://127.0.0.1:8091/');
	var b = new cli.FMTClient('b', 'fmt://127.0.0.1:8092/');
	var c = new cli.FMTClient('c', 'fmt://127.0.0.1:8093/');
	var d = new cli.FMTClient('d', 'fmt://127.0.0.1:8094/');
	var e = new cli.FMTClient('e', 'fmt://127.0.0.1:8094/');

	var st = Date.now();

	a.addEventListener('A', function(e) {
		var now = Date.now();
		console.log(e.data, now - st);
		st = now;
	});

	b.addEventListener('A', function(e) {
		var now = Date.now();
		console.log(e.data, now - st);
		st = now;
	});

	c.addEventListener('A', function(e) {
		var now = Date.now();
		console.log(e.data, now - st);
		st = now;
	});

	d.addEventListener('A', function(e) {
		var now = Date.now();
		console.log(e.data, now - st);
		st = now;
	});

	e.addEventListener('A', function(e) {
		var now = Date.now();
		console.log(e.data, now - st);
		st = now;
	});

	for (var i = 0; i < 1e6; i++) {
		try {
			await b.that('a').trigger('A', 'A-' + i);
			await a.that('b').trigger('A', 'B-' + i);
			await a.that('c').trigger('A', 'C-' + i);
			await c.that('d').trigger('A', 'D-' + i);
			await b.that('e').trigger('A', 'E-' + i);
		} catch(err) {
			console.error(err);
		}
	}

	console.log('ok');
}

test();