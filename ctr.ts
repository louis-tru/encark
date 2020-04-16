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

import util from './util';
import * as path from 'path';
import * as fs from './fs';
import {HttpService} from './http_service';
import * as vm from 'vm';
import template, {Options} from './template';
// import * as Module from 'module';
const Module = require('module');

var FILE_CACHE_TIMEOUT = util.debug ? 0 : 1000 * 60 * 10; // 10分钟
var FILE_CACHES: Dict = {};
var _require = require;

function makeRequireFunction(mod: any) {
	function require(path: string) {
		return mod.require(path);
	}
	function resolve(request: string, options: any) {
		if (typeof request !== 'string') {
			var actual = request;
			var str = `The "request" argument must be of type string`;
			str += `. Received type ${actual !== null ? typeof actual : 'null'}`;
			throw new Error(str);
		}
		return (<any>Module)._resolveFilename(request, mod, false, options);
	}
	require.resolve = resolve;
	return require;
}

function requireEjs(filename: string, options: Options, __mainfilename: string) {

	var ext = path.extname(filename);

	if (ext != '.ejs' && ext != '.ejsx') {
		return _require(filename);
	}

	var ejs = FILE_CACHES[filename];
	if (ejs) {
		if (ejs.timeout < Date.now())  {
			FILE_CACHES[filename] = ejs = null;
		}
	}
	if (!ejs) {
		ejs = {
			source: fs.readFileSync(filename, 'utf8'),
			timeout: Date.now() + FILE_CACHE_TIMEOUT,
		};
		if (FILE_CACHE_TIMEOUT) {
			FILE_CACHES[filename] = ejs;
		}
	}

	var dirname = path.dirname(filename);
	var mod = { 
		exports: {},
		require: (path: string)=>requireEjs(require.resolve(path), options, __mainfilename),
		id: filename, 
		filename: filename,
		dirname: dirname,
		children: [],
		paths: (<any>Module)._nodeModulePaths(dirname),
		parent: null,
	};

	var result = `const __mainFilename = '${__mainfilename}';
								module.exports = ${template(ejs.source, options)}`;
	var wrapper = Module.wrap(result);

	var compiledWrapper = vm.runInThisContext(wrapper, {
		filename: filename,
		lineOffset: 0,
		displayErrors: true
	});

	compiledWrapper.call(mod.exports, mod.exports, 
		makeRequireFunction(<any>mod), mod, filename, dirname
	);

	return mod.exports;
}

/**
 * @class ViewController
 */
export class ViewController extends HttpService {

	view(name: string, data?: Dict) {
		var dirname = util.config.viewDirname;
		if (!dirname) {
			var mainModule = process.mainModule;
			if (mainModule) {
				dirname = path.dirname(mainModule.filename);
			} else {
				dirname = '';
			}
		}
		var ext = path.extname(name);
		var filename = path.resolve(dirname, ext ? name: name + '.ejs');

		this.markReturnInvalid();

		data = data || {};
		try {
			var func = requireEjs(filename, data, filename);
			// fs.writeFileSync(__dirname + '/test.js', func + '');
			var str = func(data);
			this.returnHtml(str);
		} catch(err) {
			this.returnErrorStatus(500, '<pre>' + err.message + '\n' + err.stack + '</pre>');
		}
	}
}
