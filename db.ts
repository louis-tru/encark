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

import {EventNoticer} from './event';
import {PacketData} from './mysql/parser';
import {Field} from './mysql/query';

export interface Result extends PacketData {
	rows?: Any[];
	fields?: Any<Field>;
}

export interface Callback {
	(err: Error | null, data?: Result[]): void;
}

export interface Options {
	port?: number;
	host?: string;
	user?: string;
	password?: string;
	database?: string;
}

export const defaultOptions: Options = {
	port: 3306,
	host: 'localhost',
	user: 'root',
	password: '',
	database: '',
};

/**
 * @class Database
 */
export abstract class Database {
	
	readonly options: Options;
	readonly onError = new EventNoticer<Error>('Error', this);

	constructor(options?: Options) {
		this.options = Object.assign({}, defaultOptions, options);
	}

	/**
	 * database statistics
	 */
	abstract statistics(cb: Callback): void;

	/**
	 * @func query()
	 */
	abstract query(sql: string, cb: Callback): void;

	/**
	 * close database connection
	 */
	abstract close(): void;
	
	/**
	 * srart transaction
	 */
	abstract transaction(): void;
	
	/**
	 * commit transaction
	 */
	abstract commit(): void;
	
	/**
	 * rollback transaction and clear sql command queue
	 */
	abstract rollback(): void;

	/**
	 * exec query database
	 */
	exec(sql: string): Promise<any> {
		return new Promise((resolve, reject)=>{
			this.query(sql, function(err: any, data: any) {
				err ? reject(err): resolve(data);
			});
		});
	}

}

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

export default {
	Database, escape,
};