/* ***** BEGIN LICENSE BLOCK *****
 * Distributed under the BSD license:
 *
 * Copyright (c) 2015, xuewen.chu
 * All rights reserved.
 * 
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *     * Redistributions of source code must retain the above copyright
 *       notice, this list of conditions and the following disclaimer.
 *     * Redistributions in binary form must reproduce the above copyright
 *       notice, this list of conditions and the following disclaimer in the
 *       documentation and/or other materials provided with the distribution.
 *     * Neither the name of xuewen.chu nor the
 *       names of its contributors may be used to endorse or promote products
 *       derived from this software without specific prior written permission.
 * 
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
 * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL xuewen.chu BE LIABLE FOR ANY
 * DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
 * LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
 * ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
 * SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 * 
 * ***** END LICENSE BLOCK ***** */

import {Buffer} from 'buffer';
import * as Path from 'path';
import * as fs from 'fs';
export * from 'fs';

type NoParamCallback = fs.NoParamCallback;

type CancelParamCallback = (err: NodeJS.ErrnoException | null, r?: boolean) => void;

function inl_copy_symlink(path: string, target: string, options: any, cb: any) {
	if (options.is_cancel) return;

	fs.lstat(target, function(err, stat) {
		if (err) return cp();
		if (stat.isSymbolicLink() || !stat.isDirectory()) {
			fs.unlink(target, e=>e?cb(e):cp()); // rm
		} else {
			inl_rm(options, target, (e:any)=>e?cb(e):cp()); // rm
		}
	});

	function cp() {
		fs.readlink(path, function(err, path) {
			if (err) {
				cb(err);
			} else {
				fs.symlink(path, target, cb);
			}
		})
	}
}

function inl_copy_file(path: string, target: string, options: any, cb: any) {
	if (options.is_cancel) return;

	fs.lstat(target, function(err, stat) {
		if (err) return cp();
		if (stat.isSymbolicLink()) {
			fs.unlink(target, e=>e?cb(e):cp()); // rm
		} else if (!stat.isFile()) {
			inl_rm(options, target, (e:any)=>e?cb(e):cp()); // rm
		} else {
			if ( !options.replace ) { // 不替换
				return cb(); // 结束
			} else {
				cp();
			}
		}
	});

	function cp() {
		var read = fs.createReadStream(path);
		var write = fs.createWriteStream(target);

		function error(e:any) {
			read.destroy();
			write.destroy();
			console.error(e);
			cb(e);
		}
		
		read.on('data', function (buff:any) {
			if (options.is_cancel) {
				read.destroy();
				write.destroy();
			} else {
				write.write(buff);
			}
		});
		read.on('end', function () {
			if (!options.is_cancel) {
				write.end();
				cb();
			}
		});
		read.on('error', error);
		write.on('error', error);
	}
}

function inl_copy_dir(path: string, target: string, options: any, cb: any) {
	if (options.is_cancel) return;

	fs.lstat(target, function(err, stat) {
		if (err) return cp();
		if (stat) {
			if (stat.isSymbolicLink() || !stat.isDirectory()) {
				fs.unlink(target, e=>e?cb(e):fs.mkdir(target, cp)); // rm
			}
		} else {
			fs.mkdir(target, cp);
		}
	});

	var list: any = null;
	
	function cp(err?: any) {
		if (err) 
			return cb (err);
		fs.readdir(path, function(err, ls) {
			if (err) 
				return cb (err);
			list = ls;
			shift();
		});
	}

	function shift(err?: any): any {
		if (err) return cb(err);
		if (!list.length) return cb(); // 完成

		var name = list.shift();
		if (options.ignore_hide && name[0] == '.')
			return shift(); // 忽略隐藏

		var path1 = path + '/' + name;
		var target1 = target + '/' + name;
		
		fs.lstat(path1, function(err, stat) {
			if (err) return cb(err);

			if (stat.isSymbolicLink() && options.symlink) { // copy symlink
				inl_copy_symlink(path1, target1, options, shift);
			} else if (stat.isFile()) {
				inl_copy_file(path1, target1, options, shift);
			} else if (stat.isDirectory()) {
				inl_copy_dir(path1, target1, options, shift);
			} else {
				console.warn('ignore cp', path1, 'to', target1);
				shift();
			}
		});
	}
}

