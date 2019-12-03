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

var utils = require('../util');
var event = require('../event');
var url = require('url');
var service = require('../service');
var {WSService} = require('./service');
var {Buffer} = require('buffer');
var crypto = require('crypto');
var uuid = require('../hash/uuid');
var errno = require('../errno');
var { Conversation: _Conversation } = require('./cli/conv');
var { PacketParser, sendDataPacket, sendPingPacket } = require('./parser');
var {DataFormater, T_BIND, T_PING, T_PONG, PONG_BUFFER } = require('./data');
var KEEP_ALIVE_TIME = 5e4; // 50s

/**
 * @class Conversation
 */
var Conversation = utils.class('Conversation', {

	m_isOpen: false,
	m_services: null,
	m_default_service: '',
	m_services_count: 0,
	m_last_packet_time: 0,
	m_KEEP_ALIVE_TIME: KEEP_ALIVE_TIME,

	/**
	 * @field server {Server}
	 */
	server: null,
	
	/**
	 * @field request {http.ServerRequest}
	 */
	request: null,
	
	/**
	 * @field socket 
	 */
	socket: null,

	/**
	 * @field token {Number}
	 */
	token: '',

	isGzip: false,

	// @event:
	onPing: null,
	onClose: null,
	onOpen: null,
	onDrain: null,
	onOverflow: null,

	get lastPacketTime() {
		return this.m_last_packet_time;
	},

	get keepAliveTime() {
		return this.m_KEEP_ALIVE_TIME;
	},

	set keepAliveTime(value) {
		this.m_KEEP_ALIVE_TIME = Math.max(5e3, Number(value) || KEEP_ALIVE_TIME);
	},

	get overflow() {
		return this.m_overflow;
	},

	/**
	 * @param {http.ServerRequest}   req
	 * @param {String}   bind_services
	 * @constructor
	 */
	constructor: function(req, bind_services) {
		event.initEvents(this, 'Open', 'Ping', 'Pong', 'Close', 'Drain', 'Overflow');

		this.server = req.socket.server.wrap;
		this.request = req;
		this.socket = req.socket;
		this.token = uuid();
		this.m_services = {};
		this.m_services_count = 0;
		this.m_overflow = false;

		var self = this;

		// initialize
		self._initialize(bind_services).catch(err=>{
			self.close();
			self._safeDestroy();  // 关闭连接
			// console.warn(err);
		});
	},

	_safeDestroy: function() {
		try {
			if (this.socket)
				this.socket.destroy();  // 关闭连接
		} catch(err) {
			console.warn(err);
		}
	},

	_initialize: async function(bind_services) {
		var self = this;
		var services = bind_services.split(',');
		utils.assert(services[0], 'Bind Service undefined');

		self.socket.pause();

		if (!self.initialize())
			return self._safeDestroy();  // 关闭连接

		utils.assert(!self.m_isOpen);
		self.server.m_ws_conversations[self.token] = self; // TODO private visit
		self.m_isOpen = true;
		self.m_last_packet_time = Date.now();
		self.m_overflow = false;

		self.onClose.on(function() {
			utils.assert(self.m_isOpen);

			console.log('WS conv close');
			delete self.server.m_ws_conversations[self.token]; // private visit

			self.m_isOpen = false;
			self.request = null;
			self.socket = null;
			self.token = '';
			// self.onOpen.off();

			try {
				for (var s of Object.values(self.m_services))
					if (s.loaded) 
						s.destroy();
				self.server.trigger('WSConversationClose', self);
			} catch(err) {
				console.error(err);
			}
			self.server = null;
			utils.nextTick(e=>self.onClose.off());
		});

		self.onOpen.trigger();
		self.server.trigger('WSConversationOpen', self);

		try {
			await self._bind(services);
		} catch(err) {
			await utils.sleep(1e3); // delay 1s
			throw err;
		}
		self.socket.resume();
	},

	/** 
	 * @func _bind() 绑定服务
	*/
	_bind: async function(services) {
		var self = this;
		for (var name of services) {
			var cls = service.get(name);
			utils.assert(cls, name + ' not found');
			utils.assert(utils.equalsClass(WSService, cls), name + ' Service type is not correct');
			utils.assert(!(name in self.m_services), 'Service no need to repeat binding');

			var ser;
			ser = new cls(self);
			ser.name = name;
			utils.assert(await ser.requestAuth(null), errno.ERR_REQUEST_AUTH_FAIL);
			self.m_services[name] = ser;
			self.m_services_count++;

			if (!self.m_default_service) {
				self.m_default_service = name;
				self.isGzip = ser.headers['use-gzip'] == 'on';
			}

			await ser.load();
			ser.m_loaded = true; // TODO ptinate visit
			await utils.sleep(200); // TODO 在同一个node进程中同时开启多个服务时socket无法写入
			ser._trigger('Load', {token:this.token}).catch(e=>console.error(e));
			console.log('SER Load', this.request.url);
		}
	},

	_service: function(service) {
		return this.m_services_count == 1 ? undefined: service;
	},

	/**
	 * 是否已经打开
	 */
	get isOpen() {
		return this.m_isOpen;
	},

	/**
	 * verifies the origin of a request.
	 * @param  {String} origin
	 * @return {Boolean}
	 */
	verifyOrigin: function(origin) {
		var origins = this.server.origins;
		if (origin == 'null') {
			origin = '*';
		}
		if (origins.indexOf('*:*') != -1) {
			return true;
		}
		if (origin) {
			try {
				var parts = url.parse(origin);
				var ok =
					~origins.indexOf(parts.hostname + ':' + parts.port) ||
					~origins.indexOf(parts.hostname + ':*') ||
					~origins.indexOf('*:' + parts.port);
				if (!ok) {
					console.warn('illegal origin: ' + origin);
				}
				return ok;
			}
			catch (ex) {
				console.warn('error parsing origin');
			}
		} else {
			console.warn('origin missing from websocket call, yet required by config');
		}
		return false;
	},

	/**
	 * 获取绑定的服务
	 */
	get wsServices() {
		return {...this.m_services};
	},

	/**
	 * @func handlePacket() 进一步解析数据
	 * @arg {String|Buffer} packet
	 * @arg {Boolean} isText
	 */
	handlePacket: async function(packet, isText) {
		this.m_last_packet_time = Date.now();
		var data = await DataFormater.parse(packet, isText, this.isGzip);
		if (!data)
			return;
		if (!this.isOpen)
			return console.warn('SER Conversation.handlePacket, connection close status');

		switch (data.type) {
			case T_BIND:
				this._bind([data.service]).catch(console.warn);
				break;
			case T_PING: // ping Extension protocol 
				this.handlePing();
				break;
			case T_PONG: // pong Extension protocol 
				this.onPong.trigger();
				break;
			default:
				var handle = this.m_services[data.service || this.m_default_service];
				if (handle) {
					handle.receiveMessage(data).catch(e=>console.error(e));
				} else {
					console.error('Could not find the message handler, '+
												'discarding the message, ' + data.service);
				}
		}
	},

	handlePing: function() {
		this.m_last_packet_time = Date.now();
		this.send(PONG_BUFFER).catch(console.error);;
		this.onPing.trigger();
	},

	/**
	 * @func sendFormatData
	 */
	sendFormatData: async function(data) {
		data = new DataFormater(data);
		data = await data.toBuffer(this.isGzip);
		await this.send(data);
	},

	/**
	 * open Conversation
	 */
	initialize: function() {},

	/**
	 * send message to client
	 * @arg {Object} data
	 */
	send: function(data) {},

	/**
	 * @func ping()
	 */
	ping: function() {},

	/**
	 * close the connection
	 */
	close: function () {},

	// @end
});

