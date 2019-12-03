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

var utils = require('../../util');
var event = require('../../event');
var { userAgent } = require('../../request');
var url = require('../../url');
var errno = require('../../errno');
var { DataFormater, T_BIND, T_PING, T_PONG, PING_BUFFER, PONG_BUFFER } = require('../data');
var { haveNode, haveWeb } = utils;

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
		sendPingPacket } = require('../parser');
} else {
	throw 'Unimplementation';
}

var KEEP_ALIVE_TIME = 5e4; // 50s

/**
 * @class Conversation 
 */
class Conversation {
	// @private:
	// m_connect: false, // 是否尝试连接中
	// m_is_open: false, // open status
	// m_clients: null, // client list
	// m_default_service: '',
	// m_token: '',
	// m_signer: null,
	// m_isGzip: false,
	// m_last_packet_time: 0,
	// m_overflow: false,

	// @public:
	// onOpen: null,
	// onPing: null,
	// onError: null,
	// onClose: null,
	// m_KEEP_ALIVE_TIME: KEEP_ALIVE_TIME,

	/**
	 * @get token
	 */
	get token() {
		return this.m_token;
	}

	get isGzip() {
		return this.m_isGzip;
	}

	get keepAliveTime() {
		return this.m_KEEP_ALIVE_TIME;
	}

	set keepAliveTime(value) {
		this.m_KEEP_ALIVE_TIME = Math.max(5e3, Number(value) || KEEP_ALIVE_TIME);
		this._keepAlive();
	}

	get lastPacketTime() {
		return this.m_last_packet_time;
	}

	get overflow() {
		return this.m_overflow;
	}

	_keepAlive() {
		this._clearKeepAlive();
		if (this.m_is_open) {
			this.m_IntervalId = setInterval(e=>this.ping(), 
				utils.random(0, Math.floor(this.m_KEEP_ALIVE_TIME / 10)) + this.m_KEEP_ALIVE_TIME);
		}
	}

	_clearKeepAlive() {
		if (this.m_IntervalId) {
			clearInterval(this.m_IntervalId);
			this.m_IntervalId = 0;
		}
	}

	setGzip(value) {
		utils.assert(!this.m_is_open, 'Can only be set before opening');
		this.m_isGzip = !!value;
	}