function inl_copy_symlink_sync(path: string, target: string, options: any, check: any) {
	if (!check(path, target)) return; // 取消
	var stat;
	try {
		stat = fs.lstatSync(target);
	} catch(e) {}

	if (stat) {
		if (stat.isSymbolicLink() || !stat.isDirectory()) {
			fs.unlinkSync(target); // rm
		} else {
			inl_rm_sync(target); // rm
		}
	}

	fs.symlinkSync(fs.readlinkSync(path), target);
}

function inl_copy_file_sync(path: string, target: string, options: any, check: any) {
	if (!check(path, target)) return; // 取消
	var stat;
	try {
		stat = fs.lstatSync(target);
	} catch(e) {}

	if (stat) {
		if (stat.isSymbolicLink()) {
			fs.unlinkSync(target); // rm
		} else if (!stat.isFile()) {
			inl_rm_sync(target); // rm
		} else {
			if ( !options.replace ) { // 不替换
				return; // 结束
			}
		}
	}

	var rfd = fs.openSync(path, 'r');
	var wfd = fs.openSync(target, 'w');
	
	var size = 1024 * 100;
	var buff = Buffer.alloc(size); // 100kb
	var len = 0;
	
	do {
		if (!check(path, target)) break; // 取消
		len = fs.readSync(rfd, buff, 0, size, null);
		fs.writeSync(wfd, buff, 0, len, null);
	} while (len == size);
	
	fs.closeSync(rfd);
	fs.closeSync(wfd);
}

function inl_copy_dir_sync(path: string, target: string, options: any, check: any) {
	if (!check(path, target)) return; // 取消

	var stat
	try {
		stat = fs.lstatSync(target);
	} catch(e) {}

	if (stat) {
		if (stat.isSymbolicLink() || !stat.isDirectory()) {
			fs.unlinkSync(target); // rm
			fs.mkdirSync(target);
		}
	} else {
		fs.mkdirSync(target);
	}
	
	var ls = fs.readdirSync(path);
	
	for (var i = 0; i < ls.length; i++) {
		var name = ls[i];
		if (options.ignore_hide && name[0] == '.')
			continue; // 忽略隐藏
			
		var path1 = path + '/' + name;
		var target1 = target + '/' + name;
		let stat = fs.lstatSync(path1);

		if (stat.isSymbolicLink() && options.symlink) { // copy symlink
			inl_copy_symlink_sync(path1, target1, options, check);
		} else if (stat.isFile()) {
			inl_copy_file_sync(path1, target1, options, check);
		} else if (stat.isDirectory()) {
			inl_copy_dir_sync(path1, target1, options, check);
		} else {
			console.warn('ignore cp', path1, 'to', target1);
		}
	}
}

function inl_rm_sync(path: string) {
	
	var stat = fs.lstatSync(path);
	if (stat.isFile() || stat.isSymbolicLink()) {
		return fs.unlinkSync(path);
	}
	else if (!stat.isDirectory()) {
		return;
	}
	
	var ls = fs.readdirSync(path);
	
	for(var i = 0; i < ls.length; i++){
		inl_rm_sync(path + '/' + ls[i]);
	}
	fs.rmdirSync(path);
}

function inl_rm(handle: any, path: string, cb: any) {

	fs.lstat(path, function (err, stat) {
		if (err) {
			return cb(err);
		}
		
		if (stat.isFile() || stat.isSymbolicLink()) {
			if (!handle.is_cancel) { // 没有取消
				fs.unlink(path, cb);
			}
			return;
		}
		else if (!stat.isDirectory()){
			return cb();
		}
		
		var ls: any = null;
		
		function shift(err: any) {
			if (err) {
				return cb(err);
			}
			if (!ls.length) {
				return fs.rmdir(path, cb);
			}
			inl_rm(handle, path + '/' + ls.shift(), shift);
		}

		//dir
		fs.readdir(path, function (err, data) {
			ls = data;
			shift(err);
		});
	});
}

