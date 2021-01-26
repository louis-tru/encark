
import utils from '../util';
import * as cli from './cli';
import '../log';

// require('../ws/cli/conv').USE_GZIP_DATA = false;
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
	var _resolve: (()=>void) | null = null;

	function log(e: any) {
		var now = Date.now();
		console.log(e.data, now - st);
		st = now;
		if (_resolve) {
			_resolve();
			_resolve = null;
		}
	}

	// chech death
	setInterval(()=>{
		if (_resolve) {
			_resolve();
			_resolve = null;
		}
	}, 1e4);

	var limit = true;

	function trigger(that: cli.ThatClient, event: string, data: any) {
		return new Promise(async(resolve,reject)=>{
			if (limit) {
				if (_resolve)
					return reject('err');
				_resolve = resolve as any;
			} else {
				await utils.sleep(10);
			}
			that.trigger(event, data).then(()=>limit||resolve(0)).catch(reject);
		});
	}

	a.addEventListener('A', log);
	b.addEventListener('A', log);
	c.addEventListener('A', log);
	d.addEventListener('A', log);
	e.addEventListener('A', log);

	await utils.sleep(1000);

	for (var i = 0; i < 1e6; i++) {
		try {
			await trigger(b.that('a'), 'A', 'A-' + i);
			await trigger(a.that('b'), 'A', 'B-' + i);
			await trigger(a.that('c'), 'A', 'C-' + i);
			await trigger(c.that('d'), 'A', 'D-' + i);
			await trigger(b.that('e'), 'A', 'E-' + i);
		} catch(err) {
			console.error('--------------------------', err);
		}
	}

	console.log('ok');
}

test();