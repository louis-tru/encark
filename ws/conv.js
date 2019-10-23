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

var utils = require('./util');
var event = require('./event');
var url = require('url');
var service = require('./service');
var {Buffer} = require('buffer');
var {isJSON,JSON_MARK} = require('./json');
var JSON_MARK_LENGTH = JSON_MARK.length;

// 绑定服务
async function bind_services(self, bind_services) {
	utils.assert(bind_services[0], 'service undefined');

	for (var name of bind_services) {
		var cls = service.get(name);

		utils.assert(cls, name + ' not found');
		utils.assert(utils.equalsClass(service.WSService, cls), name + ' Service type is not correct');
		utils.assert(!(name in self.m_services), 'Service no need to repeat binding');

		var ser = new cls(self);
		ser.name = name;
		utils.assert(await ser.requestAuth(null), 'request auth fail');
		self.m_services[name] = ser;

		utils.nextTick(e=>ser.loaded());
	}
}

/**
 * @class Conversation
 */
var Conversation = utils.class('Conversation', {

	m_isOpen: false,
	m_services: null,

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

	// @event:
	onMessage: null,
	onPing: null,
	onClose: null,
	onOpen: null,

	/**
	 * @param {http.ServerRequest}   req
	 * @param {String}   bind_services
	 * @constructor
	 */
	constructor: function(req, bind_services_name) {
		event.initEvents(this, 'Open', 'Message', 'Ping', 'Close');

		this.server = req.socket.server.wrap;
		this.request = req;
		this.socket = req.socket;
		this.token = utils.hash(utils.id + this.server.host + '');
		this.m_services = {};
		var self = this;

		// initialize
		utils.nextTick(function() {
			bind_services(self, bind_services_name.split(',')).then(function() {
				if (!self.initialize())
					return self.socket.destroy();  // 关闭连接

				utils.assert(!self.m_isOpen);
				self.server.m_ws_conversations[self.token] = self;
				self.m_isOpen = true;

				self.onClose.once(function() {
					utils.assert(self.m_isOpen);
					delete self.server.m_ws_conversations[self.token];
					self.m_isOpen = false;
					self.request = null;
					self.socket = null;
					self.token = '';
					self.onOpen.off();
					self.onMessage.off();
					// self.onError.off();
					try {
						for (var s of Object.values(self.m_services))
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
			}).catch(function() {
				self.socket.destroy();  // 关闭连接
				console.error(e);
			});
		});
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
		return this.m_services;
	},

	/**
	 * @func handlePacket() 进一步解析数据
	 * @arg {Number} type    0:String|1:Buffer
	 * @arg {String|Buffer} packet
	 */
	handlePacket: function(type, packet) {
		var is_json = isJSON(type, packet);
		if (is_json == 2) { // ping, browser web socket 
			this.onPing.trigger();
			return;
		}

		this.onMessage.trigger({ type, data: packet });

		if (is_json) { // json text
			try {
				var data = JSON.parse(packet.substr(JSON_MARK_LENGTH));
			} catch(err) {
				console.error(err);
				return;
			}

			if (data.t == 'bind_service') { // 绑定服务消息
				bind_services(this, [data.n]).catch(console.error);
			} else {
				var service = this.m_services[data.s];
				if (service) {
					service.receiveMessage(data);
				} else {
					console.error('Could not find the message handler, '+
												'discarding the message, ' + data.s);
				}
			}
		}
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
	 * @func pong()
	 */
	pong: function() {},

	/**
	 * close the connection
	 */
	close: function () {},

	// @end
});

exports.Conversation = Conversation;