function async_call(func: any, ...args: any[]) {
	return new Promise(function(resolve, reject) {
		func(...args, (e:any,args:any)=>e?reject(e):resolve(args));
	});
}

/**
 * set dir and file
 */
export function chownr(path: string, uid: number, gid: number, cb: NoParamCallback) {
	path = Path.resolve(path);
	
	cb = cb || function (err:any) {
		if (err)
			throw Error.new(err);
	};

	function shift(path: string, _cb: any) {
		fs.stat(path, function (err: any, stat: any) {
			if (err) { return cb(err) }
			if (!stat.isDirectory()) { return _cb() }
			
			var dir = path + '/';
			
			function shift2(ls: any) {
				if (!ls.length) { return _cb() }
				path = dir + ls.shift();
				fs.chown(path, uid, gid, function (err) {
					if (err) { return cb(err) }
					shift(path, function () { shift2(ls) });
				});
			}
			fs.readdir(dir, function (err: any, ls: any) {
				if (err) { return cb(err) }
				shift2(ls);
			});
		});
	}
	
	fs.chown(path, uid, gid, function (err) {
		if (err) { return cb }
		shift(path, cb);
	});
}

/**
 * set user file weight
 * @param {String}   path
 * @param {String}   mode
 * @param {Function} cb    (Optional)
 */
export function chmodr(path: string, mode: number, cb: NoParamCallback) {
	path = Path.resolve(path);
	
	cb = cb || function (err: any) { 
		if (err) throw Error.new(err);
	}

	function shift (path: string, _cb: any) {
		fs.stat(path, function(err: any, stat: any) {
			if (err) { return cb(err) }
			if (!stat.isDirectory()) { return _cb() }
			
			var dir = path + '/';
			
			function shift2(ls: any) {
				if (!ls.length) { return _cb() }
				path = dir + ls.shift();
				fs.chmod(path, mode, function (err) {
					if (err) { return cb(err) }
					shift(path, function () { shift2(ls) })
				});
			}
			
			fs.readdir(dir, function(err, ls) {
				if (err) { return cb(err) }
				shift2(ls);
			});
		});
	}

	fs.chmod(path, mode, function(err) {
		if (err) { return cb(err) }
		shift(path, cb);
	});
}

export var remove = fs.unlink;
export var removeSync = fs.unlinkSync;

/**
 * remove all file async
 * @param {String}   path
 * @param {Function} cb   (Optional)
 */
export function remover(path: string, cb: CancelParamCallback) {
	var handle = { is_cancel: false };
	cb = cb || function (err: any) { 
		if (err) throw Error.new(err);
	};
	fs.lstat(path, function(err, stat) {
		if (err) {
			return cb(null);
		}
		if (stat.isFile() || stat.isSymbolicLink()) {
			if (!handle.is_cancel) { // 没有取消
				fs.unlink(path, cb);
			}
		} else {
			inl_rm(handle, path, cb);
		}
	});

	return {
		cancel: function () {// 取消delete
			handle.is_cancel = true; 
			cb(null, true);
		}
	};
}

/**
 * 删除文件与文件夹
 */
export function removerSync(path: string) {
	try {
		var stat = fs.lstatSync(path);
	} catch(err) {
		return;
	}
	if (stat.isFile() || stat.isSymbolicLink()) {
		fs.unlinkSync(path);
	} else {
		inl_rm_sync(path);
	}
}

export interface CopyOptions {
	ignore_hide?: boolean, // 忽略隐藏
	replace?: boolean, // 如果存在替换目标
	symlink?: boolean, // copy symlink
	isCancel?: (source: string, target: string)=>boolean,
}

/**
 * copy all file 
 * @param {String}   path
 * @param {String}   target
 * @param {Object}   options  (Optional)
 * @param {Function} cb   (Optional)
 */
