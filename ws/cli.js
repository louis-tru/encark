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

var util = require('../util');
var event = require('../event');
var { userAgent } = require('../request');
var { Notification } = require('../event');
var url = require('../url');
var errno = require('../errno');
var {JSON_MARK, isJSON, DataFormater } = require('./json');
var { haveNgui, haveNode, haveWeb } = util;
var JSON_MARK_LENGTH = JSON_MARK.length;

if (haveWeb) {
	var WebSocket = global.WebSocket;
} else if (haveNode) {
	// var net = require('net');
	var http = require('http');
	var https = require('https');
	var Buffer = require('buffer').Buffer;
	var crypto = require('crypto');
	var {
		PacketParser, sendDataPacket,
		sendPingPacket } = require('./parser');
} else {
	throw 'Unimplementation';
}

var KEEP_ALIVE_TIME = 5e4; // 50s
var METHOD_CALL_TIMEOUT = 12e4; // 120s

/**
 * @class Conversation 
 */
class Conversation {
	// @private:
	// m_connect: false, // 是否尝试连接中
	// m_is_open: false, // open status
	// m_clients: null, // client list
	// m_token: '',
	// m_message: null, 
	// m_signer: null,

	// @public:
	// onOpen: null,
	// onMessage: null,
	// onPong: null,
	// onError: null,
	// onClose: null,

	/**
	 * @get token
	 */
	get token() { return this.m_token }

	/**
	 * @constructor
	 */
	constructor() {
		event.initEvents(this, 'Open', 'Message', 'Pong', 'Error', 'Close');
		this.m_connect = false;
		this.m_is_open = false;
		this.m_clients = {};
		this.m_token = '';
		this.m_message = [];
		this.m_signer = null;
		this.onError.on(e=>this.m_connect = false);
	}

	/**
	 * @get isOpen # 获取是否打开连接
	 */
	get isOpen() {
		return this.m_is_open;
	}

	/**
	 * @fun bind # 绑定
	 * @arg client {Client}
	 */
	bind(client) {
		var name = client.name;
		var clients = this.m_clients;
		if (name in clients) {
			throw new Error('No need to repeat binding');
		} else {
			clients[name] = client;
			if (this.m_is_open) {
				this.send(new DataFormater({ service: name, type: 'bind' }));
			}
			else {
				util.nextTick(e=>this.connect()); // 还没有打开连接,下一帧开始尝试连接
			}
		}
	}

	/**
	 * @get clients # 获取绑定的Client列表
	 */
	get clients() {
		return this.m_clients;
	}

	_open() {
		util.assert(!this.m_is_open);
		util.assert(this.m_connect);
		var message = this.m_message;
		this.m_is_open = true;
		this.m_connect = false;
		this.m_message = [];
		this.onOpen.trigger();
		message.forEach(e=>e.cancel||this.send(e));
	}

	_error(err) {
		this.m_connect = false;
		this.onError.trigger(err);
	}

	/**
	 * @fun connect # connercion server
	 */
	connect() {
		if (!this.m_is_open && !this.m_connect) {
			for (var i in this.m_clients) {
				this.m_connect = true;
				this.initialize();
				return;
			}
			// 连接必需要绑定服务才能使用
			throw new Error('connection must bind service');
		}
	}

	/**
	 * @fun parse # parser message
	 * @arg {Number} type    0:String|1:Buffer
	 * @arg packet {String|Buffer}
	 */
	handlePacket(type, packet) {
		var is_json = isJSON(type, packet);
		if (is_json == 2) { // pong
			this.onPong.trigger();
			return;
		}
		this.onMessage.trigger({ type, data: packet });

		if (is_json) { // json text
			try {
				var data = DataFormater.parse( JSON.parse(packet.substr(JSON_MARK_LENGTH)) );
			} catch(err) {
				console.log(err);
				return;
			}
			var client = this.m_clients[data.service];
			if (client) {
				client.receiveMessage(data);
			} else {
				console.error('Could not find the message handler, '+
											'discarding the message, ' + data.service);
			}
		}
	}

