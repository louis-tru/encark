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

var util = require('./util');
var Buffer = require('buffer').Buffer;
var Path = require('path');
var fs = require('fs');
var mkdir = fs.mkdir;
var mkdirSync = fs.mkdirSync;
var chmod = fs.chmod;
var chown = fs.chown;

Object.assign(exports, fs);

function inl_copy_symlink(path, target, options, cb) {
	if (options.is_cancel) return;

	fs.lstat(target, function(err, stat) {
		if (err) return cp();
		if (stat.isSymbolicLink() || !stat.isDirectory()) {
			fs.unlink(target, e=>e?cb(e):cp()); // rm
		} else {
			inl_rm(options, target, e=>e?cb(e):cp()); // rm
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

function inl_copy_file(path, target, options, cb) {
	if (options.is_cancel) return;

	fs.lstat(target, function(err, stat) {
		if (err) return cp();
		if (stat.isSymbolicLink()) {
			fs.unlink(target, e=>e?cb(e):cp()); // rm
		} else if (!stat.isFile()) {
			inl_rm(options, target, e=>e?cb(e):cp()); // rm
		} else {
			if ( !options.replace ) { // 不替换
				return cb(); // 结束
			} else {
				cp();
			}
		}
	});

	function cp() {
		var read = exports.createReadStream(path);
		var write = exports.createWriteStream(target);

		function error(e) {
			read.destroy();
			write.destroy();
			console.error(e);
			cb(e);
		}
		
		read.on('data', function (buff) {
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

function inl_copy_dir(path, target, options, cb) {
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

	var list = null;
	
	function cp(err) {
		if (err) 
			return cb (err);
		fs.readdir(path, function(err, ls) {
			if (err) 
				return cb (err);
			list = ls;
			shift();
		});
	}

	function shift(err) {
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

function inl_copy_symlink_sync(path, target, options, check) {
	if (!check(path, target)) return; // 取消

	try {
		var stat = fs.lstatSync(target);
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

function inl_copy_file_sync(path, target, options, check) {
	if (!check(path, target)) return; // 取消

	try {
		var stat = fs.lstatSync(target);
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

function inl_copy_dir_sync(path, target, options, check) {
	if (!check(path, target)) return; // 取消

	try {
		var stat = fs.lstatSync(target);
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
		var stat = fs.lstatSync(path1);

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

function inl_rm_sync(path) {
	
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

function inl_rm(handle, path, cb) {

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
		
		var ls = null;
		
		function shift(err) {
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

function async_call(func, ...args) {
	return new Promise(function(resolve, reject) {
		func(...args, (e,args)=>e?reject(e):resolve(args));
	});
}

/**
 * set dir and file
 */
exports.chown_r = function (path, uid, gid, cb) {
	path = Path.resolve(path);
	
	cb = err || function (err) {
		if (err) throw util.err(err);
	};
	
	function shift(path, _cb) {
		exports.stat(path, function (err, stat) {
			if (err) { return cb(err) }
			if (!stat.isDirectory()) { return _cb() }
			
			var dir = path + '/';
			
			function shift2(ls) {
				if (!ls.length) { return _cb() }
				path = dir + ls.shift();
				chown(path, uid, gid, function (err) {
					if (err) { return cb(err) }
					shift(path, function () { shift2(ls) });
				});
			}
			exports.readdir(dir, function (err, ls) {
				if (err) { return cb(err) }
				shift2(ls);
			});
		});
	}
	
	chown(path, uid, gid, function (err) {
		if (err) { return cb }
		shift(path, cb);
	});
};

/**
 * set user file weight
 * @param {String}   path
 * @param {String}   mode
 * @param {Function} cb    (Optional)
 */
exports.chmod_r = function (path, mode, cb) {
	path = Path.resolve(path);
	
	cb = cb || function (err) { 
		if (err) throw util.err(err);
	}
	
	function shift (path, _cb) {
		
		exports.stat(path, function (err, stat) {
			if (err) { return cb(err) }
			if (!stat.isDirectory()) { return _cb() }
			
			var dir = path + '/';
			
			function shift2 (ls) {
				if (!ls.length) { return _cb() }
				path = dir + ls.shift();
				chmod(path, mode, function (err) {
					if (err) { return cb(err) }
					shift(path, function () { shift2(ls) })
				});
			}
			
			exports.readdir(dir, function (err, ls) {
				if (err) { return cb(err) }
				shift2(ls);
			});
		});
	}
	
	chmod(path, mode, function (err) {
		if (err) { return cb(err) }
		shift(path, cb);
	});
};

/**
	* remove file
	*/
exports.rm = function (path, cb) {
	return exports.unlink(path, cb);
};

/**
 * remove all file async
 * @param {String}   path
 * @param {Function} cb   (Optional)
 */
exports.rm_r = function (path, cb) {
	var handle = { is_cancel: false };
	cb = cb || function (err) { 
		if (err) throw util.err(err);
	};
	fs.lstat(path, function(err, stat) {
		if (err) {
			return cb();	
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
			cb(null, null, true);
		}
	};
};

/**
	* 同步删除文件
	*/
exports.rm_sync = function (path) {
	return exports.unlinkSync(path);
};

/**
 * 删除文件与文件夹
 */
exports.rm_r_sync = function (path) {
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
};

/**
 * copy all file 
 * @param {String}   path
 * @param {String}   target
 * @param {Object}   options  (Optional)
 * @param {Function} cb   (Optional)
 */
exports.cp = function (path, target, options, cb) {
	path = Path.resolve(path);
	target = Path.resolve(target);
	
	if (typeof options == 'function') {
		cb = options;
		options = null;
	}
	options = util.assign({ 
		ignore_hide: false, // 忽略隐藏
		replace: true, // 如果存在替换目标
		symlink: true, // copy symlink
		is_cancel: false,
	}, options);
	
	cb = cb || function (err) { 
		if (err) throw util.err(err);
	};
	
	if (options.ignore_hide && Path.basename(path)[0] == '.')
		return cb(); // 忽略隐藏
	
	fs.lstat(path, function (err, stat) {
		if (err) {
			return cb(err);
		}
		exports.mkdir_p(Path.dirname(target), function() {
			if (stat.isSymbolicLink() && options.symlink) { // copy symlink
				inl_copy_symlink(path, target, options, cb);
			} else if (stat.isFile()) {
				inl_copy_file(path, target, options, cb);
			} else if (stat.isDirectory()) {
				inl_copy_dir(path, target, options, cb);
			} else {
				console.warn('ignore cp', path, 'to', target);
				cb();
			}
		});
	});
	
	return {
		cancel: function () {  // 取消cp
			options.is_cancel = true;
			cb(null, null, true);
		}
	};
};

/**
	* copy all file sync
	* @param {String}   path
	* @param {String}   target
	* @param {Object}   options  (Optional)
	*/
exports.cp_sync = function (path, target, options) {
	path = Path.resolve(path);
	target = Path.resolve(target);
	
	options = util.assign({ 
		ignore_hide: false, // 忽略隐藏
		replace: true, // 如果存在替换目标
		symlink: true, // copy symlink
		check: function() { return true; },
	}, options);
	
	var check = options.check;
	
	if (options.ignore_hide && Path.basename(path)[0] == '.')
		return; // 忽略隐藏
		
	var stat = fs.lstatSync(path);
	
	exports.mkdir_p_sync(Path.dirname(target));

	if (stat.isSymbolicLink() && options.symlink) { // copy symlink
		inl_copy_symlink_sync(path, target, options, check);
	} else if (stat.isFile()) {
		inl_copy_file_sync(path, target, options, check);
	} else if (stat.isDirectory()) {
		inl_copy_dir_sync(path, target, options, check);
	} else {
		console.warn('ignore cp', path, 'to', target);
	}
};

/**
	* create all file dir
	* @param {String}   path
	* @param {String}   mode  (Optional)
	* @param {Function} cb    (Optional)
	*/
exports.mkdir_p = function (path, mode, cb) {

	if(typeof mode == 'function'){
		cb = mode;
		mode = null;
	}
	
	cb = cb || function (err) { 
		if (err) throw util.err(err);
	};
	
	path = Path.resolve(path);
	exports.exists(path, function (exists) {
		if (exists) { return cb() }

		var prefix = path.match(/^(\w+:)?\//)[0];
		var ls = path.substr(prefix.length).split('/');
		
		function shift (err) {
			if (err) { return cb(err) }
			if (!ls.length) { return cb() }
			
			prefix += ls.shift() + '/';
			exports.exists(prefix, function (exists) {
				if (exists) { return shift() }
				mkdir(prefix, mode, shift);
			});
		}
		shift();
	});
};

/**
	* create all file dir sync
	* @param {String}   path
	* @param {String}   mode  (Optional)
	*/
exports.mkdir_p_sync = function (path, mode){
	
	path = Path.resolve(path);
	
	if(fs.existsSync(path)){
		return;
	}
	
	var prefix = path.match(/^(\w+:)?\//)[0];
	var ls = path.substr(prefix.length).split('/');
	
	for(var i = 0; i < ls.length; i++){
		prefix += ls[i] + '/';
		if(!fs.existsSync(prefix)){
			mkdirSync(prefix, mode);
		}
	}
};

/**
 * @func inl_ls_sync
 */
function inl_ls_sync(origin, path, depth, each_cb) {
	var ls = fs.readdirSync(`${origin}/${path}`);
	var rev = [];
	
	for (var i = 0; i < ls.length; i++) {
		var name = ls[i];
		var pathname = path ? `${path}/${name}` : name;
		var stat = fs.statSync(`${origin}/${pathname}`);
		stat.name = name;
		each_cb(stat, pathname);
		
		if (stat.isDirectory() && depth) {
			stat.children = inl_ls_sync(origin, pathname, depth, each_cb);
		}
		rev.push(stat);
	}

	return rev;
}

async function inl_ls(origin, path, depth, each_cb) {
	var ls = await async_call(fs.readdir, `${origin}/${path}`);
	var rev = [];
	
	for (var i = 0; i < ls.length; i++) {
		var name = ls[i];
		var pathname = path ? `${path}/${name}` : name;
		var stat = await async_call(fs.stat, `${origin}/${pathname}`);
		stat.name = name;
		each_cb(stat, pathname);
		
		if (stat.isDirectory() && depth) {
			stat.children = await inl_ls(origin, pathname, depth, each_cb);
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
exports.ls = function (path, depth, cb, each_cb) {

	path = Path.resolve(path);

	if (typeof depth == 'function') {
		if (typeof cb == 'function') {
			each_cb = cb;
		}
		cb = depth;
		depth = false;
	}

	cb = cb || function (err) {
		if (err) throw util.err(err);
	}

	each_cb = util.cb(each_cb);
	
	fs.stat(path, function (err, stat) {
		if (err)
			return cb(err);

		stat.name = Path.basename(path);
		each_cb(stat, '');

		if (stat.isDirectory()) {
			inl_ls(path, '', depth, each_cb).then(e=>cb(null, e)).catch(cb)
		} else {
			cb(null, null);
		}
	});
};

/**
	* get dir info
	*/
exports.ls_sync = function(path, depth, each_cb) {
	path = Path.resolve(path);

	if (typeof depth == 'function') {
		each_cb = depth;
		depth = false;
	} else {
		each_cb = util.cb(each_cb)
	}
	
	var rev = null;
	var stat = fs.statSync(path);
	stat.name = Path.basename(path);
	each_cb(stat, '');

	if (stat.isDirectory()) {
		rev = inl_ls_sync(path, '', depth, each_cb);
	}
	return rev;
};

exports.list = exports.ls;
exports.listSync = exports.ls_sync;
exports.mkdirpSync = exports.mkdir_p_sync;
exports.mkdirp = exports.mkdir_p;
exports.copySync = exports.cp_sync;
exports.copy = exports.cp;
exports.removerSync = exports.rm_r_sync;
exports.remover = exports.rm_r;
exports.chmodr = exports.chmod_r;
exports.chownr = exports.chown_r;
