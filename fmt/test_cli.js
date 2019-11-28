
var utils = require('../util');
var cli = require('./cli');
var log = require('../log');

// log.defaultConsole.makeDefault();

var host = utils.options.host;

if (host) {
	host = `192.168.${host}`;
} else {
	host = `127.0.0.1`;
}

async function test() {
	var a = new cli.FMTClient('a', `fmt://${host}:8091/`);
	var b = new cli.FMTClient('b', `fmt://${host}:8092/`);
	var c = new cli.FMTClient('c', `fmt://${host}:8093/`);
	var d = new cli.FMTClient('d', `fmt://${host}:8094/`);
	var e = new cli.FMTClient('e', `fmt://${host}:8094/`);

	var st = Date.now();

	function log(e) {
		var now = Date.now();
		console.log(e.data, now - st);
		st = now;
	}

	a.addEventListener('A', log);
	b.addEventListener('A', log);
	c.addEventListener('A', log);
	d.addEventListener('A', log);
	e.addEventListener('A', log);

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