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

import utils from './util';
import buffer,{IBuffer} from './buffer';
import url from './path';
import errno from './errno';

const { haveFlare, haveNode, haveWeb } = utils;
const _user_agent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_13_3) \
AppleWebKit/537.36 (KHTML, like Gecko) Chrome/64.0.3282.186 Safari/537.36';

if (haveFlare) {
	var user_agent = _user_agent;
	var httpFlare = __require__('_http');
}
else if (haveWeb) {
	var user_agent = navigator.userAgent;
	var XMLHttpRequest = globalThis.XMLHttpRequest;
}
else if (haveNode) {
	var user_agent = _user_agent;
	var http = require('http');
	var https = require('https');
} else {
	throw Error.new('Unimplementation');
}

var shared: any = null;
// var __id = 1;

export const userAgent = user_agent;
export type Params = Dict | null;
export type SecureVersion = 'TLSv1.3' | 'TLSv1.2' | 'TLSv1.1' | 'TLSv1';

export interface Options {
	params?: Params;
	method?: string,
	timeout?: number;
	headers?: Dict<string>;
	dataType?: string,
	signer?: Signer;
	urlencoded?: boolean;
	userAgent?: string;
	cacheTime?: number;
	noRepeat?: boolean;
	proxy?: string;
	minSsl?: SecureVersion;
	maxSsl?: SecureVersion;
	limitDataSize?: number;
	onReady?: (statusCode: number, headers: Dict)=>any;
}

export const defaultOptions: Options = {
	method: 'GET',
	params: null,
	headers: {},
	dataType: 'json',
	userAgent: user_agent,
	timeout: 18e4,
};

function stringifyPrimitive(v: any) {
	if (typeof v === 'string')
		return v;
	if (typeof v === 'number' && isFinite(v))
		return '' + v;
	if (typeof v === 'boolean')
		return v ? 'true' : 'false';
	return '';
}

export function querystringStringify(obj: any, sep: string = '&', eq: string = '=') {
	var encode = encodeURIComponent;

	if (obj !== null && typeof obj === 'object') {
		var keys = Object.keys(obj);
		var len = keys.length;
		var flast = len - 1;
		var fields = '';
		for (var i = 0; i < len; ++i) {
			var k = keys[i];
			var v = obj[k];
			var ks = encode(stringifyPrimitive(k)) + eq;

			if (Array.isArray(v)) {
				var vlen = v.length;
				var vlast = vlen - 1;
				for (var j = 0; j < vlen; ++j) {
					fields += ks + encode(stringifyPrimitive(v[j]));
					if (j < vlast)
						fields += sep;
				}
				if (vlen && i < flast)
					fields += sep;
			} else {
				fields += ks + encode(stringifyPrimitive(v));
				if (i < flast)
					fields += sep;
			}
		}
		return fields;
	}
	return '';
}

export function stringifyXml(obj: any) {
	var result = ['<xml>'];

	for (var [k, v] of Object.entries(obj)) {
		result.push(`<${k}>`);
		if (v && typeof v == 'object') {
			result.push(`![CDATA[${v}]]`);
		} else {
			result.push(String(v));
		}
		result.push(`</${k}>`);
	}

	result.push('</xml>');

	return result.join('');
}

export interface Result<T = any> {
	data: T;
	headers: Dict<string>;
	statusCode: number;
	httpVersion: string;
	requestHeaders: Dict<string>;
	requestData: Dict;
	cached: boolean;
}

export type PromiseResult<T = any> = Promise<Result<T>>

// Flare implementation
function requestFlare(
	options: Dict,
	soptions: Dict, 
	resolve: (e: Result)=>void,
	reject: (e: any)=>void,
	is_https?: boolean, 
	method?: string,
	post_data?: any
) {
	var url = is_https ? 'https://': 'http://';
	url += soptions.hostname;
	url += soptions.port != (is_https? 443: 80) ? ':'+soptions.port: '';
	url += soptions.path;

	httpFlare.request({
		url: url,
		method: method == 'POST'? http.HTTP_METHOD_POST: http.HTTP_METHOD_GET,
		headers: soptions.headers,
		postData: post_data,
		timeout: soptions.timeout,
		disableCache: true,
		disableSslVerify: true,
	}).then((res: any)=>{
		resolve({
			data: res.data,
			headers: res.responseHeaders,
			statusCode: res.statusCode,
			httpVersion: res.httpVersion,
			requestHeaders: soptions.headers,
			requestData: options.params,
			cached: false,
		});
	}).catch((err: any)=>{
		reject(Error.new(err));
	});
}

