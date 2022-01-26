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
import {EventNoticer,Event} from '../event';
import {
	Parser, Constants as ParserConstants, Packet
} from './parser';
import {ClientFlags, Charsets, Commands} from './constants';
import * as auth from './auth';
import {OutgoingPacket} from './packet';
import {Buffer} from 'buffer';
import {Socket} from 'net';
import {Options, default_options} from './opts';
import {Watch} from '../monitor';

const CONNECT_TIMEOUT = 1e4;
const G_connect_pool: Dict<{ used: Connection[], idle: Connection[] }> = {};
const G_require_connect: Dict<Request[]> = {};
const G_watch = new Watch(1e4);

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
		ClientFlags.CLIENT_LONG_PASSWORD
	| ClientFlags.CLIENT_FOUND_ROWS
	| ClientFlags.CLIENT_LONG_FLAG
	| ClientFlags.CLIENT_CONNECT_WITH_DB
	| ClientFlags.CLIENT_ODBC
	| ClientFlags.CLIENT_LOCAL_FILES
	| ClientFlags.CLIENT_IGNORE_SPACE
	| ClientFlags.CLIENT_PROTOCOL_41
	| ClientFlags.CLIENT_INTERACTIVE
	| ClientFlags.CLIENT_IGNORE_SIGPIPE
	| ClientFlags.CLIENT_TRANSACTIONS
	| ClientFlags.CLIENT_RESERVED
	| ClientFlags.CLIENT_SECURE_CONNECTION
	| ClientFlags.CLIENT_MULTI_STATEMENTS
	| ClientFlags.CLIENT_MULTI_RESULTS;

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
	set DEFAULT_FLAGS(value: ClientFlags) { DEFAULT_FLAGS = value },
	set CHAREST_NUMBER(value: Charsets) { CHAREST_NUMBER = value },
};

interface Callback {
	(e: Error | null, connect?: Connection): void;
}

interface Request {
	timeout: number;
	time: ()=>void;
	args: [ Options, Callback ];
}

function _Watch() {
	var now = Date.now();
	var isStop = true;
	// watch reqs
	for (var reqs of Object.values(G_require_connect)) {
		for (var i = 0; i < reqs.length; ) {
			var req = reqs[i];
			if (now >= req.timeout) {
				req.time();
				reqs.splice(i, 1);
			} else {
				i++;
			}
			isStop = false;
		}
	}

	for (var pool of Object.values(G_connect_pool)) {
		for (var c of pool.idle) {
			isStop = false;
			c.checkIdleTimeout();
		}
	}

	if (isStop) {
		G_watch.stop();
	}
}

function watch() {
	if (!G_watch.running) {
		G_watch.start(()=>{
			try {
				_Watch();
			} catch(err) {
				console.warn(err);
			}
		});
	}
}

export class Connection {
	private _greeting: Packet | null = null;
	private _socket: Socket | null;
	private _idle_tomeout = 0;
	private _isUse = false;
	private _isReady = false;
	readonly parser: Parser;

	private _write(packet: OutgoingPacket) {
		(this._socket as Socket).write(packet.buffer);
	}

	private _sendAuth(greeting: Packet) {
		var opt = this.options;
		var token = auth.token(opt.password as string, greeting.data.scrambleBuffer as Buffer);
		var packetSize = (
			4 + 4 + 1 + 23 +
			(opt.user as string).length + 1 +
			token.length + 1 +
			(opt.database  as string).length + 1
		);
		var packet = new OutgoingPacket(packetSize, greeting.number + 1);

		packet.writeNumber(4, DEFAULT_FLAGS);
		packet.writeNumber(4, MAX_PACKET_SIZE);
		packet.writeNumber(1, CHAREST_NUMBER);
		packet.writeFiller(23);
		packet.writeNullTerminated(opt.user as string);
		packet.writeLengthCoded(token);
		packet.writeNullTerminated(opt.database as string);

		this._write(packet);
	
		// Keep a reference to the greeting packet. We might receive a
		// USE_OLD_PASSWORD_PROTOCOL_PACKET as a response, in which case we will need
		// the greeting packet again. See sendOldAuth()
		this._greeting = greeting;
	}

	private _sendOldAuth(greeting: Packet) {
		var token = auth.scramble323(greeting.data.scrambleBuffer as Buffer, this.options.password as string);
		var packetSize = (token.length + 1);

		var packet = new OutgoingPacket(packetSize, greeting.number + 3);

		// I could not find any official documentation for this, but from sniffing
		// the mysql command line client, I think this is the right way to send the
		// scrambled token after receiving the USE_OLD_PASSWORD_PROTOCOL_PACKET.
		packet.write(token);
		packet.writeFiller(1);

		this._write(packet);
	}

	checkIdleTimeout() {
		if (this._idle_tomeout && Date.now() > this._idle_tomeout) {
			this._Destroy();
		}
	}

	private _Destroy(reason?: any) {
		var self = this;
		var socket = self._socket;
		if (socket) {
			self._socket = null;
			this._idle_tomeout = 0;
			var key = Connection._Key(this.options);
			if (this._isUse) {
				G_connect_pool[key].used.deleteOf(self);
			} else {
				G_connect_pool[key].idle.deleteOf(self);
			}
			if (reason)
				self.onError.trigger(Error.new(reason));
			self.onError.off();
			self.onPacket.off();
			self._onReady.off();
			socket.destroy();
		}
	}

