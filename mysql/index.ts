/* ***** BEGIN LICENSE BLOCK *****
 * Distributed under the BSD license:
 *
 * Copyright (c) 2015, blue.chu
 * All rights reserved.
 * 
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *     * Redistributions of source code must retain the above copyright
 *       notice, this list of conditions and the following disclaimer.
 *     * Redistributions in binary form must reproduce the above copyright
 *       notice, this list of conditions and the following disclaimer in the
 *       documentation and/or other materials provided with the distribution.
 *     * Neither the name of blue.chu nor the
 *       names of its contributors may be used to endorse or promote products
 *       derived from this software without specific prior written permission.
 * 
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
 * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL blue.chu BE LIABLE FOR ANY
 * DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
 * LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
 * ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
 * SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 * 
 * ***** END LICENSE BLOCK ***** */

import utils from '../util';
import {Database, DatabaseCRUD, DatabaseTools, Result, Where, SelectOptions, escape} from '../db';
import {Commands} from './constants';
import {Query, Field} from './query';
import {OutgoingPacket} from './packet';
import { Connection } from './pool';
import { Constants, Packet } from './parser';
import {EventNoticer} from '../event';
import errno from '../errno';
import {Options, default_options} from './opts';

export * from './opts';

interface After {
	(packet: Packet): void;
}

interface Queue {
	exec(): void;
	after?: After;
}

export class ErrorPacket extends Packet {
	error: Error;
	type = Constants.ERROR_PACKET;
	constructor(err: Error) {
		super();
		this.error = err;
	}
	toJSON() { return this.error }
}

interface Callback {
	(err: Error | null, data?: Result[]): void;
}

