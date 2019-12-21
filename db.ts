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

/**
 * @class Database
 */
export class Database {
	
	// @public:

	/**
	 * host
	 * @type {String}
	 */
	host: string = 'localhost';

	/**
	 * prot
	 * @type {Number}
	 */
	port: number = 0;
	
	/**
	 * username
	 * @type {String}
	 */
	user: string = 'root';
	
	/**
	 * password
	 * @type {String}
	 */
	password: string = 'root';
	
	/**
	 * database name
	 * @type {String}
	 */
	database: string = '';

	/**
	 * @event onError
	 */
	onError = new EventNoticer('Error', this);

	/**
	 * database statistics
	 * @method statistics
	 * @param {Function} cb
	 */
	statistics() {}

	/**
	 * @func query()
	 */
	query(sql: string, cb: any) {}

	/**
	 * exec query database
	 * @method exec
	 * @param  {String}   sql
	 */
	exec(sql: string): Promise<any> {
		return new Promise((resolve, reject)=>{
			this.query(sql, function(err: any, data: any) {
				err ? reject(err): resolve(data);
			});
		});
	}

	/**
	 * close database connection
	 * @method close
	 */
	close() {}
	
	/**
	 * srart transaction
	 * @method transaction
	 */
	transaction() {}
	
	/**
	 * commit transaction
	 * @method commit
	 */
	commit() {}
	
	/**
	 * rollback transaction and clear sql command queue
	 * @method rollback
	 */
	rollback() {}
	// @end
}

export default {

	Database: Database,

	/**
	 * escape sql param
	 * @param  {String} param
	 * @return {String}
	 * @static
	 */
	escape(param: any) {

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
	// @end
};

