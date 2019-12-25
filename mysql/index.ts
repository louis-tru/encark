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
var {Database} = require('../db');
var constants = require('./constants');
var {Query} = require('./query');
var {OutgoingPacket} = require('./outgoing_packet');
var {Buffer} = require('buffer');
var connect_lib = require('./connect');

//private:
//close back connect
function close(self) {
	var connect = self._connect;
	self._connect = null;
	if (connect) {
		connect.onPacket.off('using');
		connect.onError.off('using');
		connect.idle();
	} else if (self._connecting) {
		self._connecting = false;
	}
}

//net error and connection error
function handlError(self, err) {
	close(self); // close this connect
	var item = self._queue[0];
	var after = item ? item.after : null;

	if (after) {
		after({ toUserObject: function() { return err } });
	} else {
		self.onError.trigger(err);
		dequeue(self);
		console.error(err);
	}
}

//onpacket handle
function handlePacket(self, e) {
	var packet = e.data;
	// @TODO Simplify the code below and above as well
	var item = self._queue[0];
	var after = item ? item.after : null;
	if (after) {
		after(packet);
	} else {
		if (packet.type === Parser.ERROR_PACKET) {
			self.onError.trigger(packet);
			console.error(packet);
		}
		dequeue(self);
	}
}

function after(self, cb) {
	return function(packet) {
		var data = packet.toUserObject();
		if (packet.type === Parser.ERROR_PACKET) {
			cb(data);
		} else {
			cb(null, data);
		}
		dequeue(self);
	}
}

//get connect
function connect(self) {
	if (self._connecting) return;
	self._connecting = true;

	connect_lib.resolve({
		host: self.host,
		port: self.port,
		user: self.user,
		password: self.password,
		database: self.database
	}, function (err, connect) {
		util.assert(self._connecting);
		if (err) {
			handlError(self, err);
		} else {
			connect.onPacket.on2(handlePacket, self, 'using');
			connect.onError.on(e=>handlError(self, e.data), 'using');
			self._connect = connect;
			self._connecting = false;
			self._queue[0].exec();
		}
	});
}

//write packet
function write(self, packet) {
	self._connect.write(packet.buffer);
}

//enqueue
function enqueue(self, exec, after) {
	self._queue.push({ exec, after });
	if (self._connect) {
		if (self._queue.length === 1) {
			if (self._connect)
				exec();
		}
	} else {
		connect(self);
	}
}

//dequeue
function dequeue(self) {
	var queue = self._queue;
	queue.shift();
	if (queue.length) {
		if (self._connect) {
			queue[0].exec();
		} else {
			connect(self);
		}
	}
}

//public:
exports.Mysql = util.class('Mysql', Database, {

	//private:
	_queue: null,
	_connect: null,
	_transaction: false,
	_connecting: false,

	//public:
	port: 3306,
	host: '127.0.0.1',
	user: 'root',
	password: '',
	database: '',

	/**
		* is connection
		* @get connected
		*/
	get connected() {
		return !!this._connect;
	},

	/**
		* constructor function
		* @param {Object} conf (Optional)
		* @constructor
		*/
	constructor: function(conf) {
		Database.call(this);
		util.update(this, conf);
		this._queue = [];
	},

	//overlay
	statistics: function(cb) {
		var self = this;
		enqueue(self, function() {
			var packet = new OutgoingPacket(1);
			packet.writeNumber(1, constants.COM_STATISTICS);
			write(self, packet);
		}, after(this, cb));
	},

	//overlay
	query: function(sql, cb) {
		var self = this;
		var query = new Query(sql);
		
		if (cb) {
			var dataSet = [];
			var rows = [], ields = {};

			query.onError.on(function (e) {
				cb(e.data);
				dequeue(self);
			});
			query.onResolve.on(function(e) {
				rows = []; fields = {};
				dataSet.push(e.data ? e.data : { rows, fields });
			});
			query.onField.on(function(e) {
				var field = e.data;
				fields[field.name] = field;
			});
			query.onRow.on(function(e) {
				rows.push(e.data);
			});
			query.onEnd.on(function(e) { 
				cb(null, dataSet);
				dequeue(self);
			});
		}
		else {
			query.onError.on(function (e) {
				dequeue(self);
			});
			query.onEnd.on(function () {
				dequeue(self);
			});
		}

		enqueue(self, function() {
			var packet = new OutgoingPacket(1 + Buffer.byteLength(sql, 'utf-8'));
			packet.writeNumber(1, constants.COM_QUERY);
			packet.write(sql, 'utf-8');
			write(self, packet);
		}, function(packet) {
			query.handlePacket(packet);
		});

		return query;
	},

	//overlay
	close: function() {
		var self = this;
		if (self._queue.length) {
			if (self._transaction)
				self.commit();
			enqueue(self, function() {
				close(self);
				dequeue(self);
			});
		} else {
			close(self);
		}
	},

	//overlay
	transaction: function() {
		if (this._transaction)
			return;
		this._transaction = true;
		this.query('START TRANSACTION');
	},

	//overlay
	commit: function() {
		this._transaction = false;
		this.query('COMMIT');
	},

	//overlay
	rollback: function() {
		this._queue = [];
		this._transaction = false;
		this.query('ROLLBACK');
	},
	
});

export default {}