/**
 * @class Hybi
 */
class Hybi extends Conversation {

	constructor(req, upgradeHead, bind_services) {
		super(req, bind_services);
	}

	/**
	 * @func _handshakes()
	 */
	_handshakes() {
		var req = this.request;
		var key = req.headers['sec-websocket-key'];
		var origin = req.headers['sec-websocket-origin'];
		// var location = (socket.encrypted ? 'wss' : 'ws') + '://' + req.headers.host + req.url;
		var upgrade = req.headers.upgrade;

		if (!upgrade || upgrade.toLowerCase() !== 'websocket') {
			console.error('connection invalid');
			return false;
		}
		
		if (!this.verifyOrigin(origin)) {
			console.error('connection invalid: origin mismatch');
			return false;
		}

		if (!key) {
			console.error('connection invalid: received no key');
			return false;
		}

		try {
			this._upgrade();
		} catch(err) {
			console.error(err);
			return false;
		}

		return true;
	}

	_upgrade() {
		// calc key
		var key = this.request.headers['sec-websocket-key'];
		var shasum = crypto.createHash('sha1');
		shasum.update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11');
		key = shasum.digest('base64');
		var headers = [
			'HTTP/1.1 101 Switching Protocols',
			'Upgrade: websocket',
			'Connection: Upgrade',
			'Session-Token: ' + this.token,
			'Sec-WebSocket-Accept: ' + key,
		];
		this.socket.write(headers.concat('', '').join('\r\n'));
	}

	/**
	 * @overwrite
	 */
	initialize() {
		if (!this._handshakes()) {
			return false;
		}
		var self = this;
		var socket = this.socket;
		var parser = new PacketParser();

		socket.setNoDelay(true);
		socket.setTimeout(0);
		socket.setKeepAlive(true, KEEP_ALIVE_TIME);

		socket.on('timeout', e=>self.close());
		socket.on('end', e=>self.close());
		socket.on('close', e=>self.close());
		socket.on('data', e=>parser.add(e));
		socket.on('error', e=>(console.error('web socket error:',e),self.close()));
		socket.on('drain', e=>(self.m_overflow = false,self.onDrain.trigger()));

		parser.onText.on(e=>self.handlePacket(e.data, 1/*isText*/));
		parser.onData.on(e=>self.handlePacket(e.data, 0));
		parser.onPing.on(e=>self.handlePing());
		parser.onClose.on(e=>self.close());
		parser.onError.on(e=>(console.error('web socket parser error:',e.data),self.close()));

		return true;
	}

	/**
	 * @overwrite
	 */
	send(data) {
		utils.assert(this.isOpen, errno.ERR_CONNECTION_CLOSE_STATUS);
		return _Conversation.write(this, sendDataPacket, [this.socket, data]);
	}

	/**
	 * @overwrite
	 */
	ping() {
		utils.assert(this.isOpen, errno.ERR_CONNECTION_CLOSE_STATUS);
		return _Conversation.write(this, sendPingPacket, [this.socket]);
	}

	/**
	 * @overwrite
	 */
	close () {
		if (this.isOpen) {
			var socket = this.socket;
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
			this.onClose.trigger();
			console.log('Hybi Conversation Close');
		}
	}

}

module.exports = {
	PacketParser,
	Conversation,
	Hybi,
};
