#!/usr/bin/env node

import * as fs from './fs';
import * as path from 'path';
import { options, helpInfo, defOpts } from './arguments';
import { execSync } from './syscall';

defOpts('help', 0,									'--help, --help print help info');
defOpts('u', 'louis',								'-u username [{0}]');
defOpts('h', '192.168.0.115',				'-h host [{0}]');
defOpts('t', '~/ngui',							'-t target directory [{0}]');
defOpts('i', '',										'-i ignore directory or file');
defOpts('d',  0,										'-d delay time [{0}] watch');

if (options.help) {
	console.log(' ', helpInfo.join('\n  '));
	process.exit(0);
}

// console.log('-----------------------------', options.i)

var root = process.cwd();
var target = `${options.u}@${options.h}:${options.t}`;

console.log(`watch ${root} ${target}`);

var ignore = ['.git', '.svn', 'out', 'node/deps', 'tools/android-toolchain', 'node_modules', '.o', '.a', '.d'];
var count = 1;

if (options.i) {
	if (Array.isArray(options.i)) {
		ignore = ignore.concat(options.i);
	} else {
		ignore.push(options.i);
	}
}

// console.log('ignore-------------', ignore)

interface Callback {
	(pathname: string, name: string, extname: string, is_dir: boolean): boolean;
}

function each_directory(root: string, dir: string, cb: Callback) {
	fs.readdirSync(root + '/' + dir).forEach(name=>{
		var pathname = dir + (dir ? '/': '') + name;
		var stat;
		try {
			stat = fs.lstatSync(root + '/' + pathname);
		} catch(e) {
			console.error(e.message);
			return;
		}
		if (!stat.isSymbolicLink()) {
			var ext = path.extname(pathname);
			if (stat.isDirectory()) {
				if (cb(pathname, name, ext, true)) {
					each_directory(root, pathname, cb);
				}
			} else {
				var name = pathname.substring(0, pathname.length - ext.length);
				cb(pathname, name, ext, false);
			}
		}
	});
}

function sync(type: string, dir: string, filename: string) {
	if (ignore.indexOf(filename) != -1) return;
	console.log('sync', type, dir, filename, '...');
	var cmd = `scp ${root}/${dir}/${filename} ${target}/${dir}`;
	// console.log(cmd);
	var r = execSync(cmd);
	console.log('sync', type, dir, filename, r.code == 0 ? 'ok': 'fail');
}

function start() {

	fs.watch(root, (type, filename)=>sync(type, '.', filename));

	each_directory(root, '', function(pathname: string, name: string, ext: string, is_dir: boolean) {
		if (is_dir) {
			if (ignore.indexOf(name) >= 0 || 
					ignore.indexOf(pathname) >= 0 ||
					ignore.indexOf(ext) >= 0
			) {
				// console.log(pathname);
				return false;
			}
			// console.log('-------------', root + '/' + pathname)
			fs.watch(root + '/' + pathname, (type, filename)=>sync(type, pathname, filename));
			count++;
			return true;
		}
		return false;
	});

	// sudo ulimit -HSn 12000

	execSync(`cd ${root}; git status -s | awk '{print $2}'`).stdout.forEach(e=>{
		if (e) {
			sync('init', path.dirname(e), path.basename(e));
		}
	});

	console.log(`---------------- Start watch dir count ${count} ... ---------------- `);

}

setTimeout(start, Number(options.d) || 0);