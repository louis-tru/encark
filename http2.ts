/* ***** BEGIN LICENSE BLOCK *****
 * Distributed under the BSD license:
 *
 * Copyright (c) 2015, blue.chu
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *     * Redistributions of source code must retain the above copyright
 *       notice, this list of conditions and the following disclaimer.
 *     * Redistributions in binary form must reproduce the above copyright
 *       notice, this list of conditions and the following disclaimer in the
 *       documentation and/or other materials provided with the distribution.
 *     * Neither the name of blue.chu nor the
 *       names of its contributors may be used to endorse or promote products
 *       derived from this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
 * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL blue.chu BE LIABLE FOR ANY
 * DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
 * LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
 * ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
 * SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 *
 * ***** END LICENSE BLOCK ***** */

import buffer,{Buffer} from './buffer';
import {URL} from './path';
import * as http2 from 'http2';
import {
	Options,Result,defaultOptions,
	userAgent,querystringStringify,stringifyXml, Request
} from './request';
import somes from './util';
import errno from './errno';

export function http2request(session: http2.ClientHttp2Session, url: string, opts?: Options): Promise<Result<Buffer>> {
	var options = Object.assign({}, defaultOptions, opts);
	var { params, method, signer } = options;

	return somes.promise<Result<Buffer>>(async (resolve, reject)=>{
		var uri = new URL(url);
		uri.clearHash();
	
		var headers: http2.OutgoingHttpHeaders = {
			':path': uri.path,
			':scheme': 'https',
			':authority': uri.hostname,
			':method': method || 'GET',
			'user-agent': userAgent,
			'accept': 'application/json',
			...options.headers,
		};

		var post_data: string | null = null;
	
		if (method == 'POST') {
			if (options.urlencoded || options.dataType == 'urlencoded') {
				headers['content-type'] = 'application/x-www-form-urlencoded';
				if (params) {
					post_data = querystringStringify(params);
				}
			} else if (options.dataType == 'xml') {
				headers['content-type'] = 'application/xml';
				if (params) {
					if (typeof params == 'string') {
						post_data = params;
					} else {
						post_data = stringifyXml(params);
					}
				}
			} else {
				headers['content-type'] = 'application/json';
				if (params) {
					post_data = JSON.stringify(params);
				}
			}
			headers['content-length'] = post_data ? buffer.byteLength(post_data) : 0;
		} else {
			if (params) {
				uri.params = Object.assign(uri.params, params);
			}
		}

		if (signer) {
			Object.assign(headers, await signer.sign(uri.path, post_data ? post_data: ''));
		}

		if (options.logs) {
			var logs = [
				"'" + uri.href + "'",
				'-X ' + method,
				...(Object.entries(headers).map(([k,v])=>`-H '${k}: ${v}'`)),
				...(post_data? [`-d '${post_data}'`]: []),
			];
			console.log('curl http2', logs.join(' \\\n'));
		}

		// send http2 request

		var req = session.request(headers, {exclusive: true, weight: 220/*, endStream: true*/});
		var buffers: Buffer[] = [];
		var statusCode = 0;
		var responseHeaders: Dict = {};

		var Err = (e?: Error)=>{
			if (reject) {
				session.removeListener('error', Err);
				session.removeListener('close', Err);
				var errs: Error[] = [];
				if (e) errs.push(e);
				reject(Error.new(errno.ERR_HTTP2_ERROR, ...errs));
				reject = null as any;
			}
		};

		var Ok = ()=>{
			session.removeListener('error', Err);
			session.removeListener('close', Err);
			resolve({
				data: buffer.concat(buffers),
				headers: responseHeaders,
				statusCode: statusCode,
				httpVersion: '2.0',
				requestHeaders: headers as Dict,
				requestData: options.params as any,
				cached: false,
			});
		};

		if (options.timeout) {
			req.setTimeout(options.timeout)
		}

		session.on('error', Err);
		session.on('close', Err);
		req
			.on('timeout', Err)
			.on('error', Err)
			.on('data', (chunk) =>buffers.push(chunk))
			.on('response', (headers) => {
				for (var [k,v] of Object.entries(headers)) {
					if (k[0] != ':')
						responseHeaders[k] = v;
				}
				statusCode = headers[':status'] as number;
			})
			.on('end', Ok)
			.end(method == 'POST' ? post_data: null);
	});
}

export class Http2Sessions {

	private _http2_sessions: Dict<http2.ClientHttp2Session> = {};

	// tls.SecureVersion, maxSsl?: tls.SecureVersion
	session(url: string, opts?: Options) {
		var uri = new URL(url);
		var origin = uri.origin;
		if (!this._http2_sessions[origin]) {
			var {minSsl,maxSsl} = opts || {};
			var session = http2.connect(origin, {
				port: Number(uri.port) || 443,
				minVersion: minSsl,
				maxVersion: maxSsl,
				rejectUnauthorized: false,
				protocol: 'https:',
			});

			session.on('close', ()=>{ delete this._http2_sessions[origin] });
			session.on('error', (e)=>{ delete this._http2_sessions[origin] });

			session.settings({
				headerTableSize: 65536,
				initialWindowSize: 6291456,
				maxConcurrentStreams: 1000,
				maxHeaderListSize: 262144,
				// enablePush?: boolean;
				// maxFrameSize?: number;
				// enableConnectProtocol?: boolean;
			});

			// var log = fs.openSync('/Users/louis/tls/sslkeylog.log', 'a');
			// this._http2_session.socket.on('keylog', function(line: Buffer) {
				// fs.write(log, line, ()=>{});
				// fs.write(log, '\n', ()=>{});
			// });
			this._http2_sessions[origin] = session;
		}
		return this._http2_sessions[origin];
	}

}

export class Http2Request extends Request {

	private _http2_sessions = new Http2Sessions();

	rawRequest(url: string, opts: Options) {
		return http2request(this._http2_sessions.session(url, opts), url, opts);
	}

}