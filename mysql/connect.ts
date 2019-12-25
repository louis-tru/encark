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
var parser = require('./parser');
var constants = require('./constants');
var auth = require('./auth');
var OutgoingPacket = require('./outgoing_packet').OutgoingPacket;
var Buffer = require('buffer').Buffer;
var Socket = require('net').Socket;

var CONNECT_TIMEOUT = 1e4;
var connect_pool = {};
var require_connect = [];
var { Parser, GREETING_PACKET, USE_OLD_PASSWORD_PROTOCOL_PACKET, ERROR_PACKET, } = parser;

function write(self, packet) {
	self._socket.write(packet.buffer);
}

function sendAuth(self, greeting) {
	var opt = self.opt;
	var token = auth.token(opt.password, greeting.scrambleBuffer);
	var packetSize = (
		4 + 4 + 1 + 23 +
		opt.user.length + 1 +
		token.length + 1 +
		opt.database.length + 1
	);
	var packet = new OutgoingPacket(packetSize, greeting.number + 1);

	packet.writeNumber(4, exports.DEFAULT_FLAGS);
	packet.writeNumber(4, exports.MAX_PACKET_SIZE);
	packet.writeNumber(1, exports.CHAREST_NUMBER);
	packet.writeFiller(23);
	packet.writeNullTerminated(opt.user);
	packet.writeLengthCoded(token);
	packet.writeNullTerminated(opt.database);

	write(self, packet);

	// Keep a reference to the greeting packet. We might receive a
	// USE_OLD_PASSWORD_PROTOCOL_PACKET as a response, in which case we will need
	// the greeting packet again. See sendOldAuth()
	self._greeting = greeting;
}

function sendOldAuth(self, greeting) {
	var token = auth.scramble323(greeting.scrambleBuffer, self.opt.password);
	var packetSize = (token.length + 1);

	var packet = new OutgoingPacket(packetSize, greeting.number + 3);

	// I could not find any official documentation for this, but from sniffing
	// the mysql command line client, I think this is the right way to send the
	// scrambled token after receiving the USE_OLD_PASSWORD_PROTOCOL_PACKET.
	packet.write(token);
	packet.writeFiller(1);

	write(self, packet);
}

function destroyConnect(self) {
	utils.assert(!self._isUse, 'useing');
	clearTimeout(self._tomeout);
	if (!self._socket) return;
	self.onError.off();
	self.onPacket.off();
	self.onReady.off();
	self._socket.destroy();
	self._socket = null;
	connect_pool[self.opt.host + ':' + self.opt.port].deleteValue(self);
}

var Connect = utils.class('Connect', {
	//private:
	_greeting: null,
	_socket: null,
	_parser: null,
	_tomeout: 0,
	_isUse: true,
	_isReady: false,

	// public:
	/**
	 * option
	 * @type {Object}
	 */
	opt: null,

	onError: null,
	onPacket: null,
	onReady: null,
	
	/**
	 * constructor function
	 * @param {Object}   opt
	 * @constructor
	 */
	constructor: function(opt) {
		event.initEvents(this, 'Error', 'Packet', 'Ready');

		this.opt = opt;
		var self = this;
		var parser = self._parser = new Parser();
		var socket = self._socket = new Socket();

		function error(err) {
			self._connectError = true;
			self.onError.trigger(Error.new(err));
			destroyConnect(self);
		}
		socket.setNoDelay(true);
		socket.setTimeout(72e5, ()=>/*2h timeout*/ socket.end());
		socket.on('data', e=>parser.write(e));
		socket.on('error', err=>error(err));
		socket.on('end', ()=>error('mysql server has been disconnected'));

		parser.onpacket.on(function(e) {
			var packet = e.data;
			if (packet.type === ERROR_PACKET) {
				error({ message: 'ERROR_PACKET', packet: packet.toUserObject() });
			} else if (this._isReady) {
				self.onPacket.trigger(packet);
			} else if (packet.type == GREETING_PACKET) {
				sendAuth(self, packet);
			} else if (packet.type == USE_OLD_PASSWORD_PROTOCOL_PACKET) {
				sendOldAuth(self, self._greeting);
			} else { // ok
				this._isReady = true;
				self.onReady.trigger();
			}
		});

		socket.connect(opt.port, opt.host);
	},

	/**
	 * write buffer
	 * @param {node.Buffer}
	 */
	write: function (buffer) {
		this._socket.write(buffer);
	},

	/**
	 * return connection pool
	 */
	idle: function() {
		utils.assert(this.onPacket.length === 0, 'Connect.idle(), this.onPacket.length');
		utils.assert(this._isUse, 'Connect.idle(), _isUse');
		this._isUse = false;
		this.onPacket.off();
		this.onError.off();
		this.onReady.off();

		if (this._connectError) return; // connect error

		for (var i = 0, l = require_connect.length; i < l; i++) {
			var req = require_connect[i];
			var args = req.args;
			var [opt] = args;
			if (
				opt.host == this.opt.host && opt.port === this.opt.port &&
				opt.user == this.opt.user && opt.password == this.opt.password
			) {
				require_connect.splice(i, 1);
				clearTimeout(req.timeout);
				resolve(...args);
				return;
			}
		}
		this._tomeout = destroyConnect.setTimeout(CONNECT_TIMEOUT, this);
	},

	_changeDB(db, cb) {
		if (db != this.opt.database) { // change  db
			// init db, change db
			utils.assert(this._isReady);
			this.opt.database = db;
			var packet = new OutgoingPacket(1 + Buffer.byteLength(db, 'utf-8'));
			packet.writeNumber(1, constants.COM_INIT_DB);
			packet.write(db, 'utf-8');
			write(this, packet);
			this._isReady = false;
		}
		this._ready(cb);
	},

	_ready: function(cb) {
		if (this._isReady)
			return cb(null, this);
		// wait ready
		this.onReady.once(()=>cb(null, this));
		this.onError.once(e=>cb(e.data));
	},

	/**
		* start use connect
		*/
		_use: function () {
		this._isUse = true;
		clearTimeout(this._tomeout);
	},

});