export function copy(path: string, target: string, options?: CopyOptions | CancelParamCallback, cb?: CancelParamCallback) {
	path = Path.resolve(path);
	target = Path.resolve(target);
	
	if (typeof options == 'function') {
		cb = options;
		options = {};
	}
	var options2 = Object.assign({ 
		ignore_hide: false, // 忽略隐藏
		replace: true, // 如果存在替换目标
		symlink: true, // copy symlink
		is_cancel: false,
	}, options);

	var cb2 = cb || function (err: any) { 
		if (err) throw Error.new(err);
	};
	
	if (options2.ignore_hide && Path.basename(path)[0] == '.')
		return cb2(null); // 忽略隐藏
	
	fs.lstat(path, function (err: any, stat) {
		if (err) {
			return cb2(err);
		}
		mkdirp(Path.dirname(target), function() {
			if (stat.isSymbolicLink() && options2.symlink) { // copy symlink
				inl_copy_symlink(path, target, options, cb2);
			} else if (stat.isFile()) {
				inl_copy_file(path, target, options2, cb2);
			} else if (stat.isDirectory()) {
				inl_copy_dir(path, target, options2, cb2);
			} else {
				console.warn('ignore cp', path, 'to', target);
				cb2(null);
			}
		});
	});
	
	return {
		cancel: function () {  // 取消cp
			options2.is_cancel = true;
			cb2(null, true);
		}
	};
}

/**
	* copy all file sync
	* @param {String}   path
	* @param {String}   target
	* @param {Object}   options  (Optional)
	*/
export function copySync(path: string, target: string, options?: CopyOptions) {
	path = Path.resolve(path);
	target = Path.resolve(target);

	var options2 = Object.assign({ 
		ignore_hide: false, // 忽略隐藏
		replace: true, // 如果存在替换目标
		symlink: true, // copy symlink
		isCancel: function() { return false; },
	}, options);

	var check = (source: string, target: string)=>!options2.isCancel(source, target);

	if (options2.ignore_hide && Path.basename(path)[0] == '.')
		return; // 忽略隐藏
		
	var stat = fs.lstatSync(path);
	
	mkdirpSync(Path.dirname(target));

	if (stat.isSymbolicLink() && options2.symlink) { // copy symlink
		inl_copy_symlink_sync(path, target, options2, check);
	} else if (stat.isFile()) {
		inl_copy_file_sync(path, target, options2, check);
	} else if (stat.isDirectory()) {
		inl_copy_dir_sync(path, target, options2, check);
	} else {
		console.warn('ignore cp', path, 'to', target);
	}
}

export type MkdirOptopns = string | number | fs.MakeDirectoryOptions | null | undefined;

/**
	* create all file dir
	* @param {String}   path
	* @param {String}   mode  (Optional)
	* @param {Function} cb    (Optional)
	*/
