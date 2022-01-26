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
import {List,ListItem} from './event';
import * as http from 'http';
import * as https from 'https';
import * as url from 'url';
import * as fs from 'fs';
import errno from './errno';
import request from './request';

export interface Options {
	renewal?: boolean;
	limit?: number;
	onProgress?(opts: { total: number, size: number, speed: number, data: Buffer }): void;
	timeout?: number;
	proxy?: string;
}

export interface Result {
	total: number;
	size: number; 
	mime: string;
}

export class WgetIMPL extends Promise<Result> {
	private _ok = false;
	private _req: http.ClientRequest | undefined;
	private _res: http.IncomingMessage| undefined;
	private _reject: ((err: Error)=>void) = util.noop;
	private _resolve: ((value: Result) => void) = util.noop;
	private _fd = 0;
	private _www = '';
	private _save = '';
	private _buffers = new List<Buffer>();
	private _res_end = false;
	private _download_total = 0;
	private _download_size = 0;
	private _file_mime = 'application/octet-stream';
	private _start_range = 0;
	private _range = '';
	private _proxy = '';
	private _timeout = 0;
	private _limit = 0;
	private _progress = util.noop as any;
	private _time = Date.now();
	private _timeStr = new Date().toString('yyyy-MM-dd hh:mm:ss');

	private constructor(arg: any) {
		super(arg);
	}

	get readyState() {
		if (this._res) {
			return (this._res.socket as any).readyState as string;
		} else {
			return '';
		}
	}

	get total() {
		return this._download_total;
	}

	get size() {
		return this._download_size;
	}

	get time() {
		return { time: this._time, timeStr: this._timeStr };
	}

	get www() {
		return this._www;
	}

	get save() {
		return this._save;
	}

	get req(): http.ClientRequest | undefined {
		return this._req;
	}

	get res(): http.IncomingMessage | undefined {
		return this._res;
	}

	abort(): void {
		if (!this._ok) { // abrot
			this._ok = true;
			if (this._reject) {
				this._reject(Error.new(errno.ERR_WGET_FORCE_ABORT));
			}
			if (this._req) {
				this._req.destroy();
			}
		}
	}

	private _error(err: any) {
		if (!this._ok) {
			this._ok = true;
			var e = Object.assign(Error.new(err), { www: this._www, save: this._save });
			if (this._fd) {
				var _fd = this._fd; this._fd = 0;
				fs.close(_fd, util.noop);
				this._reject(e)
			} else {
				this._reject(e);
			}
		}
	}

	private _write() {
		if (this._fd) {
			if (this._buffers.length) {
				var buf = (this._buffers.first as ListItem<Buffer>).value;
				fs.write(this._fd, buf, (err)=>{
					if (err) {
						this._error(err);
						if (this._req)
							this._req.destroy();
					} else {
						this._buffers.shift();
						this._write();
					}
				});
			} else if (this._res_end) {
				this._ok = true;
				var _fd = this._fd; this._fd = 0;
				this._resolve({
					total: this._download_total,
					size: this._download_size, mime: this._file_mime,
				});
				fs.close(_fd, util.noop);
			}
		} else if (this._res_end && !this._ok) {
			this._ok = true;
			this._resolve({ total: this._download_total, size: this._download_size, mime: this._file_mime });
		}
	}

