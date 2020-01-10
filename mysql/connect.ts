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

import utils from '../util';
import {EventNoticer} from '../event';
import {
	Parser, Constants as ParserConstants, Packet
} from './parser';
import Constants from './constants';
import Charsets from './charsets';
import * as auth from './auth';
import {OutgoingPacket} from './outgoing_packet';
import {Buffer} from 'buffer';
import {Socket} from 'net';
import {Options, defaultOptions} from '../db';

const CONNECT_TIMEOUT = 1e4;
const connect_pool: Dict<Connect[]> = {};
const require_connect: Request[] = [];

/**
* <span style="color:#f00">[static]</span>max connect count
* @type {Numbet}
* @static
*/
var MAX_CONNECT_COUNT = 20;

/**
	* <b style="color:#f00">[static]</b>max packet size
	* @type {Number}
	* @static
	*/
	var MAX_PACKET_SIZE = 0x01000000;

/**
	* <b style="color:#f00">[static]</b>default flags
	* @type {Number}
	* @static
	*/
var DEFAULT_FLAGS = 
	Constants.CLIENT_LONG_PASSWORD
	| Constants.CLIENT_FOUND_ROWS
	| Constants.CLIENT_LONG_FLAG
	| Constants.CLIENT_CONNECT_WITH_DB
	| Constants.CLIENT_ODBC
	| Constants.CLIENT_LOCAL_FILES
	| Constants.CLIENT_IGNORE_SPACE
	| Constants.CLIENT_PROTOCOL_41
	| Constants.CLIENT_INTERACTIVE
	| Constants.CLIENT_IGNORE_SIGPIPE
	| Constants.CLIENT_TRANSACTIONS
	| Constants.CLIENT_RESERVED
	| Constants.CLIENT_SECURE_CONNECTION
	| Constants.CLIENT_MULTI_STATEMENTS
	| Constants.CLIENT_MULTI_RESULTS;

/**
	* <b style="color:#f00">[static]</b>charest number
	* @type {Number}
	* @static
	*/
var CHAREST_NUMBER = Charsets.UTF8_UNICODE_CI;

export default {
	get MAX_CONNECT_COUNT() { return MAX_CONNECT_COUNT },
	get MAX_PACKET_SIZE() { return MAX_PACKET_SIZE },
	get DEFAULT_FLAGS() { return DEFAULT_FLAGS },
	get CHAREST_NUMBER() { return CHAREST_NUMBER },
	set MAX_CONNECT_COUNT(value: number) { MAX_CONNECT_COUNT = value },
	set MAX_PACKET_SIZE(value: number) { MAX_PACKET_SIZE = value },
	set DEFAULT_FLAGS(value: Constants) { DEFAULT_FLAGS = value },
	set CHAREST_NUMBER(value: Charsets) { CHAREST_NUMBER = value },
};

interface Callback {
	(e: Error | null, connect?: Connect): void;
}

interface Request {
	timeout: any;
	args: [ Options, Callback ];
}

export class Connect {
	private _greeting: Packet | null = null;
	private _socket: Socket | null;
	private _tomeout = 0;
	private _isUse = true;
	private _isReady = false;
	private _connectError = false;

	private _write(packet: OutgoingPacket) {
		(<Socket>this._socket).write(packet.buffer);
	}
	
	private _sendAuth(greeting: Packet) {
		var opt = this.options;
		var token = auth.token(<string>opt.password, greeting.d.scrambleBuffer as Buffer);
		var packetSize = (
			4 + 4 + 1 + 23 +
			(<string>opt.user).length + 1 +
			token.length + 1 +
			(<string>opt.database).length + 1
		);
		var packet = new OutgoingPacket(packetSize, greeting.number + 1);
	
		packet.writeNumber(4, DEFAULT_FLAGS);
		packet.writeNumber(4, MAX_PACKET_SIZE);
		packet.writeNumber(1, CHAREST_NUMBER);
		packet.writeFiller(23);
		packet.writeNullTerminated(<string>opt.user);
		packet.writeLengthCoded(token);
		packet.writeNullTerminated(<string>opt.database);
	
		this._write(packet);
	
		// Keep a reference to the greeting packet. We might receive a
		// USE_OLD_PASSWORD_PROTOCOL_PACKET as a response, in which case we will need
		// the greeting packet again. See sendOldAuth()
		this._greeting = greeting;
	}
	
	private _sendOldAuth(greeting: Packet) {
		var token = auth.scramble323(greeting.d.scrambleBuffer as Buffer, <string>this.options.password);
		var packetSize = (token.length + 1);
	
		var packet = new OutgoingPacket(packetSize, greeting.number + 3);
	
		// I could not find any official documentation for this, but from sniffing
		// the mysql command line client, I think this is the right way to send the
		// scrambled token after receiving the USE_OLD_PASSWORD_PROTOCOL_PACKET.
		packet.write(token);
		packet.writeFiller(1);
	
		this._write(packet);
	}
	
