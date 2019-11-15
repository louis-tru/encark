
var utils = require('../util');
var cli = require('./cli');

async function test() {
	var a = new cli.FMTClient('a', 'fmt://127.0.0.1:8091/');
	var b = new cli.FMTClient('b', 'fmt://127.0.0.1:8092/');
	// var c = new cli.FMTClient('c', 'fmt://127.0.0.1:8093/');

	a.addEventListener('A', function(e) {
		console.log('A', e.data);
	});

	b.addEventListener('A', function(e) {
		console.log('B', e.data);
	});

	// c.addEventListener('A', function(e) {
	// 	console.log('C', e.data);
	// });

	for (var i = 0; i < 1e6; i++) {
		if (a.loaded) {
			try {
				await a.that('b').trigger('A', 'B-' + i);
			} catch(err) {
				console.error(err);
			}
		}
		if (b.loaded) {
			try {
				await b.that('a').trigger('A', 'A-' + i);
			} catch(err) {
				console.error(err);
			}
		}
		// a.that('c').trigger('A', 'C-' + i);
		await utils.sleep(10);
	}

	console.log('ok');
}

test();