	private _request(www: string, redirect: number) {
		var first_offset = 0;
		var uri = url.parse(String(www));
		var isSSL = uri.protocol == 'https:';
		var lib =	isSSL ? https: http;
		var hostname = uri.hostname;
		var port = Number(uri.port) || (isSSL ? 443: 80);
		var path = uri.path as string;
		var headers = {
			'User-Agent': request.userAgent,
			...(this._range ? {
			range: this._range}: {}),
		} as Dict;
	
		var GLOBAL_PROXY = process.env.HTTP_PROXY || process.env.http_proxy;
		var proxy = this._proxy || GLOBAL_PROXY;

		if (proxy) {
			// set proxy
			if (/^https?:\/\//.test(proxy)) {
				var proxyUrl = new url.URL(proxy);
				isSSL = proxyUrl.protocol == 'https:';
				hostname = proxyUrl.hostname;
				port = Number(proxyUrl.port) || (isSSL ? 443: 80);
				path = uri.href;
				// set headers
				headers.host = uri.hostname;
				if (uri.port) {
					headers.host += ':' + uri.port;
				}
			}
		}

		var options: http.RequestOptions & https.AgentOptions = {
			hostname,
			port,
			path,
			method: 'GET',
			headers,
			timeout: this._timeout || 12e4,
			rejectUnauthorized: false,
		};

		if (isSSL) {
			options.agent = new https.Agent(options);
		}

		// new request 
		var req = lib.request(options, (res: http.IncomingMessage)=> {
			if (this._ok) // abort
				return;
			this._req = req;
			this._res = res;

			var error = (err: any) => {
				this._error(err);
			};

			var fail = (msg?: string)=>{
				var err = Error.new(errno.ERR_DOWNLOAD_FAIL);
				err.description = msg;
				err.statusCode = res.statusCode;
				err.httpVersion = res.httpVersion;
				err.headers = res.headers;
				this._error(err);
				req.destroy();
			};

			var end = () => {
				if (!this._res_end) {
					this._res_end = true;
					if (!this._download_total || this._download_size == this._download_total) {
						if (this._buffers.length == 0)
							this._write();
					} else {
						fail(`Bad size, download_size != download_total, ${this._download_size} != ${this._download_total}`);
					}
				}
			};

			if (res.statusCode == 200 || res.statusCode == 206) {
				res.pause();
				res.socket.setNoDelay(true);
				res.socket.setKeepAlive(true, 3e4); // 30s

				res.socket.on('error', e=>error(e));
				// res.socket.on('end', ()=>end.setTimeout(50)); // The end of the delay is called after ONDATA, which may be a node error.
				res.socket.on('close', ()=>end());
				res.on('error', e=>error(e));
				res.on('close', ()=>end());
				res.on('end', ()=>end);

				var speed = 0; // speed / 3 second
				var time = 0;
				var ptime = 0; // pause time

				res.on('data', (chunk: Buffer)=>{

					if (first_offset && chunk.length) {
						chunk = Buffer.from(chunk.buffer, chunk.byteOffset + first_offset, chunk.length - first_offset);
						first_offset = 0;
					}

					if (!chunk.length)
						return;

						this._download_size += chunk.length;

					var st = Date.now();
					var ts = st - time; // time span
					if (ts) {
						var ispeed = chunk.length / ts * 1e3; // instantaneous speed/second
						// speed = (speed + ispeed * 0.11) * 0.901; // (100 + 100 * 0.11) * 0.901, Finally converges to ispeed
						speed = (speed + ispeed * 0.25) * 0.8; // (100 + 100 * 0.25) * 0.8, Finally converges to ispeed

						// limit flow, byte/second
						if (this._limit && time) {
							if (speed > this._limit) {
								ptime = Math.min(1e4, ptime + 5); // increase
							} else {
								ptime = Math.max(0, ptime - 5); // lessen
							}
							if (ptime > 0) {
								res.pause();
								util.sleep(ptime).then(e=>res.resume());//.catch(e=>{});
							}
						}
						time = st;
						// console.log(Math.floor(speed / 1024), Math.floor(ispeed / 1024));
					}

					try {
						this._progress({ total: this._download_total, size: this._download_size, speed, data: chunk });
					} catch(e) {
						console.warn('WgetIMPL#_request', e);
					}

					this._buffers.push(chunk);

					if (this._buffers.length == 1)
					this._write();
				});

				var flag = 'w';

				// set file open flag
				if (this._start_range 
						&& res.statusCode == 206 
						// && res.headers['accept-ranges'] == 'bytes'
					)
				{
					// var ranges = res.headers['accept-ranges'];
					// if (ranges != 'bytes') {
					// 	throw 'bad ranges';
					// }
					var content_range = <string>res.headers['content-range'];
					var m = content_range.match(/^bytes\s(\d+)-/);
					if (m) {
						if (Number(m[1]) != this._start_range) {
							return fail('Bad content range');
						}
					}
					flag = 'a';
					first_offset = 1;
				}

				// set content total size
				this._download_total = Number(res.headers['content-length']) || 0/* stream */;
				if (this._download_total) {
					if (flag == 'a') {
						this._download_total += this._download_size - 1;
					}
				}

				this._file_mime = (res.headers['content-type'] || this._file_mime).split(';')[0];
				
				if (this._save) {
					fs.open(this._save, flag, (err, _fd)=>{
						if (err) {
							this._error(err);
							req.destroy();
						} else {
							if (this._ok) { // error end
								fs.close(_fd, util.noop);
							} else {
								this._fd = _fd;
								res.resume();
							}
						}
					});
				} else {
					res.resume();
				}
			}
			else if ((res.statusCode == 301 || res.statusCode == 302) && res.headers.location && redirect < 10) {
				// "location": "https://files.dphotos.com.cn/2020/09/21/77b2670e.jpg?imageView2/1/w/720/h/1280"
				this._req = undefined;
				this._res = undefined;
				req.destroy();
				this._request(res.headers.location, redirect + 1);
			} else {
				fail(); // err
			}
		});

		req.on('abort', ()=>this._error(errno.ERR_HTTP_REQUEST_ABORT));
		req.on('error', e=>this._error(e));
		req.on('timeout', ()=>{
			this._error(errno.ERR_HTTP_REQUEST_TIMEOUT);
			req.destroy();
		});
		req.end(); // send
	}

	static wget(www: string, save: string | null, options?: Options): WgetIMPL {
		var _reject: ((err: Error)=>void) = util.noop;
		var _resolve: ((value: Result) => void) = util.noop;

		var wget = new WgetIMPL(function (resolve: any, reject: any) {
			_reject = reject;
			_resolve = resolve;
		});

		wget._reject = _reject;
		wget._resolve = _resolve;
		wget._exec(www, save, options);

		return wget;
	}

	private _exec(www: string, save: string | null, options_?: Options) { // 206
		var { renewal = false,
					limit = wget.LIMIT, // limit rate byte/second
					// limitTime = 0, // limt network use time
					onProgress,
					timeout = 12e4, proxy } = options_ || {};

		this._limit = Number(limit) || 0;
		this._progress = onProgress || util.noop;
		this._timeout = timeout;
		this._proxy = proxy || '';
		this._www = www;
		this._save = save || '';

		//if (ok) // abort
		//	return _reject(Error.new(errno.ERR_WGET_FORCE_ABORT));

		fs.stat(this._save, (err, stat)=>{
			if (renewal) {
				if (!err) {
					if (stat.isFile()) {
						if (stat.size) {
							this._start_range = stat.size - 1; // To avoid returning to the 416 state
							this._download_size = stat.size;
						}
					} else {
						this._ok = true; // abort
						return this._reject(Error.new(errno.ERR_WGET_RENEWAL_FILE_TYPE_ERROR));
					}
				}
				if (this._start_range) {
					this._range = 'bytes=' + this._start_range + '-';
					// (options.headers as http.OutgoingHttpHeaders).range = 'bytes=' + start_range + '-';
				}
			}

			this._request(www, 0);
		});
	}
}

export interface Wget {
	(www: string, save: string | null, options?: Options): WgetIMPL;
	LIMIT: number;
}

var wget = WgetIMPL.wget as Wget;

wget.LIMIT = 0;

export default wget;