	private _destroyConnect() {
		utils.assert(!this._isUse, 'useing');
		clearTimeout(this._tomeout);
		if (!this._socket) return;
		this.onError.off();
		this.onPacket.off();
		this.onReady.off();
		this._socket.destroy();
		this._socket = null;
		connect_pool[this.options.host + ':' + this.options.port].deleteOf(this);
	}

	/**
	 * option
	 * @type {Object}
	 */
	readonly options: Options;
	readonly onError = new EventNoticer<Error>('Error', this);
	readonly onPacket = new EventNoticer<Packet>('Packet', this);
	readonly onReady = new EventNoticer<void>('Ready', this);
	
	/**
	 * constructor function
	 * @param {Object}   opt
	 * @constructor
	 */
	constructor(options?: Options) {
		this.options = Object.assign({}, defaultOptions, options);
		var self = this;
		var parser = new Parser();
		var socket = this._socket = new Socket();

		function error(err: any) {
			self._connectError = true;
			self.onError.trigger(Error.new(err));
			self._destroyConnect();
		}
		socket.setNoDelay(true);
		socket.setTimeout(72e5, ()=>/*2h timeout*/ socket.end());
		socket.on('data', e=>parser.write(e));
		socket.on('error', err=>error(err));
		socket.on('end', ()=>error('mysql server has been disconnected'));

		parser.onPacket.on(function(e) {
			var packet = <Packet>e.data;
			if (packet.type === ParserConstants.ERROR_PACKET) {
				error({ message: 'ERROR_PACKET', ...packet.toJSON() });
			} else if (self._isReady) {
				self.onPacket.trigger(packet);
			} else if (packet.type == ParserConstants.GREETING_PACKET) {
				self._sendAuth(packet);
			} else if (packet.type == ParserConstants.USE_OLD_PASSWORD_PROTOCOL_PACKET) {
				self._sendOldAuth(self._greeting as Packet);
			} else { // ok
				self._isReady = true;
				self.onReady.trigger();
			}
		});

		socket.connect(<number>this.options.port, <string>this.options.host);
	}

	/**
	 * write buffer
	 * @param {node.Buffer}
	 */
	write(buffer: Buffer) {
		(<Socket>this._socket).write(buffer);
	}

	/**
	 * return connection pool
	 */
	idle() {
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
				opt.host == this.options.host && opt.port === this.options.port &&
				opt.user == this.options.user && opt.password == this.options.password
			) {
				require_connect.splice(i, 1);
				clearTimeout(req.timeout);
				resolve(...args);
				return;
			}
		}
		this._tomeout = (()=>this._destroyConnect()).setTimeout(CONNECT_TIMEOUT);
	}

	private _changeDB(db: string, cb: Callback) {
		if (db != this.options.database) { // change  db
			// init db, change db
			utils.assert(this._isReady);
			this.options.database = db;
			var packet = new OutgoingPacket(1 + Buffer.byteLength(db, 'utf-8'));
			packet.writeNumber(1, Constants.COM_INIT_DB);
			packet.write(db, 'utf-8');
			this._write(packet);
			this._isReady = false;
		}
		this._ready(cb);
	}

	private _ready(cb: Callback) {
		if (this._isReady)
			return cb(null, this);
		// wait ready
		this.onReady.once(()=>cb(null, this));
		this.onError.once(e=>cb(<Error>e.data));
	}

	/**
		* start use connect
		*/
	private _use() {
		this._isUse = true;
		clearTimeout(this._tomeout);
	}

	/**
	 * get connect
	 * @param {Object}   opt
	 * @param {Function} cb
	 */
	static resolve(opt: Options, cb: Callback) {
		var key = opt.host + ':' + opt.port;
		var pool = connect_pool[key] || (connect_pool[key] = []);

		for (var c of pool) {
			var options = c.options;
			if (!c._isUse && !c._connectError) {
				if (options.user == opt.user && options.password == opt.password) {
					c._use();
					if (options.database == opt.database) {
						utils.nextTick(cb, null, c);
					} else {
						c._changeDB(<string>opt.database, cb);
					}
					return;
				}
			}
		}

		//is max connect
		if (pool.length < MAX_CONNECT_COUNT) {
			var con = new Connect(opt);
			pool.push(con);
			con._ready(cb);
			return;
		}

		// queue up
		var req: Request = {
			timeout: function() {
				require_connect.deleteOf(req);
				cb(new Error('obtaining a connection from the connection pool timeout'));
			} .setTimeout(CONNECT_TIMEOUT),
			args: [opt, cb]
		};
		//append to require connect
		require_connect.push(req);
	}
}

export const resolve = Connect.resolve;