	/**
	 * @constructor
	 */
	constructor() {
		event.initEvents(this, 'Open', 'Ping', 'Pong', 'Error', 'Close', 'Drain', 'Overflow');
		this.m_connect = false;
		this.m_is_open = false;
		this.m_clients = {};
		this.m_clients_count = 0;
		this.m_token = '';
		this.m_signer = null;
		this.m_isGzip = false;
		this.m_KEEP_ALIVE_TIME = KEEP_ALIVE_TIME;
		this.m_overflow = false;
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
			if (!this.m_default_service)
				this.m_default_service = name;
			this.m_clients_count++;
			if (this.m_is_open) {
				this.sendFormatData({ service: name, type: T_BIND });
			} else {
				utils.nextTick(e=>this.connect()); // 还没有打开连接,下一帧开始尝试连接
			}
		}
	}

	/**
	 * @get clients # 获取绑定的Client列表
	 */
	get clients() {
		return this.m_clients;
	}

	_service(service) {
		return this.m_clients_count == 1 ? undefined: service;
	}

	/*async */_open() {
		utils.assert(!this.m_is_open);
		utils.assert(this.m_connect);
		// await utils.sleep(1e2); // 100ms
		this.m_is_open = true;
		this.m_connect = false;
		this.m_last_packet_time = Date.now();
		this.m_overflow = false;
		this.onOpen.trigger();
		this._keepAlive();
	}

	_error(err) {
		if (this.m_connect)
			this.close();
		utils.nextTick(e=>this.onError.trigger(err));
	}

	/**
	 * @fun connect # connercion server
	 */
	connect() {
		if (!this.m_is_open && !this.m_connect) {
			utils.assert(this.m_default_service, 'connection must bind service'); // 连接必需要绑定服务才能使用
			console.log('Connection..', this.m_url.href, this.m_connect);
			this.m_connect = true;
			this.initialize();
		}
	}

	/**
	 * @fun parse # parser message
	 * @arg packet {String|Buffer}
	 * @arg {Boolean} isText
	 */
	async handlePacket(packet, isText) {
		this.m_last_packet_time = Date.now();
		var data = await DataFormater.parse(packet, isText, this.isGzip);
		if (!data)
			return;
		if (!this.isOpen)
			return console.warn('CLI Conversation.handlePacket, connection close status');

		switch (data.type) {
			case T_PING: // ping Extension protocol 
				this.handlePing();
				break;
			case T_PONG: // pong Extension protocol 
				this.onPong.trigger();
				break;
			default:
				var handle = this.m_clients[data.service || this.m_default_service];
				if (handle) {
					handle.receiveMessage(data).catch(e=>console.error(e));
				} else {
					console.error('Could not find the message handler, '+
												'discarding the message, ' + data.service);
				}
		}
	}

	handlePing() {
		this.m_last_packet_time = Date.now();
		this.send(PONG_BUFFER).catch(console.error);
		this.onPing.trigger();
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
	 * @func sendFormatData
	 */
	async sendFormatData(data) {
		data = new DataFormater(data);
		data = await data.toBuffer(this.isGzip)
		await this.send(data);
	}

	/**
	 * @fun init # init conversation
	 */
	initialize() {}

	/**
	 * @fun close # close conversation connection
	 */
	close() {
		if (this.m_connect) {
			// console.log('**** close conversation connection');
			this.m_connect = false;
		}
		if (this.m_is_open) {
			this.m_is_open = false;
			this.m_token = '';
			this._clearKeepAlive();
			this.onClose.trigger();
			console.log('CLI Conversation Close', this.m_url.href);
		}
	}

	static write(self, api, args) {
		return utils.promise(function(resolve, reject) {
			var ok = api(...args, function(err) {
				if (err) {
					reject(Error.new(err));
				} else {
					resolve();
				}
			});
			if (!ok) {
				if (!self.m_overflow) {
					self.m_overflow = true;
					self.onOverflow.trigger();
				}
			}
		});
	}

	/**
	 * @fun send # send message to server
	 * @arg [data] {Object}
	 */
	send(data) {}

	/**
	 * @func sendPing()
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
		path = path || utils.config.web_service || 'ws://localhost';
		utils.assert(path, 'Server path is not correct');
		path = url.resolve(path);
		this.m_url = new url.URL(path.replace(/^http/, 'ws'));
	}
}

// Web implementation
class WebConversation extends WSConversationBasic {
	// m_req: null,

	setGzip(value) {
		// web disable gzip
	}

	/**
	 * @ovrewrite 
	 */
	initialize() {
		utils.assert(!this.m_req, 'No need to repeat open');

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
			console.log('CLI WebConversation Upgrade', self.m_url.href);

			if (!self.m_connect) {
				self.close(); return;
			}
			// self.m_token = res.headers['session-token'] || '';

			req.onmessage = function(e) {
				var data = e.data;
				if (data instanceof ArrayBuffer) {
					self.handlePacket(new Uint8Array(data), 0);
				} else if (data instanceof Blob && data.arrayBuffer) {
					data.arrayBuffer().then(e=>self.handlePacket(new Uint8Array(e), 0));
				} else { // string
					self.handlePacket(data, 1);
				}
			};

			req.onclose = function(e) {
				self.close();
			};

			self._open();
		};

		req.binaryType = 'arraybuffer';

		req.onerror = function(e) {
			console.log('CLI WebConversation error', self.m_url.href);
			self._error(e);
			self.close();
		};

		console.log('CLI WebConversation init', self.m_url.href, self.m_connect);
	}

	/**
	 * @ovrewrite 
	 */
	close() {
		var req = this.m_req;
		if (req) {
			this.m_req = null;
			try {
				req.close();
			} catch(err) {
				console.error(err);
			}
		}
		super.close();
	}

	/**
	 * @ovrewrite 
	 */
	async send(data) {
		utils.assert(this.isOpen, errno.ERR_CONNECTION_CLOSE_STATUS);
		if (data instanceof ArrayBuffer) {
			this.m_req.send(data);
		} else if (data && data.buffer instanceof ArrayBuffer) {
			this.m_req.send(data.buffer);
		} else { // send json string message
			this.m_req.send(JSON.stringify(data));
		}
	}

	/**
	 * @ovrewrite 
	 */
	async ping() {
		utils.assert(this.isOpen, errno.ERR_CONNECTION_CLOSE_STATUS);
		this.m_req.send(PING_BUFFER);
	}

}