function requestWeb(
	options: Dict,
	soptions: Dict, 
	resolve: (e: Result)=>void,
	reject: (e: any)=>void,
	is_https?: boolean, 
	method?: string,
	post_data?: any
) {
	var url = is_https ? 'https://': 'http://';
	url += soptions.hostname;
	url += soptions.port != (is_https? 443: 80) ? ':'+soptions.port: '';
	url += soptions.path;
	// url += `${soptions.path.indexOf('?')==-1?'?':'&'}_=${__id++}`;

	var xhr = new XMLHttpRequest();
	xhr.open(method|| 'POST', url, true);
	xhr.responseType = 'arraybuffer';
	// xhr.responseType = 'text';
	xhr.timeout = soptions.timeout;

	delete soptions.headers['User-Agent'];
	delete soptions.headers['Host'];

	for (var key in soptions.headers) {
		xhr.setRequestHeader(key, soptions.headers[key]);
	}

	function parseResponseHeaders(str: string): Dict<string> {
		var r: Dict<string> = {};
		for (var s of str.split(/\r?\n/)) {
			var index = s.indexOf(':');
			if (index != -1)
				r[s.substring(0, index)] = s.substr( index + 1);
		}
		return r;
	}

	xhr.onload = async ()=>{
		var data = xhr.response;
		var r = {
			headers: parseResponseHeaders(xhr.getAllResponseHeaders()),
			statusCode: xhr.status,
			httpVersion: '1.1',
			requestHeaders: soptions.headers,
			requestData: options.params,
			cached: false,
		};
		if (data instanceof ArrayBuffer) {
			resolve(Object.assign(r, { data: buffer.from(data) }));
		} else if (data instanceof Blob && data.arrayBuffer) {
			data.arrayBuffer().then(e=>resolve(Object.assign(r, { data: buffer.from(e) })));
		} else {
			resolve(Object.assign(r, { data }));
		}
	};
	xhr.onerror = (e: any)=>{
		reject(Error.new(e.message));
	};
	xhr.ontimeout = ()=>{
		reject(Error.new(errno.ERR_HTTP_REQUEST_TIMEOUT));
	};
	xhr.send(post_data);
}

// Node implementation
function requestNode(options: Options, soptions: Dict,
	resolve: (e: Result)=>void,
	reject: (e: any)=>void,
	is_https?: boolean, 
	method?: string,
	post_data?: any
) {

	var lib = is_https ? https: http;

	if (options.minSsl) {
		soptions.minVersion = options.minSsl;
	}
	if (options.maxSsl) {
		soptions.maxVersion = options.maxSsl;
	}
	if (is_https) {
		soptions.agent = new https.Agent(soptions);
	}

	if (method == 'POST') {
		soptions.headers['Content-Length'] = post_data ? buffer.byteLength(post_data) : 0;
	}

	var ok = false;

	function error(err: any) {
		if (!ok) {
			ok = true;
			reject(Error.new(err));
		}
	}

	var req = lib.request(soptions, async (res: any)=> {

		if (options.onReady) {
			try {
				await options.onReady(res.statusCode, res.headers);
			} catch(err) {
				error(err);
				req.abort();
				return;
			}
		}

		function end() {
			if (!ok) {
				ok = true;
				// console.log('No more data in response.');
				// console.log('---requestNode', data + '');
				resolve({
					data: buffer.concat(buffers),
					headers: res.headers,
					statusCode: res.statusCode,
					httpVersion: res.httpVersion,
					requestHeaders: soptions.headers,
					requestData: options.params as any,
					cached: false,
				});
			}
		}
		// console.log(`STATUS: ${res.statusCode}`);
		// console.log(`HEADERS: ${JSON.stringify(res.headers)}`);
		// res.setEncoding('utf8');
		var limitDataSize = 0;
		var buffers: Buffer[] = [];
		res.on('data', (chunk: Buffer)=> {
			// console.log(`BODY: ${chunk}`);
			if (options.limitDataSize) {
				limitDataSize += chunk.length;
				if (limitDataSize > options.limitDataSize) {
					error(errno.ERR_REQUEST_LIMIT_DATA_SIZE);
					req.abort();
					return;
				}
			}
			buffers.push(chunk);
		});
		res.on('error', (e:any)=>error(e));
		res.on('end', ()=>end());
		res.on('close', ()=>end());
		res.socket.on('error', (e:any)=>error(e));
		res.socket.on('end', ()=>end());
		res.socket.on('close', ()=>end());
	});

	req.on('abort', ()=>error(errno.ERR_HTTP_REQUEST_ABORT));
	req.on('error', (e:any)=>error(e));
	req.on('timeout', ()=>{
		error(errno.ERR_HTTP_REQUEST_TIMEOUT);
		req.abort();
	});

	// write data to request body
	if (method == 'POST') {
		if (post_data)
			req.write(post_data);
	}

	req.end();
}