//public:
export class Mysql implements Database {

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
				console.warn(err);
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
			after(new ErrorPacket(err));
		} else {
			self.onError.trigger(err);
			self._dequeue();
			console.warn(err);
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
				console.warn(packet);
			}
			self._dequeue();
		}
	}

	private _after(cb: Callback): After {
		var self = this;
		return function(packet: Packet) {
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

		utils.assert(!self._connection, '_connection null ??');

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
				if (connection) {
					connection.idle();
				}
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
		} catch(err: any) {
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

	readonly options: Options;
	readonly onError = new EventNoticer<Error>('Error', this);

		/**
		* constructor function
		*/
	constructor(options?: Options) {
		this.options = {...default_options, ...options};
		this._queue = [];
	}

	statistics() {
		var self = this;
		return new Promise<Result>(function(resolve, reject){
			self._enqueue(function() {
				var packet = new OutgoingPacket(1);
				packet.writeNumber(1, Commands.COM_STATISTICS);
				self._write(packet);
			}, self._after(function (err, data) {
				err ? reject(err): resolve((data as Result[])[0]);
			}));
		})
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
			// (self._connection as any).parser._sql = sql;
			var packet = new OutgoingPacket(1 + Buffer.byteLength(sql, 'utf-8'));
			packet.writeNumber(1, Commands.COM_QUERY);
			packet.write(sql, 'utf-8');
			self._write(packet);
		}, function(packet: Packet) {
			query.handlePacket(packet);
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

	async transaction() {
		if (this._transaction)
			return;
		this._transaction = true;
		await this.exec('START TRANSACTION');
	}

	async commit() {
		this._transaction = false;
		await this.exec('COMMIT');
	}

	async rollback() {
		this._queue = [];
		this._transaction = false;
		await this.exec('ROLLBACK');
	}

	/**
	 * exec query database
	 */
	exec(sql: string): Promise<Result[]> {
		return new Promise((resolve, reject)=>{
			this.query(sql, function(err: any, data: any) {
				if (err) {
					if (err.errorMessage)
						err.message += ` => errorMessage: ${err.errorMessage}`;
					reject(err);
				} else {
					resolve(data);
				}
			});
		});
	}
	
}

interface DBStruct {
	names: string[];
	columns: {
		[key: string]: {
			// [key: string]: any;
			COLUMN_NAME: string;
			COLUMN_TYPE: string;
			// CHARACTER_MAXIMUM_LENGTH: null
			// CHARACTER_OCTET_LENGTH: null
			// CHARACTER_SET_NAME: null
			// COLLATION_NAME: null
			// COLUMN_COMMENT: ""
			// COLUMN_DEFAULT: null
			// COLUMN_KEY: ""
			// COLUMN_NAME: "traits"
			// COLUMN_TYPE: "json"
			// DATA_TYPE: "json"
			// DATETIME_PRECISION: null
			// EXTRA: ""
			// GENERATION_EXPRESSION: ""
			// IS_NULLABLE: "YES"
			// NUMERIC_PRECISION: null
			// NUMERIC_SCALE: null
			// ORDINAL_POSITION: 10
			// PRIVILEGES: "select,insert,update,references"
			// TABLE_CATALOG: "def"
			// TABLE_NAME: "collection"
			// TABLE_SCHEMA: "mvp_test"
		};
	};
}

class MysqlCRUD implements DatabaseCRUD {
	private _db: Database;
	private _host: MysqlTools;
	private _db_struct: { [key: string]: DBStruct };
	constructor(db: Database, host: MysqlTools) {
		this._db = db;
		this._host = host;
		this._db_struct = (host as any)._db_struct;
	}

	private check(table: string): DBStruct {
		var struct = this._db_struct[table];
		utils.assert(struct, errno.ERR_DATA_TABLE_NOT_FOUND);
		return struct;
	}

	private escape(struct: DBStruct, row: object, json: boolean = false, join = 'and', prefix = 'where') {
		var sql = [] as string[];
		for (var [key,val] of Object.entries(row)) {
			var col = struct.columns[key];
			if (col && val !== undefined) {
				if (col.COLUMN_TYPE == 'json' && json)
					val = JSON.stringify(val);
				sql.push(`${key} = ${escape(val)}`);
			}
		}
		return sql.length ? prefix + ' ' + sql.join(` ${join} `): '';
	}

	has(table: string): boolean {
		return this._host.has(table);
	}
	
	exec(sql: string): Promise<Result[]> {
		return this._db.exec(sql);
	}

	async insert(table: string, row: Dict): Promise<number> {
		var struct = this.check(table);
		var keys = [] as string[], values = [] as string[];
		for (var [key,val] of Object.entries(row)) {
			var col = struct.columns[key];
			if (col && val !== undefined) {
				if (col.COLUMN_TYPE == 'json')
					val = JSON.stringify(val);
				keys.push(key);
				values.push(escape(val));
			}
		}
		var sql = `insert into ${table} (${keys.join(',')}) values (${values.join(',')})`;
		var [r] = await this.exec(sql);
		return r.insertId as number;
	}

	async delete(table: string, where: Where = ''): Promise<number> {
		var struct = this.check(table);
		if (typeof where == 'object') {
			var sql = `delete from ${table} ${this.escape(struct, where)}`;
			var [r] = await this.exec(sql);
		} else {
			var sql = `delete from ${table} where ${where}`
			var [r] = await this.exec(sql);
		}
		return r.affectedRows as number;
	}

	async update(table: string, row: Dict, where: Where = ''): Promise<number> {
		var struct = this.check(table);
		var set = this.escape(struct, row, true, ',', '');
		if (typeof where == 'object') {
			var sql = `update ${table} set ${set} ${this.escape(struct, where)}`;
			var [r] = await this.exec(sql);
		} else {
			var where_sql = where ? 'where ' + where: '';
			var sql = `update ${table} set ${set} ${where_sql}`;
			var [r] = await this.exec(sql);
		}
		return r.affectedRows as number;
	}

	private async _select<T = Dict>(table: string, where: Where, opts: SelectOptions, total: boolean): Promise<T[]> {
		let struct = this.check(table);
		let sql;//, ls: T[];
		let limit_str = '';
		if (opts.limit) {
			limit_str = Array.isArray(opts.limit) ? ' limit ' + opts.limit.join(','): ' limit ' + opts.limit;
		}
		let out = total ? 'count(*) as __count': opts.out || '*';
		let group = opts.group ? `group by ${opts.group}`: '';
		let order = opts.order ? `order by ${opts.order}`: '';
		if (typeof where == 'object') {
			sql = `select ${out} from ${table} ${this.escape(struct, where)} ${group}`;
			if (!total)
				sql += `${order} `;
			sql += limit_str;
			// console.log(sql, values)
			var [{rows: ls}] = await this.exec(sql);
		} else {
			let where_sql = where ? 'where ' + where: '';
			sql = `select ${out} from ${table} ${where_sql} ${group} `;
			if (!total)
				sql += `${order} `;
			sql += limit_str;
			var [{rows: ls}] = await this.exec(sql);
		}
		return ls as T[];
	}

	select<T = Dict>(table: string, where: Where = '', opts: SelectOptions = {}): Promise<T[]> {
		return this._select<T>(table, where, opts, false);
	}

	async selectCount(table: string, where: Where = '', opts: SelectOptions = {}): Promise<number> {
		let d = await this._select(table, where, opts, true);
		if (d.length) {
			return Number(d[0].__count) || 0;
		}
		return 0;
	}

	async selectOne<T = Dict>(table: string, where?: Where, opts?: SelectOptions): Promise<T|null> {
		var [s] = await this.select<T>(table, where, {limit: 1, ...opts});
		return s || null;
	}

	async query<T = Dict>(sql: string): Promise<T[]> {
		var [r] = await this.exec(sql);
		return r.rows as T[];
	}
}

export class MysqlTools implements DatabaseTools {

	private _name: string;
	private _load: Map<string, [string, string[], string[]]> = new Map();
	private _db_struct: { [key: string]: DBStruct } = {};
	readonly options: Options;

	constructor(options?: Options) {
		this.options = {...default_options, ...options};
		utils.assert(this.options.database);
		this._name = this.options.database as string;
	}

	has(table: string): boolean {
		return table in this._db_struct;
	}

	async exec(sql: string): Promise<Result[]> {
		var db = this.db();
		try {
			return await new MysqlCRUD(db, this).exec(sql);
		} finally {
			db.close();
		}
	}

	async insert(table: string, row: Dict): Promise<number> {
		var db = this.db();
		try {
			return await new MysqlCRUD(db, this).insert(table, row);
		} finally {
			db.close();
		}
	}

	async delete(table: string, where?: Where): Promise<number> {
		var db = this.db();
		try {
			return await new MysqlCRUD(db, this).delete(table, where);
		} finally {
			db.close();
		}
	}

	async update(table: string, row: Dict, where?: Where): Promise<number> {
		var db = this.db();
		try {
			return await new MysqlCRUD(db, this).update(table, row, where);
		} finally {
			db.close();
		}
	}

	async select<T = Dict>(table: string, where?: Where, opts?: SelectOptions): Promise<T[]> {
		var db = this.db();
		try {
			return await new MysqlCRUD(db, this).select<T>(table, where, opts);
		} finally {
			db.close();
		}
	}

	async selectCount(table: string, where?: Where, opts?: SelectOptions): Promise<number> {
		var db = this.db();
		try {
			return await new MysqlCRUD(db, this).selectCount(table, where, opts);
		} finally {
			db.close();
		}
	}

	async selectOne<T = Dict>(table: string, where?: Where, opts?: SelectOptions): Promise<T|null> {
		var [s] = await this.select<T>(table, where, {limit: 1, ...opts});
		return s || null;
	}

	async query<T = Dict>(sql: string): Promise<T[]> {
		var db = this.db();
		try {
			return await new MysqlCRUD(db, this).query<T>(sql);
		} finally {
			db.close();
		}
	}

	private _Sql(sql: string) {
		return sql
			.replace(/AUTOINCREMENT/img, 'AUTO_INCREMENT')
			.replace(/DEFAULT\s+\(([^\)]+)\)/img, 'DEFAULT $1')
		;
	}

	async load(SQL: string, SQL_ALTER: string[], SQL_INDEXES: string[], id?: string): Promise<void> {
		var _id = id || 'default';
		var _db = this.db();

		utils.assert(!this._load.has(_id), errno.ERR_REPEAT_LOAD_MYSQL, `${id}`);

		// CREATE TABLE `mvp`.`test` (
		// 	`id` INT NOT NULL AUTO_INCREMENT,
		// 	`name` VARCHAR(45) NOT NULL DEFAULT '',
		// 	`key` VARCHAR(45) NOT NULL DEFAULT '',
		// 	PRIMARY KEY (`id`));

		if (SQL)
			await _db.exec(this._Sql(SQL));

		// SELECT table_name FROM information_schema.tables WHERE table_schema='yellowcong' AND table_type='base table'
		// SELECT column_name FROM information_schema.columns WHERE table_schema='yellowcong' AND table_name='sys_user';

		for (let sql of SQL_ALTER) {
			var [,table_name,action,table_column] = 
				sql.match(/^alter\s+table\s+(\w+)\s+(add|drop)\s+(\w+)/i) as RegExpMatchArray;
			var [{rows=[]}] = await _db.exec(
				`select * from information_schema.columns where table_schema='${this._name}'
					and table_name='${table_name}' and column_name = '${table_column}'`
				);
			if (action == 'add') {
				if (!rows.length)
					await _db.exec(this._Sql(sql));
			} else if (rows.length) { // drop
				// await _db.exec(sql);
			}
		}

		// SHOW INDEX FROM information_schema.tables where Key_name = '0'

		for (let sql of SQL_INDEXES) {
			var [,,name,table] = sql.match(
				/^create\s+(unique\s+)?index\s+(\w+)\s+on\s+(\w+)/i) as RegExpMatchArray;
			var [{rows=[]}] = await _db.exec(
				`show index from ${table} where Key_name = '${name}'`);
			if (!rows.length) {
				await _db.exec(sql);
			}
		}

		// SELECT * FROM information_schema.tables WHERE table_schema='mvp' and table_type='base table';
		// SELECT * FROM information_schema.columns WHERE table_schema='mvp' and table_name='callback_url';
		var _db_struct = this._db_struct;

		var [{rows=[]}] = await _db.exec(
				`select * from information_schema.tables where table_schema='${this._name}' and table_type='BASE TABLE'`);
		for (let {TABLE_NAME} of rows) {
			if (!utils.config.fastStart || !_db_struct[TABLE_NAME]) {
				var struct: DBStruct = _db_struct[TABLE_NAME] = { names: [], columns: {} };
				var [{rows:columns = []}] = await _db.exec(
						`select * from information_schema.columns where table_schema='${this._name}' and table_name='${TABLE_NAME}'`);
				for (var column of columns) {
					struct.names.push(column.COLUMN_NAME);
					struct.columns[column.COLUMN_NAME] = column as any;
				}
			}
		}

		_db.close();

		this._load.set(_id, [SQL, SQL_ALTER, SQL_INDEXES]);
	}

	async scope<T = any>(cb: (db: DatabaseCRUD, self: DatabaseTools)=>Promise<T>): Promise<T> {
		var db = this.db();
		var crud = new MysqlCRUD(db, this);
		try {
			return await cb(crud, this);
		} finally {
			db.close();
		}
	}

	async transaction<T = any>(cb: (db: DatabaseCRUD, self: DatabaseTools)=>Promise<T>): Promise<T> {
		var db = this.db();
		var crud = new MysqlCRUD(db, this);
		var r: T;
		try {
			await db.transaction();
			r = await cb(crud, this);
			await db.commit();
			return r;
		} catch(err) {
			await db.rollback();
			throw err;
		} finally {
			db.close();
		}
	}

	db(): Database {
		return new Mysql(this.options);
	}

}