// Node implementation
class NodeConversation extends WSConversationBasic {
	// @private:
	// m_req: null,
	// m_socket: null, // web socket connection

	/** 
	 * @ovrewrite
	 */
	initialize() {
		utils.assert(!this.m_req, 'No need to repeat open');

		this.setGzip(true); // use gzip

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
			'Use-Gzip': this.isGzip ? 'on': 'off',
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
			console.log('CLI NodeConversation Upgrade', self.m_url.href);

			if ( !self.m_connect || !handshakes(res, key) ) {
				socket.end();
				self.close(); return;
			}

			self.m_socket = socket;
			self.m_token = res.headers['session-token'] || '';

			var parser = new PacketParser();

			socket.setNoDelay(true);
			socket.setTimeout(0);
			socket.setKeepAlive(true, KEEP_ALIVE_TIME);

			socket.on('timeout', e=>self.close());
			socket.on('end', e=>self.close());
			socket.on('close', e=>self.close());
			socket.on('data', d=>parser.add(d));
			socket.on('error', e=>(self._error(e),self.close()));
			socket.on('drain', e=>(self.m_overflow = false,self.onDrain.trigger()));

			parser.onText.on(e=>self.handlePacket(e.data, 1));
			parser.onData.on(e=>self.handlePacket(e.data, 0));
			parser.onPing.on(e=>self.handlePing());
			parser.onClose.on(e=>self.close());
			parser.onError.on(e=>(self._error(e.data),self.close()));

			self._open();
		});

		req.on('error', function(e) {
			console.log('CLI NodeConversation error', self.m_url.href);
			self._error(e);
			self.close();
		});
		console.log('CLI NodeConversation init', self.m_url.href, self.m_connect);

		req.end();
	}

	/**
	 * @ovrewrite 
	 */
	close() {
		var socket = this.m_socket;
		if (socket) {
			this.m_socket = null;
			socket.removeAllListeners('timeout');
			socket.removeAllListeners('end');
			socket.removeAllListeners('close');
			socket.removeAllListeners('error');
			socket.removeAllListeners('data');
			socket.removeAllListeners('drain');
			try {
				if (socket.writable)
					socket.end();
			} catch(err) {
				console.error(err);
			}
		} else {
			if (this.m_req) {
				this.m_req.abort();
			}
		}
		this.m_req = null;
		this.m_socket = null;
		super.close();
	}

	_write(api, args) {
		return utils.promise((resolve, reject)=>{
			var ok = api(...args);
			if (ok) {
				
			}
		});
	}

	/**
	 * @ovrewrite
	 */
	send(data) {
		utils.assert(this.isOpen, errno.ERR_CONNECTION_CLOSE_STATUS);
		return Conversation.write(this, sendDataPacket, [this.m_socket, data]);
	}

	/**
	 * @ovrewrite 
	 */
	ping() {
		utils.assert(this.isOpen, errno.ERR_CONNECTION_CLOSE_STATUS);
		return Conversation.write(this, sendPingPacket, [this.m_socket]);
	}

}

/**
 * @class WSConversation
 */
var WSConversation =
	haveWeb ? WebConversation: 
	haveNode ? NodeConversation: utils.unrealized;

module.exports = {
	Conversation,
	WSConversation,
};