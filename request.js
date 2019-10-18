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
var { haveNgui, haveNode, haveWeb } = util;
var url = require('./url');
var errno = require('./errno');
var default_user_agent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_13_3) \
AppleWebKit/537.36 (KHTML, like Gecko) Chrome/64.0.3282.186 Safari/537.36';

if (haveNgui) {
	var user_agent = default_user_agent;
	var http = requireNative('_http');
} 
else if (haveWeb) {
	var user_agent = navigator.userAgent;
	var XMLHttpRequest = global.XMLHttpRequest;
	var Buffer = class Buffer {
		constructor(arraybuffer, text = '') {
			this.buffer = arraybuffer;
			this.text = text;
		}
		toString(type) {
			return this.text;
		}
	};
} else if (haveNode) {
	var user_agent = default_user_agent;
	var http = require('http');
	var https = require('https');
	var Buffer = require('buffer').Buffer;
} else {
	throw 'Unimplementation';
}

var shared = null;
var __id = 1;

var defaultOptions = {
	method: 'GET',
	params: '',
	headers : {},
	dataType : 'json',
	user_agent : user_agent,
	timeout: 18e4,
};

function stringifyPrimitive(v) {
	if (typeof v === 'string')
		return v;
	if (typeof v === 'number' && isFinite(v))
		return '' + v;
	if (typeof v === 'boolean')
		return v ? 'true' : 'false';
	return '';
}