/**
 * get connect
 * @param {Object}   opt
 * @param {Function} cb
 */
function resolve(opt, cb) {
	var key = opt.host + ':' + opt.port;
	var pool = connect_pool[key] || (connect_pool[key] = []);

	for (var c of pool) {
		var options = c.opt;
		if (!c._isUse && !c._connectError) {
			if (options.user == opt.user && options.password == opt.password) {
				c._use();
				if (options.database == opt.database) {
					utils.nextTick(cb, null, c);
				} else {
					c._changeDB(opt.database, cb);
				}
				return;
			}
		}
	}

	//is max connect
	if (pool.length < exports.MAX_CONNECT_COUNT) {
		var con = new Connect(opt);
		pool.push(con);
		con._ready(cb);
		return;
	}

	// queue up
	var req = {
		timeout: function() {
			require_connect.deleteValue(req);
			cb(new Error('obtaining a connection from the connection pool timeout'));
		} .setTimeout(CONNECT_TIMEOUT),
		args: Array.toArray(arguments)
	};
	//append to require connect
	require_connect.push(req);
};

exports.resolve = resolve;

/**
	* <span style="color:#f00">[static]</span>max connect count
	* @type {Numbet}
	* @static
	*/
exports.MAX_CONNECT_COUNT = 20;

/**
	* <b style="color:#f00">[static]</b>default flags
	* @type {Number}
	* @static
	*/
exports.DEFAULT_FLAGS = 
		constants.CLIENT_LONG_PASSWORD
	| constants.CLIENT_FOUND_ROWS
	| constants.CLIENT_LONG_FLAG
	| constants.CLIENT_CONNECT_WITH_DB
	| constants.CLIENT_ODBC
	| constants.CLIENT_LOCAL_FILES
	| constants.CLIENT_IGNORE_SPACE
	| constants.CLIENT_PROTOCOL_41
	| constants.CLIENT_INTERACTIVE
	| constants.CLIENT_IGNORE_SIGPIPE
	| constants.CLIENT_TRANSACTIONS
	| constants.CLIENT_RESERVED
	| constants.CLIENT_SECURE_CONNECTION
	| constants.CLIENT_MULTI_STATEMENTS
	| constants.CLIENT_MULTI_RESULTS;

/**
	* <b style="color:#f00">[static]</b>max packet size
	* @type {Number}
	* @static
	*/
exports.MAX_PACKET_SIZE = 0x01000000;

/**
	* <b style="color:#f00">[static]</b>charest number
	* @type {Number}
	* @static
	*/
exports.CHAREST_NUMBER = constants.UTF8_UNICODE_CI;


export default {}