	get signer() {
		return this.m_signer;
	}

	set signer(value) {
		this.m_signer = value;
	}

	/**
	 * @rewrite
	 * @func getRequestHeaders
	 */
	getRequestHeaders() {
		return null;
	}

	/**
	 * @fun init # init conversation
	 */
	initialize() {}

	/**
	 * @fun close # close conversation connection
	 */
	close() {
		if (this.m_connect)
			this.m_connect = false;
		if (this.m_is_open) {
			this.m_is_open = false;
			this.m_token = '';
			this.onClose.trigger();
		}
	}

	/**
	 * @fun send # send message to server
	 * @arg [data] {Object}
	 */
	send(data) {}

	/**
	 * @func ping()
	 */
	ping() {}

	// @end
}

/**
 * @class WSConversationBasic
 */
class WSConversationBasic extends Conversation {
	/**
	 * @get url
	 */
	get url() { return this.m_url }

	/**
	 * @constructor
	 * @arg path {String} ws://192.168.1.101:8091/
	 */
	constructor(path) {
		super();
		path = path || util.config.web_service || 'ws://localhost';
		util.assert(path, 'Server path is not correct');
		path = url.resolve(path);
		this.m_url = new url.URL(path.replace(/^http/, 'ws'));
	}
}

// Web implementation
class WebConversation extends WSConversationBasic {
	// m_req: null,

	/**
	 * @ovrewrite 
	 */
	initialize() {
		util.assert(!this.m_req, 'No need to repeat open');

		var self = this;
		var url = this.m_url;
		var bind_services = Object.keys(this.clients).join(',');
		var headers = this.getRequestHeaders() || {};

		if (this.m_signer) {
			Object.assign(headers, this.m_signer.sign(url.path));
		}
		url.setParam('_headers', JSON.stringify(headers));
		url.setParam('bind_services', bind_services);

		var req = this.m_req = new WebSocket(url.href);

		req.onopen = function(e) {
			if (!self.m_connect) {
				self.m_req.close();
				self.close(); return;
			}
			// self.m_token = res.headers['session-token'] || '';

			req.onmessage = function(e) {
				var data = e.data;
				if (data instanceof ArrayBuffer) {
					self.handlePacket(1, data);
				} else { // string
					self.handlePacket(0, data);
				}
			};

			req.onclose = function(e) {
				self.close();
			};

			self._open();
		};

		req.onerror = function(e) {
			self._error(e);
			self.close();
		};
	}

	/**
	 * @ovrewrite 
	 */
	close() {
		this.m_req = null;
		super.close();
	}

	/**
	 * @ovrewrite 
	 */
	send(data) {
		if (this.isOpen) {
			if (data instanceof ArrayBuffer) {
				this.m_req.send(data);
			} else if (data && data.buffer instanceof ArrayBuffer) {
				this.m_req.send(data.buffer);
			} else { // send json string message
				this.m_req.send(JSON_MARK + JSON.stringify(data));
			}
		} else {
			this.m_message.push(data);
			this.connect(); // 尝试连接
		}
	}

	/**
	 * @ovrewrite 
	 */
	ping() {
		if (this.isOpen) {
			this.m_req.send(JSON_MARK);
		} else {
			this.connect(); // 尝试连接
		}
	}

}

// Node implementation
class NodeConversation extends WSConversationBasic {
	// @private:
	// m_req: null,
	// m_socket: null, // web socket connection
	// m_response: null,
	// @public:
	// get response() { return this.m_response }
	// get socket() { return this.m_socket }