	/**
	 * option
	 * @type {Object}
	 */
	readonly options: Options;
	readonly onError = new EventNoticer<Event<Connection, Error>>('Error', this);
	readonly onPacket = new EventNoticer<Event<Connection, Packet>>('Packet', this);
	private readonly _onReady = new EventNoticer<Event<Connection, void>>('_Ready', this);

	/**
	 * @constructor
	 * @arg opt {Object}
	 */
	constructor(options?: Options) {
		this.options = Object.assign({}, default_options, options);
		var self = this;
		var parser = new Parser();
		var socket = this._socket = new Socket();

		this.parser = parser;

		socket.setNoDelay(true);
		socket.setTimeout(36e5, ()=>/*1h timeout*/ socket.end());
		socket.on('data', e=>{
			try { parser.write(e) } catch(err) { self._Destroy(err) }
		});
		socket.on('error', err=>self._Destroy(err));
		socket.on('end', ()=>self._Destroy('mysql server has been socket end'));
		socket.on('close', ()=>self._Destroy('mysql server has been socket close'));

		parser.onPacket.on(function(e) {
			var packet = e.data;
			if (packet.type === ParserConstants.ERROR_PACKET) {
				self._Destroy({ message: 'ERROR_PACKET', ...packet.toJSON() });
			} else if (self._isReady) {
				self.onPacket.trigger(packet);
			} else if (packet.type == ParserConstants.GREETING_PACKET) {
				self._sendAuth(packet);
			} else if (packet.type == ParserConstants.USE_OLD_PASSWORD_PROTOCOL_PACKET) {
				self._sendOldAuth(self._greeting as Packet);
			} else { // ok
				self._isReady = true;
				self._onReady.trigger();
			}
		});

		socket.connect(this.options.port as number, this.options.host as string);
	}

	/**
	 * write buffer
	 * @arg {node.Buffer}
	 */
	write(buffer: Buffer) {
		(this._socket as Socket).write(buffer);
	}

	private static _Key(opts: Options) {
		return `${opts.host}_${opts.port}_${opts.user}`;
	}

	/**
	 * return connection pool
	 */
	idle() {
		utils.assert(this.onPacket.length === 0, 'Connection.idle(), this.onPacket.length');
		utils.assert(this._isUse, 'Connection.idle(), _isUse');

		this._isUse = false;
		this.onPacket.off();
		this.onError.off();
		this._onReady.off();
		
		if (!this._socket)
			return; // socket destroy

		var opts_ = this.options;
		var key = Connection._Key(opts_);
		var reqs = G_require_connect[key];
		var {used,idle} = G_connect_pool[key];

		used.deleteOf(this);
		idle.push(this);

		// console.log('idle()', 'reqs', reqs?.length, 'used', used.length, 'idle', idle.length);

		if (reqs) {
			for (var i = 0, l = reqs.length; i < l; i++) {
				var req = reqs[i];
				var [opts,cb] = req.args;
				reqs.splice(i, 1);
				resolve(opts, cb);
				// console.log('idle() b', reqs.length);
				return;
			}
		}
		// console.log('idle() c', reqs?.length);

		this._idle_tomeout = Date.now() + CONNECT_TIMEOUT;
		watch();
	}

	private _changeDB(db: string, cb: Callback) {
		if (db != this.options.database) { // change  db
			// init db, change db
			utils.assert(this._isReady);
			this.options.database = db;
			var packet = new OutgoingPacket(1 + Buffer.byteLength(db, 'utf-8'));
			packet.writeNumber(1, Commands.COM_INIT_DB);
			packet.write(db, 'utf-8');
			this._write(packet);
			this._isReady = false;
		}
		this._ready(cb);
	}

	private _ready(cb: Callback) {
		this._use();

		if (this._isReady) {
			return utils.nextTick(cb, null, this);
		}
		// wait ready
		this._onReady.once(()=>{
			this.onError.off();
			utils.nextTick(cb, null, this);
		});
		this.onError.once(e=>cb(e.data));
	}

	/**
		* start use connect
		*/
	private _use() {
		utils.assert(!this._isUse);
		this._isUse = true;
		this._idle_tomeout = 0;
		var key = Connection._Key(this.options);
		G_connect_pool[key].idle.deleteOf(this);
		G_connect_pool[key].used.push(this);
	}

	/**
	 * get connect
	 * @param {Object}   opt
	 * @param {Function} cb
	 */
	static resolve(opt: Options, cb: Callback) {
		var key = Connection._Key(opt);
		var pool = G_connect_pool[key] || (G_connect_pool[key] = { used: [], idle: [] });

		var c = pool.idle[0];
		if (c) {
			var c_opts = c.options;
			if (c_opts.database == opt.database) {
				c._ready(cb);
			} else {
				c._changeDB(opt.database as string, cb);
			}
			return;
		}

		//is max connect
		if (pool.used.length + pool.idle.length < MAX_CONNECT_COUNT) {
			var _c = new Connection(opt);
			pool.idle.push(_c);
			_c._ready(cb);
		} else {
			var reqs = G_require_connect[key] || (G_require_connect[key] = []);
			// console.log('resolve()', 'reqs', reqs.length);
			// queue up
			var req: Request = {
				time: function() {
					cb(new Error('obtaining a connection from the connection pool timeout'));
				},
				timeout: Date.now() + CONNECT_TIMEOUT,
				args: [opt, cb],
			};
			//append to require connect
			reqs.push(req);
			watch();
		}
	}
}

export const resolve = Connection.resolve;