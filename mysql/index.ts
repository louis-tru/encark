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
import { Connect } from './connect';
import { Constants, Packet, IPacket } from './parser';

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
	private _connect: Connect | null = null;
	private _transaction = false;
	private _connecting = false;

	//close back connect
	private _close() {
		var self = this;
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
				self.onError.trigger(<Error>packet.toJSON());
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
				cb(<Error>data);
			} else {
				cb(null, [data]);
			}
			self._dequeue();
		}
	}

	//get connect
	private __connect() {
		var self = this;
		if (self._connecting)
			return;
		self._connecting = true;

		Connect.resolve(self.options, function(err, connect) {
			utils.assert(self._connecting);
			if (err) {
				self._handlError(err);
			} else {
				if (!connect)
					throw new Error('Type error');
				connect.onPacket.on(e=>self._handlePacket(<Packet>e.data), 'using');
				connect.onError.on(e=>self._handlError(<Error>e.data), 'using');
				self._connect = connect;
				self._connecting = false;
				self._queue[0].exec();
			}
		});
	}

	//write packet
	private _write(packet: OutgoingPacket) {
		(<Connect>this._connect).write(packet.buffer);
	}

	//enqueue
	private _enqueue(exec: ()=>void, after?: After) {
		var self = this;
		self._queue.push({ exec, after });
		if (self._connect) {
			if (self._queue.length === 1) {
				if (self._connect)
					exec();
			}
		} else {
			self.__connect();
		}
	}

	//dequeue
	private _dequeue() {
		var self = this;
		var queue = self._queue;
		queue.shift();
		if (queue.length) {
			if (self._connect) {
				queue[0].exec();
			} else {
				self.__connect();
			}
		}
	}

	/**
		* is connection
		*/
	get connected() {
		return !!this._connect;
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

			query.onError.on(function (e) {
				cb(e.data);
				self._dequeue();
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
				self._dequeue();
			});
		}
		else {
			query.onError.on(function (e) {
				self._dequeue();
			});
			query.onEnd.on(function () {
				self._dequeue();
			});
		}

		self._enqueue(function() {
			var packet = new OutgoingPacket(1 + Buffer.byteLength(sql, 'utf-8'));
			packet.writeNumber(1, constants.COM_QUERY);
			packet.write(sql, 'utf-8');
			self._write(packet);
		}, function(packet: IPacket) {
			query.handlePacket(<Packet>packet);
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
