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

import * as net from 'net';

function once<A extends any[]>(fn: (...args: A)=>void){
	var called = false;
	return function(self: any, ...args: A) {
		if (!called) {
			called = true;
			fn.call(self, ...args);
		}
	};
}

var noop = function() {};

var isRequest = function(stream: any /* net.Socket*/) {
	return stream.setHeader && typeof stream.abort === 'function';
};

var isChildProcess = function(stream: any /* net.Socket*/) {
	return stream.stdio && Array.isArray(stream.stdio) && stream.stdio.length === 3
};

interface Options {
	readable?: boolean;
	writable?: boolean;
	error?: boolean;
}

interface Callback {
	(err?: Error | null, data?: any): void;
}

export default function eos(stream: net.Socket, opts?: Options, callback?: Callback): ()=>void {

	var cb = once(callback || noop);
	var ws = (<any>stream)._writableState;
	var rs = (<any>stream)._readableState;

	var options = Object.assign({ 
		readable: stream.readable,
		writable: stream.writable,
	}, opts);

	var readable = options.readable;
	var writable = options.writable;

	var onlegacyfinish = function() {
		if (!stream.writable)
			onfinish();
	};

	var onfinish = function() {
		writable = false;
		if (!readable)
			cb(stream);
	};

	var onend = function() {
		readable = false;
		if (!writable)
			cb(stream);
	};

	var onexit = function(exitCode: number) {
		cb(stream, exitCode ? new Error('exited with error code: ' + exitCode) : null);
	};

	var onerror = function(err: Error) {
		cb(stream, err);
	};

	var onclose = function() {
		if (readable && !(rs && rs.ended)) return cb(stream, new Error('premature close'));
		if (writable && !(ws && ws.ended)) return cb(stream, new Error('premature close'));
	};

	var onrequest = function() {
		(<any>stream).req.on('finish', onfinish);
	};

	if (isRequest(stream)) {
		stream.on('complete', onfinish);
		stream.on('abort', onclose);
		if ((<any>stream).req)
			onrequest();
		else stream.on('request', onrequest);
	} else if (writable && !ws) { // legacy streams
		stream.on('end', onlegacyfinish);
		stream.on('close', onlegacyfinish);
	}

	if (isChildProcess(stream))
		stream.on('exit', onexit);

	stream.on('end', onend);
	stream.on('finish', onfinish);
	if (options.error !== false)
		stream.on('error', onerror);
	stream.on('close', onclose);

	return function() {
		stream.removeListener('complete', onfinish);
		stream.removeListener('abort', onclose);
		stream.removeListener('request', onrequest);
		if ((<any>stream).req)
			(<any>stream).req.removeListener('finish', onfinish);
		stream.removeListener('end', onlegacyfinish);
		stream.removeListener('close', onlegacyfinish);
		stream.removeListener('finish', onfinish);
		stream.removeListener('exit', onexit);
		stream.removeListener('end', onend);
		stream.removeListener('error', onerror);
		stream.removeListener('close', onclose);
	};
}