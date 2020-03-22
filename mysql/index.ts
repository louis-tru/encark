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
import {Database, Callback, Options, Result} from '../db';
import constants from './constants';
import {Query, Field} from './query';
import {OutgoingPacket} from './outgoing_packet';
import { Connection } from './connection';
import { Constants, Packet, IPacket } from './parser';
import util from '../util';

interface After {
	(packet: IPacket): void;
}

interface Queue {
	exec(): void;
	after?: After;
}

//public:
export class Mysql extends Database {

	private _queue: Queue[];
	private _connection: Connection | null = null;
	private _connecting = false;
	private _transaction = false;

	//close back connect
	private _close() {
		var self = this;
		var connection = self._connection;
		self._connection = null;
		if (connection) {
			connection.onPacket.off('Mysql');
			connection.onError.off('Mysql');
			try {
				connection.idle();
			} catch(err) {
				console.error(err);
			}
		} else if (self._connecting) {
			self._connecting = false;
		}
	}

	//net error and connection error
	private _handlError(err: Error) {
		var self = this;
		self._close(); // close this connect
		var item = self._queue[0];
		var after = item ? item.after : null;
		if (after) {
			after({ type: Constants.ERROR_PACKET, toJSON: function() { return err } });
		} else {
			self.onError.trigger(err);
			self._dequeue();
			console.error(err);
		}
	}

	//onpacket handle
	private _handlePacket(packet: Packet) {
		var self = this;
		// @TODO Simplify the code below and above as well
		var item = self._queue[0];
		var after = item ? item.after : null;
		if (after) {
			after(packet);
		} else {
			if (packet.type === Constants.ERROR_PACKET) {
				self.onError.trigger(packet.toJSON() as Error);
				console.error(packet);
			}
			self._dequeue();
		}
	}

	private _after(cb: Callback): After {
		var self = this;
		return function(packet: IPacket) {
			var data = packet.toJSON();
			if (packet.type === Constants.ERROR_PACKET) {
				utils.nextTick(cb, data as Error);
			} else {
				utils.nextTick(cb, null, [data]);
			}
			self._dequeue();
		}
	}

	//get connect
	private _connect() {
		var self = this;
		if (self._connecting)
			return;
		self._connecting = true;

		util.assert(!self._connection, '_connection null ??');

		Connection.resolve(self.options, function(err, connection) {
			if (err) {
				self._handlError(err);
			} else if (self._connecting && self._queue.length) {
				if (!connection)
					throw new Error('connection null ??');
				connection.onPacket.on(e=>self._handlePacket(e.data as Packet), 'Mysql');
				connection.onError.on(e=>self._handlError(e.data as Error), 'Mysql');
				self._connection = connection;
				self._connecting = false;
				self._exec();
			} else {
				self._connecting = false;
				connection?.idle();
			}
		});
	}

	//write packet
	private _write(packet: OutgoingPacket) {
		(this._connection as Connection).write(packet.buffer);
	}

	private _exec() {
		var self = this;
		utils.assert(this._connection, 'this._connection null ??');
		utils.assert(self._queue.length, 'self._queue.length == 0 ??');
		try {
			self._queue[0].exec();
		} catch(err) {
			self._handlError(err);
		}
	}

	//enqueue
	private _enqueue(exec: ()=>void, after?: After) {
		var self = this;
		self._queue.push({ exec, after });
		if (self._connection) {
			if (self._queue.length === 1) {
				if (self._connection) {
					self._exec();
				}
			}
		} else {
			self._connect();
		}
	}

	//dequeue
	private _dequeue() {
		var self = this;
		self._queue.shift();
		if (self._queue.length) {
			if (self._connection) {
				self._exec();
			} else {
				self._connect();
			}
		}
	}

	/**
		* is connection
		*/
	get connected() {
		return !!this._connection;
	}

	/**
		* constructor function
		*/
	constructor(options?: Options) {
		super(options);
		this._queue = [];
	}

	statistics(cb: Callback) {
		var self = this;
		self._enqueue(function() {
			var packet = new OutgoingPacket(1);
			packet.writeNumber(1, constants.COM_STATISTICS);
			self._write(packet);
		}, self._after(cb));
	}

	query(sql: string, cb?: Callback) {
		var self = this;
		var query = new Query(sql);

		if (cb) {
			var dataSet: Result[] = [];
			var rows: Dict[] = [];
			var fields: Dict<Field> = {};

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
			query.onEnd.on(function() {
				utils.nextTick(cb, null, dataSet);
				self._dequeue();
			});
			query.onError.on(function (e) {
				utils.nextTick(cb, e.data);
				self._dequeue();
			});
		}
		else {
			query.onEnd.on(function () {
				self._dequeue();
			});
			query.onError.on(function () {
				self._dequeue();
			});
		}

		self._enqueue(function() {
			var packet = new OutgoingPacket(1 + Buffer.byteLength(sql, 'utf-8'));
			packet.writeNumber(1, constants.COM_QUERY);
			packet.write(sql, 'utf-8');
			self._write(packet);
		}, function(packet: IPacket) {
			query.handlePacket(packet as Packet);
		});

		return query;
	}

	close() {
		var self = this;
		if (self._queue.length) {
			if (self._transaction)
				self.commit();
			self._enqueue(function() {
				self._close();
				self._dequeue();
			});
		} else {
			self._close();
		}
	}

	transaction() {
		if (this._transaction)
			return;
		this._transaction = true;
		this.query('START TRANSACTION');
	}

	commit() {
		this._transaction = false;
		this.query('COMMIT');
	}

	rollback() {
		this._queue = [];
		this._transaction = false;
		this.query('ROLLBACK');
	}
	
}