function querystring_stringify(obj, sep, eq) {
	sep = sep || '&';
	eq = eq || '=';
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

function stringify_xml(obj) {

	var result = ['<xml>'];

	for (var [k,v] of Object.entries(obj)) {
		result.push(`<${k}>`);
		if (v && typeof v == 'object') {
			result.push(`![CDATA[${v}]]`);
		} else {
			result.push(v);
		}
		result.push(`</${k}>`);
	}

	result.push('</xml>');

	return result.join('');
}

var _request_platform = // request implementation

// Ngui implementation
haveNgui ? function(options, soptions, resolve, reject, is_https, method, post_data) {
	var url = is_https ? 'https://': 'http://';
	url += soptions.hostname;
	url += soptions.port != (is_https? 443: 80) ? ':'+soptions.port: '';
	url += soptions.path;

	http.request({
		url: url,
		method: method == 'POST'? http.HTTP_METHOD_POST: http.HTTP_METHOD_GET,
		headers: soptions.headers,
		postData: post_data,
		timeout: soptions.timeout,
		disableCache: true,
		disableSslVerify: true,
	}, function(res) {
		resolve({
			data: res.data,
			headers: res.responseHeaders,
			statusCode: res.statusCode,
			httpVersion: res.httpVersion,
			requestHeaders: soptions.headers,
			requestData: options.params,
		});
	}.catch(err=>{
		reject(err);
	}));
}

: haveWeb ? function(options, soptions, resolve, reject, is_https, method, post_data) {
	var url = is_https ? 'https://': 'http://';
	url += soptions.hostname;
	url += soptions.port != (is_https? 443: 80) ? ':'+soptions.port: '';
	url += soptions.path;
	url += `${soptions.path.indexOf('?')==-1?'?':'&'}_=${__id++}`;

	var xhr = new XMLHttpRequest();
	xhr.open(method, url, true);
	//xhr.responseType = 'arraybuffer';
	xhr.responseType = 'text';
	xhr.timeout = soptions.timeout;

	delete soptions.headers['User-Agent'];

	for (var key in soptions.headers) {
		xhr.setRequestHeader(key, soptions.headers[key]);
	}
	xhr.onload = ()=>{
		resolve({
			data: new Buffer(/*xhr.response*/null, xhr.responseText),
			headers: xhr.getAllResponseHeaders(),
			statusCode: xhr.status,
			httpVersion: '1.1',
			requestHeaders: soptions.headers,
			requestData: options.params,
		});
	};
	xhr.onerror = (e)=>{
		var err = Error.new(e.message);
		reject(err);
	};
	xhr.ontimeout = e=>{
		reject(Error.new(errno.ERR_HTTP_REQUEST_TIMEOUT));
	};
	xhr.send(post_data);
}

// Node implementation
: haveNode ? function(options, soptions, resolve, reject, is_https, method, post_data) {

	var lib = is_https ? https: http;

	if (is_https) {
		soptions.agent = new https.Agent(soptions);
	}

	if (method == 'POST') {
		soptions.headers['Content-Length'] = post_data ? Buffer.byteLength(post_data) : 0;
	}

	var req = lib.request(soptions, (res)=> {
		// console.log(`STATUS: ${res.statusCode}`);
		// console.log(`HEADERS: ${JSON.stringify(res.headers)}`);
		// res.setEncoding('utf8');
		var data = null;
		res.on('data', (chunk)=> {
			// console.log(`BODY: ${chunk}`);
			if (data) {
				data = Buffer.concat([data, chunk]);
			} else {
				data = chunk;
			}
		});
		res.on('end', ()=> {
			// console.log('No more data in response.');
			resolve({
				data: data,
				headers: res.headers,
				statusCode: res.statusCode,
				httpVersion: res.httpVersion,
				requestHeaders: soptions.headers,
				requestData: options.params,
			});
		});
	});

	req.on('abort', e=>console.log('request abort'));
	req.on('error', (e)=>reject(e));
	req.on('timeout', e=>{
		reject(Error.new(errno.ERR_HTTP_REQUEST_TIMEOUT));
		req.abort();
	});

	// write data to request body
	if (method == 'POST') {
		if (post_data)
			req.write(post_data);
	}

	req.end();
}

// Web implementation
: util.unrealized;

/**
 * @class Signer
 */
class Signer {

	constructor(host) {
		this.m_host = host
	}

	get host() {
		return this.m_host;
	}

	sign(path, data_str = null) { /* subclass rewrite */ }
}

/**
 * @func request
 */
function request(pathname, options) {
	options = Object.assign({}, defaultOptions, options);
	var { params, method, timeout, headers = {}, signer } = options;

	if (util.dev) {
		var data = [];
		if (params) {
			if (method == 'GET') {
				pathname += '?' + querystring_stringify(params);
			} else {
				data = [`-d '${JSON.stringify(params)}'`];
			}
		}
		var logs = [
			"'" + pathname + "'",
			'-X ' + method,
			...(method == 'POST' ? ["-H 'Content-Type: application/json'"]: []),
			...(Object.entries(headers).map(([k,v])=>`-H '${k}: ${v}'`)),
			...data,
		];
		console.log('curl', logs.join(' \\\n'));
	}

	return new Promise((resolve, reject)=> {
		var uri = new url.URL(pathname);
		var is_https = uri.protocol == 'https:';
		var hostname = uri.hostname;
		var port = Number(uri.port) || (is_https ? 443: 80);
		var raw_path = uri.path;
		var path = raw_path;

		var headers = {
			'User-Agent': options.user_agent,
			'Accept': 'application/json',
		};
		Object.assign(headers, options.headers);

		var post_data = null;

		if (!haveWeb) {
			// set proxy
			var proxy = process.env.HTTP_PROXY || process.env.http_proxy;
			if (proxy && /^https?:\/\//.test(proxy)) {
				proxy = new url.URL(proxy);
				is_https = proxy.protocol == 'https:';
				hostname = proxy.hostname;
				port = Number(proxy.port) || (is_https ? 443: 80);
				path = pathname;
				// set headers
				headers.host = uri.hostname;
				if (uri.port) {
					headers.host += ':' + uri.port;
				}
			}
		}

		if (method == 'POST') {
			if (options.urlencoded || options.dataType == 'urlencoded') {
				headers['Content-Type'] = 'application/x-www-form-urlencoded';
				if (params) {
					post_data = querystring_stringify(params);
				}
			} else if (options.dataType == 'xml') {
				headers['Content-Type'] = 'application/xml';
				if (params) {
					if (typeof params == 'string') {
						post_data = params;
					} else {
						post_data = stringify_xml(params);
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
				path += (uri.search ? '&' : '?') + querystring_stringify(params);
			}
		}

		if (signer) {
			Object.assign(headers, signer.sign(raw_path, post_data));
		}

		timeout = parseInt(timeout);

		var send_options = {
			hostname,
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

/**
 * @class Cache
 */
class Cache {

	constructor() {
		this.m_getscache = {};
	}

	has(key) {
		return name in this.m_getscache;
	}

	get(key) {
		var i = this.m_getscache[key];
		return i ? i : null;
	}

	set(key, data, cacheTiem) {
		var i = this.m_getscache[key];
		if (i) {
			var id = i.timeoutid;
			if (id) {
				clearTimeout(id);
			}
		}
		this.m_getscache[key] = {
			data: data,
			time: cacheTiem,
			timeoutid: cacheTiem ? setTimeout(e=>{
				delete this.m_getscache[key];
			}, cacheTiem): 0,
		}
	}

	static hash(object) {
		return util.hash(JSON.stringify(object));
	}

}

function parseJSON(json) {
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
class Request {

	constructor(serverURL, mock, mockSwitch) {
		this.m_user_agent = user_agent;
		this.m_server_url = serverURL || util.config.web_service;
		this.m_mock = mock || {};
		this.m_mock_switch = mockSwitch;
		this.m_data_type = 'urlencoded';
		this.m_enable_strict_response_data = true;
		this.m_cache = new Cache();
		this.m_timeout = defaultOptions.timeout;
		this.m_signer = null;

		if (!this.m_server_url) {
			if (haveWeb) {
				this.m_server_url = location.origin;
			} else {
				this.m_server_url = 'http://localhost';
			}
		}
	}

	get userAgent() { return this.m_user_agent }
	set userAgent(v) { this.m_user_agent = v }
	get urlencoded() { return this.m_data_type == 'urlencoded' }
	set urlencoded(v) { this.m_data_type = v ? 'urlencoded': 'json' }
	get dataType() { return this.m_data_type }
	set dataType(v) { this.m_data_type = v }
	get serverURL() { return this.m_server_url }
	set serverURL(v) { this.m_server_url = v }
	get mock() { return this.m_mock }
	set mock(v) { this.m_mock = v }
	get mockSwitch() { return this.m_mock_switch }
	set mockSwitch(v) { this.m_mock_switch = v }
	get strictResponseData() { return this.m_enable_strict_response_data }
	set strictResponseData(value) { this.m_enable_strict_response_data = value }
	get timeout() { return this.m_timeout }
	set timeout(value) { this.m_timeout = value }

	get signer() {
		return this.m_signer;
	}

	set signer(value) {
		this.m_signer = value;
	}

	/**
	 * @func getRequestHeaders
	 */
	getRequestHeaders() {
		return null;
	}

	parseResponseData(buf) {
		var json = buf.toString('utf8');
		var res = parseJSON(json);
		if (this.m_enable_strict_response_data) {
			if (res.code === 0) {
				return res.data;
			} else {
				throw Error.new(res, res.code);
			}
		} else {
			return res;
		}
	}

	async request(name, method = 'GET', params = '', options = {}) {
		if (this.m_mock[name] && (!this.m_mock_switch || this.m_mock_switch[name])) {
			return { data: Object.create(this.m_mock[name]) };
		} else {
			var { headers, timeout, signer = this.m_signer } = options || {};
			var url = this.m_server_url + '/' + name;

			headers = Object.assign({}, this.getRequestHeaders(), headers);

			var result = await request(url, {
				method,
				params,
				headers,
				timeout: timeout || this.m_timeout,
				dataType: this.m_data_type,
				user_agent: this.m_user_agent,
				signer: signer,
			});
			try {
				result.data = this.parseResponseData(result.data);
				return result;
			} catch(err) {
				err.url = url;
				err.headers = result.headers;
				err.statusCode = result.statusCode;
				err.httpVersion = result.httpVersion;
				err.description = result.data.toString('utf-8');
				err.requestHeaders = headers;
				err.requestData = params;
				throw err;
			}
		}
	}

	async get(name, params, options) {
		var { cacheTime } = options || {};
		var key = Cache.hash({ name: name, params: params });
		var cache = this.m_cache.get(key);
		if (cacheTime) {
			if (cache) {
				return Object.assign({}, cache.data, { cached: true });
			}
			var data = await this.request(name, 'GET', params, options);
			this.m_cache.set(key, data, cacheTime);
			return data;
		} else {
			var data = await this.request(name, 'GET', params, options);
			if (cache) {
				this.m_cache.set(key, data, cache.time);
			}
			return data;
		}
	}

	post(name, params, options) {
		return this.request(name, 'POST', params, options);
	}
	
	call(name, params, options) {
		if (params) {
			return this.post(name, params, options);
		} else {
			return this.get(name, params, options);
		}
	}
}

module.exports = {

	Signer: Signer,

	Request: Request,

	parseJSON: parseJSON,

	/**
	 * @func querystringStringify()
	 */
	querystringStringify: querystring_stringify,

	/**
	 * @get userAgent
	 */
	get userAgent() { return user_agent },

	/**
	 * @func setShared()
	 */
	setShared: function(req) {
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
	get: function(url, options) {
		return request(url, Object.assign({}, options, { method: 'GET' }));
	},

	/**
	 * @func post()
	 */
	post: function(url, options) {
		return request(url, Object.assign({}, options, { method: 'POST' }));
	},

};
