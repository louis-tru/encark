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

/**
 * escape sql param
 */
export function escape(param: any) {
	if (param === undefined || param === null)
		return 'NULL';

	var type = typeof param;
	if (type == 'boolean' || type == 'number')
		return param + '';

	if (param instanceof Date) 
		return param.toString("'yyyy-MM-dd hh:mm:ss'");

	if (type == 'object')
		param = JSON.stringify(param);

	return "'" + (param + '').replace(/[\0\n\r\b\t\\\'\"\x1a]/g, function (s) {
		switch (s) {
			case "\0": return "\\0";
			case "\n": return "\\n";
			case "\r": return "\\r";
			case "\b": return "\\b";
			case "\t": return "\\t";
			case "\x1a": return "\\Z";
			default: return "\\" + s;
		}
	}) + "'";
}

export interface Result extends Dict {
	rows?: Dict[];
	fields?: Dict<{ name: string, type: number }>;
	affectedRows?: number;
	insertId?: number;
}

/**
 * @class DatabaseTools
 */
export interface Database {

	/**
	 * database statistics
	 */
	statistics(): Promise<any>;

	/**
	 * exec query database
	 */
	exec(sql: string): Promise<Result[]>;

	/**
	 * close database connection
	 */
	close(): void;
	
	/**
	 * srart transaction
	 */
	transaction(): Promise<void>;
	
	/**
	 * commit transaction
	 */
	commit(): Promise<void>;
	
	/**
	 * rollback transaction and clear sql command queue
	 */
	rollback(): Promise<void>;

}

export type Where = Dict | string;

export interface SelectOptions {
	group?: string;
	order?: string;
	limit?: number | number[];
}

export interface DatabaseCRUD {
	exec(sql: string): Promise<Result[]>;
	insert(table: string, row: Dict): Promise<number>;
	delete(table: string, where?: Where): Promise<number>;
	update(table: string, row: Dict, where?: Where): Promise<number>;
	select<T = Dict>(table: string, where?: Where, opts?: SelectOptions): Promise<T[]>;
	selectOne<T = Dict>(table: string, where?: Where, opts?: SelectOptions): Promise<T|null>;
	query<T = Dict>(sql: string): Promise<T[]>;
}

export interface DatabaseTools extends DatabaseCRUD {
	has(table: string): boolean;
	load(SQL: string, SQL_ALTER: string[], SQL_INDEXES: string[], id?: string): Promise<void>;
	scope<T = any>(cb: (db: DatabaseCRUD, self: DatabaseTools)=>Promise<T>): Promise<T>;
	transaction<T = any>(cb: (db: DatabaseCRUD, self: DatabaseTools)=>Promise<T>): Promise<T>;
	db(): Database;
}
