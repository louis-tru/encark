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
import * as child_process from 'child_process';
import * as stream from 'stream';

export function syscall(cmd: string): SpawnResult {
	var ch = child_process.spawnSync('sh', ['-c', cmd], {encoding: 'utf8'});
	if (ch.status != 0) {
		if (ch.stderr.length) {
			console.error(ch.stderr);
		}
		if (ch.stdout.length) {
			console.log(ch.stdout);
		}
		// console.log('status != 0 exit process');
		// process.exit(ch.status);
		throw Error.new([ch.status, 'status != 0 exit process']);
	} else {
		var stdout = ch.stdout.length ? ch.stdout.split('\n'): [];
		var stderr = ch.stderr.length ? ch.stderr.split('\n'): [];
		return {
			code: ch.status,
			first: stdout[0] || '',
			stdout, stderr,
		};
	}
}

export function execSync(cmd: string): SpawnResult {
	return spawnSync('sh', ['-c', cmd]);
}

export function spawnSync(cmd: string, args: string[] = []): SpawnResult {
	// var ls = cmd.split(/\s+/);
	// var ch = child_process.spawnSync(ls.shift(), ls);
	var ch = child_process.spawnSync(cmd, args, {encoding: 'utf8'});
	if (ch.error) {
		throw ch.error;
	} else {
		var stdout = ch.stdout.length ? ch.stdout.split('\n'): [];
		var stderr = ch.stderr.length ? ch.stderr.split('\n'): [];
		return {
			code: ch.status || 0,
			first: stdout[0] || '',
			stdout, stderr,
		};
	}
}

function on_data_default(data: Buffer): string {
	if (util.config.moreLog) {
		process.stdout.write(data);
		process.stdout.write('\n');
	}
	return data.toString('utf8');
}

function on_error_default(data: Buffer): string {
	if (util.config.moreLog) {
		process.stderr.write(data);
		process.stderr.write('\n');
	}
	return data.toString('utf8');
}

export interface SpawnOptions {
	onData?: (data: Buffer)=>string;
	onError?: (data: Buffer)=>string;
	stdout?: stream.Writable;
	stderr?: stream.Writable;
	stdin?: stream.Readable;
}

export interface SpawnResult {
	code: number;
	first: string;
	stdout: string[];
	stderr: string[];
}

export interface SpawnPromise extends Promise<SpawnResult> {
	process: child_process.ChildProcessByStdio<stream.Writable, stream.Readable, stream.Readable>;
}

export function exec(cmd: string, options: SpawnOptions = {}): SpawnPromise  {
	return spawn('sh', ['-c', cmd], options);
}

export function spawn(cmd: string, args: string[] = [], options: SpawnOptions = {}): SpawnPromise {
	var {
		onData = on_data_default,
		onError = on_error_default,
		stdout, stderr, stdin,
	} = options;

	stdout = stdout instanceof stream.Writable ? stdout: undefined;
	stderr = stderr instanceof stream.Writable ? stderr: undefined;
	stdin = stdin instanceof stream.Readable ? stdin: undefined;

	var ch: child_process.ChildProcessByStdio<stream.Writable, stream.Readable, stream.Readable> = child_process.spawn(cmd, args);

	var promise = new Promise<SpawnResult>(function(resolve, reject) {
		var r_stdout: string[] = [];
		var r_stderr: string[] = [];
		var empty = Buffer.alloc(0);

		var data_tmp: Dict<Buffer> = {
			stdout: empty,
			stderr: empty,
		};

		function on_data_before(data: Buffer) {
			var r = onData.call(ch, data);
			if (r)
				r_stdout.push(r);
		}

		function on_error_before(data: Buffer) {
			var r = onError.call(ch, data);
			if (r)
				r_stderr.push(r);
		}

		function parse_data(data: Buffer, name: string) {
			var output = data_tmp[name];
			var index, prev = 0;
			var handle = name == 'stdout' ? on_data_before: on_error_before;

			// console.log('parse_data', (data + ''), (data + '').indexOf('\n'), data.indexOf('\n'), 'ch', !!ch);

			while ( (index = data.indexOf('\n', prev)) != -1 ) {
				handle(Buffer.concat([output, data.slice(prev, index)]));
				prev = index + 1;
				output = empty;
			}
			data_tmp[name] = Buffer.concat([output, data.slice(prev)]);
		}

		function on_end(err?: Error | null, code?: number) {
			if (ch) {
				if (stdin) {
					stdin.unpipe(ch.stdin);
				}
				(ch as any) = null;
				if (err) {
					reject(Error.new(err));
				} else {
					if (data_tmp.stdout.length) {
						on_data_before(data_tmp.stdout);
					}
					if (data_tmp.stderr.length) {
						on_error_before(data_tmp.stderr);
					}
					resolve({ code: code || 0, first: r_stdout[0], stdout: r_stdout, stderr: r_stderr });
				}
			}
		}

		// if (promise)
		// 	promise.process = ch;

		ch.stdout.on('data', function(e: Buffer) {
			parse_data(e, 'stdout');
		});

		ch.stderr.on('data', function(e: Buffer) {
			parse_data(e, 'stderr');
		});

		ch.on('error', (e: Error)=>on_end(e));
		ch.on('exit', (e: number)=>on_end.setTimeout(0, null, e));

		if (stdout) {
			ch.stdout.pipe(stdout);
		}

		if (stderr) {
			ch.stderr.pipe(stderr);
		}

		if (stdin) {
			stdin.pipe(ch.stdin);
		}

	}) as SpawnPromise;

	promise.process = ch;

	return promise;
}