	/** 
	 * @ovrewrite 
	 */
	initialize() {
		util.assert(!this.m_req, 'No need to repeat open');

		var self = this;
		var url = this.m_url;
		var bind_services = Object.keys(this.clients).join(',');

		url.setParam('bind_services', bind_services);

		var isSSL = url.protocol == 'wss:';
		var port = url.port || (isSSL ? 443: 80);
		var lib = isSSL ? https: http;
		var path = url.path;
		var origin = '127.0.0.1:' + port;
		var key = Date.now();

		var headers = Object.assign({}, this.getRequestHeaders(), {
			'User-Agent': userAgent,
			'Connection': 'Upgrade',
			'Upgrade': 'websocket',
			'Origin': origin,
			'Sec-Websocket-Origin': origin,
			'Sec-Websocket-Version': 13,
			'Sec-Websocket-Key': key,
		});

		if (this.m_signer) {
			Object.assign(headers, this.m_signer.sign(path));
		}

		var options = {
			hostname: url.hostname,
			port: port,
			path: path,
			headers: headers,
			rejectUnauthorized: false,
		};

		if (isSSL) {
			options.agent = new https.Agent(options);
		}

		var req = this.m_req = lib.request(options);

		function handshakes(res, key) {
			var accept = res.headers['sec-websocket-accept'];
			if (accept) {
				var shasum = crypto.createHash('sha1');
				shasum.update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11');
				key = shasum.digest('base64');
				return key == accept;
			}
			return false;
		}

		req.on('upgrade', function(res, socket, upgradeHead) {
			if ( !self.m_connect || !handshakes(res, key) ) {
				socket.end();
				self.close(); return;
			}
			self.m_response = res;
			self.m_socket = socket;
			self.m_token = res.headers['session-token'] || '';

			var parser = new PacketParser();

			socket.setTimeout(0);
			socket.setKeepAlive(true, KEEP_ALIVE_TIME);

			socket.on('timeout', e=>self.close());
			socket.on('end', e=>self.close());
			socket.on('close', e=>self.close());
			socket.on('data', d=>parser.add(d));
			socket.on('error', function(e) {
				var s = self.m_socket;
				self._error(e);
				self.close();
				if (s)
					s.destroy();
			});

			parser.onText.on(e=>self.handlePacket(0, e.data));
			parser.onData.on(e=>self.handlePacket(1, e.data));
			parser.onPing.on(e=>self.onPong.trigger());
			parser.onClose.on(e=>self.close());
			parser.onError.on(e=>(self._error(e.data),self.close()));

			self._open();
		});

		req.on('error', function(e) {
			self._error(e);
			self.close();
		});

		req.end();
	}
	
	/** 
	 * @ovrewrite 
	 */
	close() {
		var socket = this.m_socket;
		if (socket) {
			this.m_socket = null;
			socket.removeAllListeners('end');
			socket.removeAllListeners('close');
			socket.removeAllListeners('error');
			socket.removeAllListeners('data');
			if (socket.writable)
				socket.end();
			if (!this.isOpen) {
				this._error(Error.new(errno.ERR_REQUEST_AUTH_FAIL));
			}
		} else {
			if (this.m_req) {
				this.m_req.abort();
			}
		}
		this.m_req = null;
		this.m_socket = null;
		this.m_response = null;
		super.close();
	}
	
	/**
	 * @ovrewrite
	 */
	send(data) {
		if (this.isOpen) {
			if (this.m_socket) {
				sendDataPacket(this.m_socket, data);
			} else {
				console.error('cannot call function `this.m_socket`');
			}
		} else {
			this.m_message.push(data);
			this.connect(); // 尝试连接
		}
	}

	/**
	 * @ovrewrite 
	 */
	ping() {
		if (this.isOpen) {
			if (this.m_socket) {
				sendPingPacket(this.m_socket);
			} else {
				console.error('cannot find function `this.m_socket`');
			}
		} else {
			this.connect(); // 尝试连接
		}
	}

}

/**
 * @class WSConversation
 */
var WSConversation =
	haveWeb ? WebConversation: 
	haveNode ? NodeConversation: util.unrealized;