// request implementation
var _request_platform = 
	haveFlare ? requestFlare:
	haveWeb ? requestWeb:
	haveNode ? requestNode:
	utils.unrealized;

/**
 * @class Signer
 */
export interface Signer {
	sign(path: string, data: string): Dict<string> | Promise<Dict<string>>;
}

/**
 * @func request
 */
export function request(pathname: string, opts?: Options): PromiseResult<IBuffer> {
	var options = Object.assign({}, defaultOptions, opts);
	var { params, method, signer } = options;

	return utils.promise<Result<IBuffer>>(async (resolve, reject)=> {
		var uri = new url.URL(pathname);
		var is_https = uri.protocol == 'https:';
		var hostname = uri.hostname;
		var port = Number(uri.port) || (is_https ? 443: 80);
		var path = uri.path;
		uri.clearHash();

		var headers: Dict<string> = {
			'Host': uri.port ? hostname + ':' + port: hostname,
			'User-Agent': options.userAgent as string,
			'Accept': 'application/json',
			...options.headers,
		};

		var post_data: string | null = null;

		if (method == 'POST') {
			if (options.urlencoded || options.dataType == 'urlencoded') {
				headers['Content-Type'] = 'application/x-www-form-urlencoded';
				if (params) {
					post_data = querystringStringify(params);
				}
			} else if (options.dataType == 'xml') {
				headers['Content-Type'] = 'application/xml';
				if (params) {
					if (typeof params == 'string') {
						post_data = params;
					} else {
						post_data = stringifyXml(params);
					}
				}
			} else {
				headers['Content-Type'] = 'application/json';
				if (params) {
					post_data = JSON.stringify(params);
				}
			}
		} else {
			if (params) {
				uri.params = Object.assign(uri.params, params);
			}
		}

		var path = uri.path;

		if (signer) {
			Object.assign(headers, await signer.sign(path, post_data ? post_data: ''));
		}

		if (utils.config.moreLog) {
			var logs = [
				"'" + uri.href + "'",
				'-X ' + method,
				...(Object.entries(headers).map(([k,v])=>`-H '${k}: ${v}'`)),
				...(post_data? [`-d '${post_data}'`]: []),
			];
			console.log('curl', logs.join(' \\\n'));
		}

		var GLOBAL_PROXY = process.env.HTTP_PROXY || process.env.http_proxy;
		var proxy = options.proxy || GLOBAL_PROXY;

		if (proxy && (!haveWeb || proxy != GLOBAL_PROXY)) {
			// set proxy
			if (/^https?:\/\//.test(proxy)) {
				var proxyUrl = new url.URL(proxy);
				is_https = proxyUrl.protocol == 'https:';
				hostname = proxyUrl.hostname;
				port = Number(proxyUrl.port) || (is_https ? 443: 80);
				path = uri.href;
			}
		}

		var timeout = Number( options.timeout || '' );
		var send_options = {
			hostname,
			host: hostname,
			port,
			path,
			method,
			headers,
			rejectUnauthorized: false,
			timeout: timeout > -1 ? timeout: defaultOptions.timeout,
		};

		_request_platform(options, send_options, resolve, reject, is_https, method, post_data);
	});
}

interface CacheValue {
	data: Result;
	time: number;
	timeend: number;
}

/**
 * @class Cache
 */
class Cache {

	private _getscache: Dict<CacheValue> = {};

	has(key: string) {
		return key in this._getscache;
	}

	get(key: string) {
		var d = this._getscache[key];
		if (d) {
			if (d.timeend > Date.now()) {
				return d;
			}
			delete this._getscache[key]
		}
	}

	set(key: string, data: Result, cacheTiem: number) {
		this._getscache[key] = {
			data: data,
			time: cacheTiem,
			timeend: cacheTiem + Date.now(),
		}
	}

}

export function parseJSON(json: string): any {
	var res = JSON.parse(json, function(key, value) {
		// 2019-05-09T00:00:00.000Z
		if (typeof value == 'string' && value[10] == 'T' && value[23] == 'Z') {
			return new Date(value);
		}
		return value;
	});
	return res;
}

/**
 * @class Request
 */
export class Request {
	private m_user_agent: string;
	private m_prefix: string;
	private m_data_type: string = 'urlencoded';
	private m_cache = new Cache();
	private m_timeout = defaultOptions.timeout;
	private m_signer?: Signer;
	private m_cur_reqs = new Set<number>();
	private m_no_repeat = false;

	constructor(prefix: string) {
		this.m_user_agent = user_agent;
		this.m_prefix = prefix || utils.config.web_service;

		if (!this.m_prefix) {
			if (haveWeb) {
				this.m_prefix = location.origin;
			} else {
				this.m_prefix = 'http://localhost';
			}
		}
	}

