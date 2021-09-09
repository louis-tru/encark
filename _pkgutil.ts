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

import _keys from './_keys' ;
import _util from './_util' ;

export type Optopns = Dict<string|string[]>;

const {haveNode, haveFlare, haveWeb} = _util;
const PREFIX = 'file:///';
const options: Optopns = {};  // start options

var config: Dict | null = null;
const _require = (module as any).require;

var cwd:()=>string;
var _cwd:()=>string;
var chdir:(cwd:string)=>boolean;
var win32: boolean = false;
var _path: any;
var _flare_pkgutil: any;
var debug = false;

if (haveFlare) {
	_flare_pkgutil = __require__('_pkguitl');
	_path = __require__('_path');
	win32 = __require__('_util').platform == 'win32';
	cwd = _path.cwd;
	_cwd = cwd;
	chdir = _path.chdir;
} else if (haveNode) {
	_path = require('path');
	win32 = process.platform == 'win32';
	cwd = process.cwd;
	_cwd = win32 ? function() {
		return PREFIX + cwd().replace(/\\/g, '/');
	}: function() {
		return PREFIX + cwd().substr(1);
	};
	chdir = function(path) {
		path = fallbackPath(path);
		process.chdir(path);
		return cwd() == path;
	};
	process.execArgv = process.execArgv || [];
} else if (haveWeb) { // web
	var origin = location.origin;
	let pathname = location.pathname;
	let dirname = pathname.substr(0, pathname.lastIndexOf('/'));
	let cwdPath = origin + dirname;
	cwd = function() { return cwdPath };
	_cwd = function() { return cwdPath };
	chdir = function() { return false };
} else {
	throw new Error('no support');
}

