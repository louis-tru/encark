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
var child_process = require('child_process');
var stream = require('stream');
var { moreLog } = util.config;

function syscall(cmd) {
	var ch = child_process.spawnSync('sh', ['-c', cmd]);
	if (ch.status != 0) {
		if (ch.stderr.length) {
			console.error(ch.stderr.toString('utf8'));
		}
		if (ch.stdout.length) {
			console.log(ch.stdout.toString('utf8'));
		}
		// console.log('status != 0 exit process');
		// process.exit(ch.status);
		throw Error.new('status != 0 exit process', ch.status);
	} else {
		return {
			code: ch.status,
			stdout: ch.stdout.length ? ch.stdout.toString().split('\n'): [],
			stderr: ch.stderr.length ? ch.stderr.toString().split('\n'): [],
		};
	}
}

function execSync(cmd) {
	return spawnSync('sh', ['-c', cmd]);
}

function spawnSync(cmd, args = []) {
	// var ls = cmd.split(/\s+/);
	// var ch = child_process.spawnSync(ls.shift(), ls);
	var ch = child_process.spawnSync(cmd, args);
	if (ch.error) {
		throw ch.error;
	} else {
		var stdout = ch.stdout.length ? ch.stdout.toString().split('\n'): [];
		var stderr = ch.stderr.length ? ch.stderr.toString().split('\n'): [];
		return {
			code: ch.status,
			first: stdout[0],
			stdout, stderr,
		};
	}
}

function on_data_default(data) {
	if (moreLog) {
		process.stdout.write(data);
		process.stdout.write('\n');
	}
	return data.toString('utf8');
}

function on_error_default(data) {
	if (moreLog) {
		process.stderr.write(data);
		process.stderr.write('\n');
	}
	return data.toString('utf8');
}

function exec(cmd, ...args) {
	return spawn('sh', ['-c', cmd], ...args);
}

function spawn(cmd, cmd_args = [], _args = {}) {
	var {
		onData = on_data_default,
		onError = on_error_default,
		stdout, stderr, stdin } = _args;
	stdout = stdout instanceof stream.Stream ? stdout: null;
	stderr = stderr instanceof stream.Stream ? stderr: null;
	stdin = stdin instanceof stream.Stream ? stdin: null;
	var ch;

	var promise = new Promise(function(resolve, reject) {
		var on_stdin;
		var r_stdout = [];
		var r_stderr = [];
		var empty = new Buffer(0);

		var data_tmp = {
			stdout: empty,
			stderr: empty,
		};

		function on_data(data) {
			var r = onData.call(ch, data);
			if (r)
				r_stdout.push(r);
		}

		function on_error(data) {
			var r = onError.call(ch, data);
			if (r)
				r_stderr.push(r);
		}

		function parse_data(data, name) {
			var output = data_tmp[name];
			var index, prev = 0;
			var handle = name == 'stdout' ? on_data: on_error;

			while ( (index = data.indexOf('\n', prev)) != -1 ) {
				handle(Buffer.concat([output, data.slice(prev, index)]));
				prev = index + 1;
				output = empty;
			}
			data_tmp[name] = Buffer.concat([output, data.slice(prev)]);
		}

		function on_end(err, code) {
			if (ch) {
				ch = null;
				if (stdin) {
					stdin.removeListener('data', on_stdin);
				}
				if (err) {
					reject(Error.new(err));
				} else {
					if (data_tmp.stdout.length) {
						on_data(data_tmp.stdout);
					}
					if (data_tmp.stderr.length) {
						on_error(data_tmp.stderr);
					}
					resolve({ code, first: r_stdout[0], stdout: r_stdout, stderr: r_stderr });
				}
			}
		}

		ch = child_process.spawn(cmd, cmd_args);

		ch.stdout.on('data', function(e) {
			if (stdout)
				stdout.write(e);
			parse_data(e, 'stdout');
		});
	
		ch.stderr.on('error', function(e) {
			if (stderr)
				stderr.write(e);
			parse_data(e, 'stderr');
		});

		ch.on('error', e=>on_end(e));
		ch.on('exit', e=>on_end(null, e));

		if (stdin) {
			stdin.addListener('data', on_stdin = function(e) {
				if (ch) {
					ch.stdin.write(e);
				}
			});
			ch.stdin.resume();
		}

	});

	promise.process = ch;

	return promise;
}

exports.syscall = syscall;
exports.execSync = execSync;
exports.spawnSync = spawnSync;
exports.exec = exec;
exports.spawn = spawn;