/** 
 * @func call_function()
*/
async function call_function(self, msg) {
	var { data = {}, name, cb } = msg;
	var fn = self[name];
	var hasCallback = false;

	if (self.server.printLog) {
		console.log('Call', `${self.name}.${name}(${JSON.stringify(data, null, 2)})`);
	}

	var callback = function(err, data) {
		if (hasCallback) {
			throw new Error('callback has been completed');
		}
		hasCallback = true;

		if (!cb) return; // No callback

		var rev = new DataFormater({ service: self.name, type: 'cb', cb });

		if (err) {
			rev.error = err; // Error.toJSON(err);
		} else {
			rev.data = data;
		}
		self.conv.send(rev);
	};

	if (name in WSClient.prototype) {
		return callback(Error.new(errno.ERR_FORBIDDEN_ACCESS));
	}
	if (typeof fn != 'function') {
		return callback(Error.new('"{0}" no defined function'.format(name)));
	}

	var err, r;
	try {
		r = await self[name](data);
	} catch(e) {
		err = e;
	}
	callback(err, r);
}

/**
 * @class WSClient
 */
class WSClient extends Notification {
	// @private:
	// m_callbacks: null,
	// m_service_name: '',
	// m_conv: null,   // conversation

	// @public:
	get name() { return this.m_service_name }
	get conv() { return this.m_conv }

	/**
	 * @constructor constructor(service_name, conv)
	 */
	constructor(service_name, conv) {
		super();
		this.m_callbacks = {};
		this.m_service_name = service_name;
		this.m_conv = conv || new WSConversation();

		util.assert(service_name);
		util.assert(this.m_conv);

		conv.onClose.on(async e=>{
			var callbacks = this.m_callbacks;
			this.m_callbacks = {};
			var err = Error.new(errno.ERR_CONNECTION_DISCONNECTION);
			for (var cb in Object.values(callbacks)) {
				// cb.cancel = true;
				cb.err(err);
			}
		});

		this.m_conv.bind(this);
	}

	/**
	 * @func receiveMessage(msg)
	 */
	receiveMessage(msg) {
		if (msg.type == 'call') {
			call_function(this, msg);
		} else if (msg.type == 'cb') {
			var cb = this.m_callbacks[msg.cb];
			delete this.m_callbacks[msg.cb];
			if (cb) {
				if (msg.error) { // throw error
					cb.err(Error.new(msg.error));
				} else {
					cb.ok(msg.data);
				}
			} else {
				console.error('Unable to callback, no callback context can be found');
			}
		} else if (msg.type == 'event') {
			this.trigger(msg.name, msg.data);
		}
	}

	/**
	 * @func call(method, data, timeout)
	 */
	call(method, data, timeout = exports.METHOD_CALL_TIMEOUT) {
		return new Promise((resolve, reject)=>{
			var cb = util.id;
			var timeid = 0;

			var msg = new DataFormater({
				service: this.name,
				type: 'call',
				name: method,
				data: data,
				cb: cb,
				ok: (e)=>{
					if (timeid)
						clearTimeout(timeid);
					resolve(e);
				},
				err: (e)=>{
					if (timeid)
						clearTimeout(timeid);
					reject(e);
				},
			});

			if (timeout) {
				timeid = setTimeout(e=>{
					// console.error(`method call timeout, ${this.name}/${method}`);
					reject(Error.new([...errno.ERR_METHOD_CALL_TIMEOUT,
						`method call timeout, ${this.name}/${method}`]));
					msg.cancel = true;
					delete this.m_callbacks[cb];
				}, timeout);
			}

			this.m_conv.send(msg);
			this.m_callbacks[cb] = msg;
		});
	}

	/**
	 * @func weakCall(method, data) no callback, no return data
	 */
	weakCall(method, data) {
		this.m_conv.send(new DataFormater({
			service: this.name,
			type: 'call', 
			name: method, 
			data: data,
		}));
	}

}

exports = module.exports = {
	METHOD_CALL_TIMEOUT,
	Conversation,
	WSConversation,
	WSClient,
};