const fallbackPath = win32 ? function(url: string) {
	return url.replace(/^file:\/\/(\/([a-z]:))?/i, '$3').replace(/\//g, '\\');
} : function(url: string) {
	return url.replace(/^file:\/\//i, '');
};

const join_path = win32 ? function(args: string[]): string {
	for (var i = 0, ls = []; i < args.length; i++) {
		var item = args[i];
		if (item) ls.push(item.replace(/\\/g, '/'));
	}
	return ls.join('/');
}: function(args: string[]): string {
	for (var i = 0, ls = []; i < args.length; i++) {
		var item = args[i];
		if (item) ls.push(item);
	}
	return ls.join('/');
};

const matchs = win32 ? {
	resolve: /^((\/|[a-z]:)|([a-z]{2,}:\/\/[^\/]+)|((file|zip):\/\/\/))/i,
	isAbsolute: /^([\/\\]|[a-z]:|[a-z]{2,}:\/\/[^\/]+|(file|zip):\/\/\/)/i,
	isLocal: /^([\/\\]|[a-z]:|(file|zip):\/\/\/)/i,
}: {
	resolve: /^((\/)|([a-z]{2,}:\/\/[^\/]+)|((file|zip):\/\/\/))/i,
	isAbsolute: /^(\/|[a-z]{2,}:\/\/[^\/]+|(file|zip):\/\/\/)/i,
	isLocal: /^(\/|(file|zip):\/\/\/)/i,
};

/** 
 * format part 
 */
function resolvePathLevel(path: string, retain_up: boolean = false): string {
	var ls = path.split('/');
	var rev = [];
	var up = 0;
	for (var i = ls.length - 1; i > -1; i--) {
		var v = ls[i];
		if (v && v != '.') {
			if (v == '..') // set up
				up++;
			else if (up === 0) // no up item
				rev.push(v);
			else // un up
				up--;
		}
	}
	path = rev.reverse().join('/');

	return (retain_up ? new Array(up + 1).join('../') + path : path);
}

/**
 * return format path
 */
function resolve(...args: string[]) {
	var path = join_path(args);
	var prefix = '';
	// Find absolute path
	var mat = path.match(matchs.resolve);
	var slash = '';
	
	// resolve: /^((\/|[a-z]:)|([a-z]{2,}:\/\/[^\/]+)|((file|zip):\/\/\/))/i,
	// resolve: /^((\/)|([a-z]{2,}:\/\/[^\/]+)|((file|zip):\/\/\/))/i,

	if (mat) {
		if (mat[2]) { // local absolute path /
			if (win32 && mat[2] != '/') { // windows d:\
				prefix = PREFIX + mat[2] + '/';
				path = path.substr(2);
			} else {
				prefix = PREFIX; //'file:///';
			}
		} else {
			if (mat[4]) { // local file protocol
				prefix = mat[4];
			} else { // network protocol
				prefix = mat[0];
				slash = '/';
			}
			// if (prefix == path.length)
			if (prefix == path) // file:///
				return prefix;
			path = path.substr(prefix.length);
		}
	} else { // Relative path, no network protocol
		var cwd = _cwd();
		if (haveWeb) {
			prefix = origin + '/';
			path = cwd.substr(prefix.length) + '/' + path;
		} else {
			if (win32) {
				prefix += cwd.substr(0,10) + '/'; // 'file:///d:/';
				path = cwd.substr(11) + '/' + path;
			} else {
				prefix = PREFIX; // 'file:///';
				path = cwd.substr(8) + '/' + path;
			}
		}
	}

	path = resolvePathLevel(path);

	return path ? prefix + slash + path : prefix;
}

/**
 * @func is_absolute # 是否为绝对路径
 */
function isAbsolute(path: string): boolean {
	return matchs.isAbsolute.test(path);
}

/**
 * @func is_local # 是否为本地路径
 */
function isLocal(path: string): boolean {
	return matchs.isLocal.test(path);
}

function isLocalZip(path: string): boolean {
	return /^zip:\/\/\//i.test(path);
}

function isNetwork(path: string): boolean {
	return /^(https?):\/\/[^\/]+/i.test(path);
}

if (haveNode && !haveFlare) {
	var fs = require('fs');
	require('module').Module._extensions['.keys'] = 
		function(module: NodeModule, filename: string): any {
		var content = fs.readFileSync(filename, 'utf8');
		try {
			module.exports = _keys(stripBOM(content));
		} catch (err: any) {
			err.message = filename + ': ' + err.message;
			throw err;
		}
	};
}

/**
 * Remove byte order marker. This catches EF BB BF (the UTF-8 BOM)
 * because the buffer-to-string conversion in `fs.readFileSync()`
 * translates it to FEFF, the UTF-16 BOM.
 */
function stripBOM(content: string): string {
	if (content.charCodeAt(0) === 0xFEFF) {
		content = content.slice(1);
	}
	return content;
}

function parseOptions(args: string[], options: Optopns) {
	for (var i = 0; i < args.length; i++) {
		var item = args[i];
		var mat = item.match(/^-{1,2}([^=]+)(?:=(.*))?$/);
		if (mat) {
			var name = mat[1].replace(/-/gm, '_');
			var val = mat[2] || 'true';
			var raw_val = options[name];
			if ( raw_val ) {
				if ( Array.isArray(raw_val) ) {
					raw_val.push(val);
				} else {
					options[name] = [raw_val, val];
				}
			} else {
				options[name] = val;
			}
		}
	}
}

function requireWithoutErr(pathname: string) {
	try { return _require(pathname) } catch(e) {}
}

function readConfigFile(pathname: string, pathname2: string) {
	var c = requireWithoutErr(pathname);
	var c2 = requireWithoutErr(pathname2);
	if (c || c2) {
		return Object.assign({}, c, c2);
	}
}

function getConfig(): Dict {
	if (haveFlare) {
		return _flare_pkgutil.config;
	}
	if (!config) {
		if (haveNode) {
			var mainModule = process.mainModule;
			if (mainModule) {
				config = 
					readConfigFile(
						_path.dirname(mainModule.filename) + '/.config', 
						_path.dirname(mainModule.filename) + '/config') || 
						readConfigFile(cwd() + '/.config', cwd() + '/config') || {};
			} else {
				config = readConfigFile(cwd() + '/.config', cwd() + '/config') || {};
			}
		} else {
			config = {};
		}
	}
	return config as Dict;
}

function initArgv() { // init
	var args: string[] = [];
	if (_util.argv.length > 2) {
		args = _util.argv.slice(2);
	}
	parseOptions(args, options);

	if (haveFlare) {
		debug = __require__('_util').debug;
	} else if (haveNode) {
		if (process.execArgv.some(s=>(s+'').indexOf('--inspect') == 0)) {
			debug = true;
		}
	}
	if (options.dev || options.debug) {
		debug = true;
	}
};

initArgv();

export default {
	fallbackPath,
	resolvePathLevel,
	resolve, 				// func pkg
	isAbsolute, 		// func pkg
	isLocal,				// 
	isLocalZip,
	isNetwork,
	get options() { return options },
	get config() { return getConfig() },
	debug,
	//
	cwd: _cwd,
	chdir,
};