export function mkdirp(path: string, mode?: MkdirOptopns | NoParamCallback, cb?: NoParamCallback) {
	var mode2: any = mode;
	if (typeof mode == 'function') {
		cb = mode;
		mode2 = null;
	}
	var cb2 = cb || function (err: any) {
		if (err) throw Error.new(err);
	}
	path = Path.resolve(path);

	fs.exists(path, function (exists) {
		if (exists) return cb2(null);

		var mat = <RegExpMatchArray>path.match(/^(\w+:)?\//);
		var prefix = mat[0];
		var ls = path.substr(prefix.length).split('/');

		function shift(err?:any) {
			if (err) return cb2(err);
			if (!ls.length) return cb2(null);

			prefix += ls.shift() + '/';
			fs.exists(prefix, function(exists) {
				if (exists) { return shift() }
				fs.mkdir(prefix, mode2, shift);
			});
		}
		shift();
	});
}

/**
	* create all file dir sync
	* @param {String}   path
	* @param {String}   mode  (Optional)
	*/
export function mkdirpSync(path: string, mode?: MkdirOptopns) {
	path = Path.resolve(path);

	if (fs.existsSync(path)) {
		return;
	}

	var mat = <RegExpMatchArray>path.match(/^(\w+:)?\//);
	var prefix = mat[0];
	var ls = path.substr(prefix.length).split('/');

	for (var i = 0; i < ls.length; i++) {
		prefix += ls[i] + '/';
		if (!fs.existsSync(prefix)) {
			fs.mkdirSync(prefix, mode);
		}
	}
}

export interface StatsDescribe extends fs.Stats {
	name: string;
	children: StatsDescribe[];
}

export type EachDirectoryCallback = (stats: StatsDescribe, pathname: string)=>(boolean|void);

/**
 * @func inl_ls_sync
 */
function inl_ls_sync(origin: string, path: string, depth: boolean, each_cb: EachDirectoryCallback) {
	var ls = fs.readdirSync(`${origin}/${path}`);
	var rev = [];
	
	for (var i = 0; i < ls.length; i++) {
		var name = ls[i];
		var pathname = path ? `${path}/${name}` : name;
		var stat = <StatsDescribe>fs.statSync(`${origin}/${pathname}`);
		stat.name = name;
		stat.children = [];

		if (!each_cb(stat, pathname)) {
			if (depth && stat.isDirectory()) {
				stat.children = inl_ls_sync(origin, pathname, depth, each_cb);
			}
		}
		rev.push(stat);
	}

	return rev;
}

async function inl_ls(origin: string, path: string, depth: boolean, each_cb: EachDirectoryCallback) {
	var ls = <string[]>await async_call(fs.readdir, `${origin}/${path}`);
	var rev = [];

	for (var i = 0; i < ls.length; i++) {
		var name = ls[i];
		var pathname = path ? `${path}/${name}` : name;
		var stat = <StatsDescribe>await async_call(fs.stat, `${origin}/${pathname}`);
		stat.name = name;
		stat.children = [];

		if (!each_cb(stat, pathname)) {
			if (depth && stat.isDirectory()) {
				stat.children = await inl_ls(origin, pathname, depth, each_cb);
			}
		}
		rev.push(stat);
	}

	return rev;
}

/**
	* get all info
	* @param {String}   path
	* @param {Boolean}  depth
	* @param {Function} cb
	*/
export function list(
	path: string,
	depth?: boolean | EachDirectoryCallback,
	each_cb?: EachDirectoryCallback): Promise<StatsDescribe[]>
{
	path = Path.resolve(path);

	if (typeof depth == 'function') {
		each_cb = depth;
		depth = false;
	}

	var depth2 = !!depth;
	var each_cb2 = each_cb || function () {} as EachDirectoryCallback;

	return new Promise(function(reserve, reject) {

		fs.stat(path, function (err, stat) {
			if (err)
				return reject(err);

			var stat2 = stat as StatsDescribe;
			stat2.name = Path.basename(path);
			stat2.children = [];

			if (each_cb2(stat2, '')) {
				return reserve([]);
			}

			if (stat.isDirectory()) {
				inl_ls(path, '', depth2, each_cb2).then(e=>reserve(e)).catch(reject);
			} else {
				reserve([]);
			}
		});
	});
}

/**
	* get dir info
	*/
export function listSync(path: string, depth?: boolean | EachDirectoryCallback, each_cb?: EachDirectoryCallback) {
	path = Path.resolve(path);

	if (typeof depth == 'function') {
		each_cb = depth;
		depth = false;
	}

	var depth2 = !!depth;
	var each_cb2 = each_cb || function () {} as EachDirectoryCallback;

	var stat = fs.statSync(path) as StatsDescribe;
	stat.name = Path.basename(path);
	stat.children = [];

	if (each_cb2(stat, '')) {
		return [];
	}

	return stat.isDirectory() ? inl_ls_sync(path, '', depth2, each_cb2): [];
}

export var ls = list;
export var ls_sync = listSync;
export var mkdir_p_sync = mkdirpSync;
export var mkdir_p = mkdirp;
export var cp_sync = copySync;
export var cp = copy;
export var rm_r_sync = removerSync;
export var rm_r = remover;
export var chmod_r = chmodr;
export var chown_r = chownr;