	get userAgent() { return this.m_user_agent }
	set userAgent(v) { this.m_user_agent = v }
	get urlencoded() { return this.m_data_type == 'urlencoded' }
	set urlencoded(v) { this.m_data_type = v ? 'urlencoded': 'json' }
	get dataType() { return this.m_data_type }
	set dataType(v) { this.m_data_type = v }
	get prefix() { return this.m_prefix }
	set prefix(v) { this.m_prefix = v }
	get timeout() { return this.m_timeout }
	set timeout(value) { this.m_timeout = value }
	get noRepeat() { return this.m_no_repeat }
	set noRepeat(value: boolean) { this.m_no_repeat = value }

	get signer() {
		return this.m_signer || null;
	}

	set signer(value) {
		this.m_signer = value ? value: undefined;
	}

	/**
	 * @func getRequestHeaders
	 */
	getRequestHeaders(): Dict {
		return {};
	}

	parseResponseData(buf: IBuffer, result: Result) {
		return buf;
	}

	protected rawRequest(url: string, opts: Options) {
		return request(url, opts);
	}

	private async __request<T>(name: string, method: string, params?: Params, options?: Options): PromiseResult<T> {
		var opts = options || {};
		var { headers } = opts;
		var url = this.m_prefix + '/' + name;

		headers = Object.assign({}, this.getRequestHeaders(), headers);
		params = params || opts.params;

		var result: Result;

		try {
			result = await this.rawRequest(url, {
				...opts,
				method,
				headers: headers,
				params: params,
				timeout: opts.timeout || this.m_timeout,
				dataType: opts.dataType || this.m_data_type,
				userAgent: opts.userAgent || this.m_user_agent,
				signer: opts.signer || this.m_signer,
			});
		} catch(err: any) {
			err = Error.new(errno.ERR_HTTP_REQUEST_FAIL, err);
			err.url = url;
			err.requestHeaders = headers;
			err.requestData = params;
			throw err;
		}

		try {
			result.data = this.parseResponseData(result.data as IBuffer, result);
		} catch(err: any) {
			err.url = url;
			err.headers = result.headers;
			err.statusCode = result.statusCode;
			err.httpVersion = result.httpVersion;
			err.description = result.data.toString('utf-8');
			err.requestHeaders = headers;
			err.requestData = params;
			throw err;
		}

		return result;
	}

	async request<T = any>(name: string, method: string = 'GET', params?: Params, options?: Options) {
		var opts = options || {};
		var hashCode = [name, method, params].hashCode();

		if ('noRepeat' in opts ? opts.noRepeat: this.m_no_repeat)
			utils.assert(!this.m_cur_reqs.has(hashCode), errno.ERR_REPEAT_REQUEST);

		params = params || opts.params;

		try {
			this.m_cur_reqs.add(hashCode);
			var { cacheTime } = opts;
			var key = String(hashCode);
			var cache = this.m_cache.get(key);
			if (cacheTime) {
				if (cache) {
					return Object.assign({}, cache.data, { cached: true }) as Result<T>;
				}
				var data = await this.__request<T>(name, method, params, opts);
				this.m_cache.set(key, data, cacheTime);
				return data;
			} else {
				var data = await this.__request<T>(name, method, params, opts);
				if (cache) {
					this.m_cache.set(key, data, cache.time);
				}
				return data;
			}
		} finally {
			this.m_cur_reqs.delete(hashCode);
		}
	}

	async get<T = any>(name: string, params?: Params, options?: Options): PromiseResult {
		return this.request<T>(name, 'GET', params, options);
	}

	post<T = any>(name: string, params?: Params, options?: Options) {
		return this.request<T>(name, 'POST', params, options);
	}

	async call<T = any>(name: string, params?: Params, options?: Options) {
		if (params) {
			return (await this.post<T>(name, params, options)).data;
		} else {
			return (await this.get<T>(name, params, options)).data;
		}
	}
}

export default {

	Request: Request,

	/**
	 * @get userAgent
	 */
	get userAgent() { return user_agent },

	/**
	 * @func setShared()
	 */
	setShared(req: Request) {
		shared = req;
	},

	/**
	 * @get shared # default web server
	 */
	get shared() { return shared },

	/**
	 * @func request()
	 */
	request: request,

	/**
	 * @func get()
	 */
	get(url: string, options: Options = {}) {
		return request(url, Object.assign({}, options, { method: 'GET' }));
	},

	/**
	 * @func post()
	 */
	post(url: string, options: Options = {}) {
		return request(url, Object.assign({}, options, { method: 'POST' }));
	},

};
