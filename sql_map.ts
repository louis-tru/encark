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

import util from './util';
import * as path from 'path';
import Document, {
	NODE_TYPE, Element, Node, Attribute, CDATASection
} from './xml';
import db, {Database} from './db';
import * as fs from './fs';
// import { type } from 'os';
var {Mysql} = require('./mysql');
// var memcached = require('./memcached');
var memcached: any = {};

const {Model,Collection} = require('./model');

const local_cache: Any = {};
const original_handles: Any<_MethodInfo> = {};
const original_files: Any<Date> = {};
const REG = /\{(.+?)\}/g;

interface DatabaseConfig {
	port?: number;
	host?: string;
	user?: string;
	password?: string;
	database?: string;
}

export interface Config {
	type?: string;
	memcached?: boolean;
	original?: string;
	db?: DatabaseConfig;
}

export const DEFAULT_CONFIG: Config = {
	db: {
		port: 3306,
		host: 'localhost',
		user: 'root',
		password: '',
		database: '',
	},
	type: 'mysql',
	memcached: false,
	original: '',
};

export interface Options {
	where?: string;
}

interface _Params {
	limit?: number | number[];
	group?: string | string[] | Any<string>;
	order?: string | string[] | Any<string>;
	[prop: string]: any;
};

interface INLParams extends _Params {
	group_str?: string;
	order_str?: string;
}

export interface AfterFetchOptions extends Options {
	key?: string,
	table?: string,
	method?:'select',
}

export type AfterFetchParams = [
	string, // table name
	_Params?, // params
	AfterFetchOptions?, // options
];
export type AfterFetchParamsMix = AfterFetchParams | string;

export interface Params extends _Params {
	afterFetch?: AfterFetchParamsMix[];
	fetchTotal?: boolean;
	onlyFetchTotal?: boolean;
}

export type Result = Promise<any>;

export interface DataAccess {
	map: SqlMap;
	readonly dao: DataAccessObject;
	primaryKey(table: string): string;
	get(name: string, param?: Params, opts?: Options): Result;
	gets(name: string, param?: Params, opts?: Options): Result;
	post(name: string, param?: Params, opts?: Options): Result;
	query(name: string, param?: Params, opts?: Options): Result;
}

export interface DataAccessMethod {
	(param?: Params, options?: Options): Result;
	query(param?: Params, options?: Options): Result;
	get(param?: Params, options?: Options): Result;
}

type MethodType = string;

interface MethodsInfo {
	[method: string]: MethodType;
}

interface TablesInfo {
	[table: string]: MethodsInfo;
}

class DataAccessShortcuts extends Proxy<Any<DataAccessMethod>> {
	constructor(access: DataAccess, table: string, info: MethodsInfo) { // handles
		var target: Any<DataAccessMethod> = {};
		super(target, {
			get(target: Any<DataAccessMethod>, methodName: string, receiver: any): any {
				var method: DataAccessMethod = target[methodName];
				if (!method) {
					var type = info[methodName];
					util.assert(type, `Dao table method not defined, ${table}.${methodName}`);
					var fullname = table + '/' + methodName;
					method = <any>((param?: Params, options?: Options)=>(<any>access)[type](fullname, param, options));
					method.query = (param?: Params, options?: Options)=>access.query(fullname, param, options);
					if (type == 'gets') {
						method.get = (param?: Params, options?: Options)=>access.get(fullname, param, options);
					}
					target[methodName] = method;
				}
				return method;
			}
		});
	}
	[method: string]: DataAccessMethod;
}

class DataAccessObject extends Proxy<Any<DataAccessShortcuts>> {
	constructor(access: DataAccess, info: TablesInfo) {
		var target: Any<DataAccessShortcuts> = {};
		super(target, {
			get(target: Any<DataAccessShortcuts>, tableName: string, receiver: any): any {
				var shortcuts = target[tableName];
				if (!shortcuts) {
					var methodsInfo = info[tableName];
					util.assert(methodsInfo, `Dao table not defined, ${tableName}`);
					target[tableName] = new DataAccessShortcuts(access, name, methodsInfo);
				}
				return shortcuts;
			}
		});
	}
	[table: string]: DataAccessShortcuts;
}

/**
 * @createTime 2012-01-18
 * @author xuewen.chu <louis.tru@gmail.com>
 */
class Transaction implements DataAccess {
	private m_on: boolean;
	readonly map: SqlMap;
	readonly db: Database;
	readonly dao: DataAccessObject;

	constructor(host: SqlMap) {
		this.map = host;
		this.db = get_db(host);
		this.db.transaction(); // start transaction
		this.m_on = true;
		this.dao = new DataAccessObject(this, host.tablesInfo);
	}

	primaryKey(table: string) {
		return this.map.primaryKey(table);
	}

	/**
	 * @func get(name, param)
	 */
	get(name: string, param?: Params, opts?: Options) {
		return funcs.get(this.map, this.db, this.m_on, name, param, opts);
	}

	/**
	 * @func gets(name, param)
	 */
	gets(name: string, param?: Params, opts?: Options) {
		return funcs.gets(this.map, this.db, this.m_on, name, param, opts);
	}

	/**
	 * @func post(name, param)
	 */
	post(name: string, param?: Params, opts?: Options) {
		return funcs.post(this.map, this.db, this.m_on, name, param, opts);
	}

	/**
	 * @func query(name, param, cb)
	 */
	query(name: string, param?: Params, opts?: Options) {
		return funcs.query(this.map, this.db, this.m_on, name, param, opts);
	}

	/**
	 * commit transaction
	 */
	commit() {
		this.m_on = false;
		this.db.commit();
		this.db.close();
	}

	/**
	 * rollback transaction
	 */
	rollback() {
		this.m_on = false;
		this.db.rollback();
		this.db.close();
	}

}

type _Child = _El | string;

interface _El {
	method: string;
	child: _Child[];
	props: {
		name?: string;
		exp?: string;
		type?: string;
		default?: string;
		prepend?: string;
		[prop: string]: string | undefined;
	};
}

interface _MethodInfo extends _El {
	is_select: boolean;
	table: string;
	sql: string;
}

interface AbstractSql {
	sql: string[];
	out: number[][];
	group: number[];
	order: number[];
	limit: number[];
}

/**
 * @createTime 2012-01-18
 * @author xuewen.chu <louis.tru@gmail.com>
 */
function parse_map_node(self: SqlMap, el: Element): _El {
	var ls: _Child[] = [];
	var obj: _El = { method: el.tagName, child: ls, props: {} };
	var attributes = el.attributes;

	for (var i = 0, l = attributes.length; i < l; i++) {
		var n = <Attribute>attributes.item(i);
		obj.props[n.name] = n.value;
	}

	var ns = el.childNodes;
	for ( i = 0; i < ns.length; i++ ) {
		var node = <Node>ns.item(i);
		switch (node.nodeType) {
			case NODE_TYPE.ELEMENT_NODE:
				ls.push( parse_map_node(self, <Element>node) );
				break;
			case NODE_TYPE.TEXT_NODE:
			case NODE_TYPE.CDATA_SECTION_NODE:
				ls.push( (<CDATASection>node).nodeValue );
				break;
		}
	}
	return obj;
}

function read_original_mapinfo(self: SqlMap, original_path: string, table: string) {

	var doc = new Document();

	doc.load( fs.readFileSync(original_path + '.xml').toString('utf8') );

	var ns = doc.getElementsByTagName('map');
	if (!ns.length)
		throw new Error(name + ' : not map the root element');

	var map = <Element>ns.item(0); 
	if (!map /*|| map.nodeType != NODE_TYPE.ELEMENT_NODE*/)
		throw new Error('map cannot empty');

	var attrs: Any<string> = {};
	var infos: Any<_MethodInfo> = {};
	var map_attrs = map.attributes;

	for (var i = 0; i < map_attrs.length; i++) {
		var attr = <Attribute>map_attrs.item(i);
		attrs[attr.name] = attr.value;
	}
	attrs.primaryKey = (attrs.primaryKey || `${table}_id`); // default primaryKey

	ns = map.childNodes;

	for (var i = 0; i < ns.length; i++) {
		var node = <Element>ns.item(i);
		if (node.nodeType === NODE_TYPE.ELEMENT_NODE) {
			var info: _MethodInfo = <_MethodInfo>parse_map_node(self, node);
			info.is_select = (info.method.indexOf('select') > -1);
			info.table = table;
			infos[node.tagName] = info;
			original_handles[original_path + '/' + node.tagName] = info;
		}
	}
	original_files[original_path] = fs.statSync(original_path + '.xml').mtime;

	return { attrs, infos };
}

function get_original_mapinfo(self: SqlMap, name: string) {
	var info = <_MethodInfo>(<any>self).m_original_mapinfo[name];
	if (info && !util.dev) {
		return info;
	}

	var table_name = path.dirname(name);
	var method_name = path.basename(name);
	var original_path = path.resolve(self.original, table_name);

	if (original_path in original_files) {
		if (util.dev) {
			if (fs.statSync(original_path + '.xml').mtime != original_files[original_path]) {
				read_original_mapinfo(self, original_path, table_name);
			}
		}
	} else {
		read_original_mapinfo(self, original_path, table_name);
	}

	info = original_handles[original_path + '/' + method_name];
	(<any>self).m_original_mapinfo[name] = info;

	if (!info) {
		throw new Error(name + ' : can not find the map');
	}
	return info;
}

//get db
function get_db(self: SqlMap): Database {
	var db_class = null;
	switch (self.type) {
		case 'mysql' : db_class = Mysql; break;
		case 'mssql' : 
		case 'oracle': 
		default:
			break;
	}
	util.assert(db_class, 'Not supporting database, {0}', self.type);
	return new db_class(self.config);
}

// exec script
function exec(self: SqlMap, exp: string, param: INLParams) {
	return util._eval(`(function (ctx){with(ctx){return(${exp})}})`)(param);
}

//format sql
function format_sql(self: SqlMap, sql: string, param: INLParams) {
	return sql.replace(REG, function (all, exp) {
		return db.escape(exec(self, exp, param));
	});
}

// join map
function parse_sql_join(self: SqlMap, item: _El, param: INLParams, asql: AbstractSql) {
	var name = item.props.name || 'ids';
	var value = param[name];

	if (!value) return '';

	var ls = Array.toArray(value);
	
	for (var i = 0, l = ls.length; i < l; i++) {
		ls[i] = db.escape(ls[i]);
	}
	asql.sql.push(ls.join(item.props.value || ','));
}

// if
function parse_if_sql(self: SqlMap, el: _El, param: INLParams, 
	options: Options, asql: AbstractSql, is_select?: boolean, is_total?: boolean) 
{
	var props = el.props;
	var exp = props.exp;
	var name = props.name;
	var not = name && name[0] == '!';

	if (not) {
		name = (<string>name).substr(1);
	}
	if (props.default && name) {
		param = { [name]: props.default, ...param };
	}

	if (exp) {
		if (!exec(self, exp, param)) {
			return null;
		}
	} else if (name) {
		var val = param[name];
		if (not) {
			if (val !== undefined && val !== null) {
				return null;
			}
		} else if (val === undefined || val === null) {
			return null;
		}
	}

	if (el.child.length) {
		parse_sql_ls(self, el.child, param, options, asql, is_select, is_total);
	} else { // name 
		util.assert(name, 'name prop cannot be empty')
		var val = param[<string>name];
		if (Array.isArray(val)) {
			asql.sql.push(` ${name} in (${val.map(e=>db.escape(e)).join(',')}) `);
		} else {
			val = db.escape(val);
			if (val == "'NULL'" || val == "NULL") {
				asql.sql.push(` ${name} is NULL `);
			} else {
				asql.sql.push(` ${name} = ${val} `);
			}
		}
	}

	return {
		prepend: props.prepend,
	};
}

// ls
function parse_sql_ls(self: SqlMap, ls: _Child[], param: INLParams, 
	options: Options, asql: AbstractSql, is_select?: boolean, is_total?: boolean) 
{

	var result_count = 0;

	for (var i = 0, l = ls.length; i < l; i++) {
		var el = ls[i];
		var end_pos = asql.sql.length;

		if (typeof el == 'string') {
			var sql = format_sql(self, el, param).trim();
			if (sql) {
				asql.sql.push(` ${sql} `);
			}
		} else {
			var tag = el.method;
			if (tag == 'if') {
				var r = parse_if_sql(self, el, param, options, asql, is_select, is_total);
				if (r && asql.sql.length > end_pos) {
					var prepend = result_count ? (r.prepend || '') + ' ' : '';
					asql.sql[end_pos] = ' ' + prepend + asql.sql[end_pos];
				}
			}
			else if (tag == 'where') {
				parse_sql_ls(self, el.child, param, options, asql, is_select, is_total);
				if (asql.sql.length > end_pos) {
					asql.sql[end_pos] = ' where' + asql.sql[end_pos];
					if (options.where) {
						asql.sql[end_pos] += ' ' + options.where;
					}
				} else if (options.where) {
					asql.sql.push(' where ' + options.where.replace(/^.*?(and|or)/i, ''));
				}
			}
			else if (tag == 'join') {
				parse_sql_join(self, el, param, asql);
			} else if (is_select) {
				if (tag == 'out') {
					var value = ` ${el.props.value || '*'} `;
					if (el.child.length) {
						parse_sql_ls(self, el.child, param, options, asql, is_select, is_total);
						if (asql.sql.length > end_pos) {
							asql.out.push([end_pos, asql.sql.length - 1]);
						} else {
							asql.out.push([end_pos, end_pos]);
							asql.sql.push(value);
						}
					} else {
						asql.out.push([end_pos, end_pos]);
						asql.sql.push(value);
					}
				} else if (tag == 'group') {
					let value = param.group_str || el.props.default;
					if (value) {
						asql.group.push(end_pos);
						asql.sql.push(` group by ${value} `);
						if (asql.out.length) {
							var index = asql.out.indexReverse(0)[1];
							asql.sql[index] += ' , count(*) as data_count ';
							asql.out.pop();
						}
					}
				} else if (tag == 'order' && !is_total) {
					let value = param.order_str || el.props.default;
					if (value) {
						asql.order.push(end_pos);
						asql.sql.push(` order by ${value} `);
					}
				} else if (tag == 'limit') {
					let value = Number(param.limit) || Number(el.props.default);
					if (value) {
						asql.limit.push(end_pos);
						asql.sql.push(` limit ${value} `);
					}
				} else {
					//...
				}
			}
		}

		if (asql.sql.length > end_pos) {
			result_count++;
		}
	}
}

// parse sql str
function parseSql(self: SqlMap, name: string, param: _Params, options: Options, is_total?: boolean) {
	var map = get_original_mapinfo(self, name);
	var asql: AbstractSql = { sql: [], out: [], group: [], order: [], limit: [] };

	if (map.is_select) {
		if (param.group) {
			param.group_str = '';
			if (typeof param.group == 'string') {
				param.group_str = param.group;
			} else if (Array.isArray(param.group)) {
				param.group_str = param.group.join(',');
			} else {
				param.group_str = Object.entries(param.group).map((k,v)=>`${k} ${v}`).join(',');
			}
		}

		if (param.order) {
			param.order_str = '';
			if (typeof param.order == 'string') {
				param.order_str = param.order;
			} else if (Array.isArray(param.order)) {
				param.order_str = param.order.join(',');
			} else {
				param.order_str = Object.entries(param.order).map((k,v)=>`${k} ${v}`).join(',');
			}
		}

		if ((<any>param).limit === '0') { // check type
			param.limit = 0;
		}

		if (is_total) {
			param.limit = 1;
			param.order_str = '';
		}
	}

	var r = parse_if_sql(self, map, param, options, asql, map.is_select, is_total);

	if (map.is_select) {

		// limit
		if ( param.limit && !asql.limit.length ) {
			asql.limit.push(asql.sql.length);
			asql.sql.push(` limit ${param.limit}`);
		}

		// order
		if ( param.order_str && !asql.order.length ) {
			if (asql.limit.length) {
				var index = asql.limit.indexReverse(0);
				var sql = asql.sql[index];
				asql.sql[index] = ` order by ${param.order_str} ${sql} `;
				asql.order.push(index);
			} else {
				asql.order.push(asql.sql.length);
				asql.sql.push(` order by ${param.order_str} `);
			}
		}

		// group
		if ( param.group_str && !asql.group.length ) {
			if (asql.order.length) {
				var index = asql.order.indexReverse(0);
				var sql = asql.sql[index];
				asql.sql[index] = ` group by ${param.group_str} ${sql} `;
				asql.group.push(index);
			} else if (asql.limit.length) {
				var index = asql.limit.indexReverse(0);
				var sql = asql.sql[index];
				asql.sql[index] = ` group by ${param.group_str} ${sql} `;
				asql.group.push(index);
			} else {
				asql.group.push(asql.sql.length);
				asql.sql.push(` group by ${param.group_str} `);
			}

			if (asql.out.length) {
				var index = asql.out.indexReverse(0)[1];
				asql.sql[index] += ' , count(*) as data_count ';
				asql.out.pop();
			}
		} else if (is_total) {
			if (asql.out.length) {
				var index = asql.out.indexReverse(0)[1];
				asql.sql[index] += ' , count(*) as data_count ';
				asql.out.pop();
			}
		}

	}

	var sql = asql.sql.join('');
	map.sql = r ? String.format('{0} {1}', r.prepend || '', sql) : '';

	return map;
}

interface LocalCacheData {
	[key: string]: {
		data: any;
		id: any;
		timeout: number;
	}
}

// del cache
// Special attention,
// taking into account the automatic javascript resource management,
// where there is no "This", more conducive to the release of resources
//
function delCache(self: SqlMap, key: string) {
	delete (<any>self).local_cache[key];
}

function setCache(self: SqlMap, key: string, data: any, timeout: number) {
	if (timeout > 0) {
		var c = local_cache[key];
		if (c) {
			clearTimeout(c.id);
		}
		var id = delCache.setTimeout(timeout * 1e3, self, key);
		(<any>self).m_local_cache[key] = { data, id, timeout };
	}
}

interface QueryCallback {
	(err: Error, data: any, table: string): any;
}

//query
function query(
	self: SqlMap, 
	db: Database, 
	is_transaction: boolean, 
	type: string, 
	name: string, 
	cb: QueryCallback, 
	param: _Params, 
	options?: Options, is_total?: boolean
) {

	if (type == 'get') {
		param = { ...param, limit: 1 };
	} else if (type == 'gets') {
		type = 'get';
		param = { limit: 10, ...param };
	} else {
		param = { ...param };
	}

	param = Object.assign(Object.create(global), param);
	param = new Proxy(param, {
		get:(target, name)=>target[name],
		has:()=>true,
	});

	try {
		var map = Object.assign(parseSql(self, name, param, options || {}, is_total), options);
		var cacheTime = parseInt(map.cacheTime) || 0;
		var sql = map.sql, key;
		var table = map.table

		if (util.dev) {
			console.log(sql);
		}

		function handle(err, data) {
			if (!is_transaction) {
				db.close(); // Non transaction, shut down immediately after the query
			}
			if (err) {
				cb(err);
			} else {
				data = data.map(e=>{
					if (e.rows) {
						return { rows: e.rows, fields: Object.keys(e.fields) };
					} else {
						return e;
					}
				});
				if (type == 'get') {
					if (cacheTime > 0) {
						if (self.memcached) {
							memcached.shared.set(key, data, cacheTime);
						} else {
							setCache(self, key, data, cacheTime);
						}
					}
				}
				cb(null, data, table);
			}
		}

		if (type == 'get') { // use cache
			if (cacheTime > 0) {
				key = util.hash('get:' + sql);
				if (self.memcached) {
					memcached.shared.get(key, function(err, data) {
						if (err) {
							console.err(err);
						}
						if (data) {
							cb(err, data, table);
						} else {
							db.query(sql, handle);
						}
					});
				} else {
					var c = local_cache[key];
					if (c) {
						cb(null, c.data, table);
					} else {
						db.query(sql, handle);
					}
				}
			} else {
				db.query(sql, handle);
			}
		} else {
			db.query(sql, handle);
		}
	} catch (err) {
		if (db) {
			if (!is_transaction) {
				db.close();
			}
		}
		cb(err);
	}
}

async function execAfterFetch(self: SqlMap, model: any, afterFetch?: AfterFetchParamsMix[]) {
	if (afterFetch) {
		for (var i of afterFetch) {
			var args: AfterFetchParams = <AfterFetchParams>i;
			if (!Array.isArray(i)) {
				args = [i];
			}
			var [table, ..._args] = args;
			if (table[0] == '@') {
				await model.fetchChild(table.substr(1), ..._args);
			} else {
				await model.fetch(table, ...args);
			}
		}
	}
	return model;
}

const funcs = {

	get: async function(self: SqlMap, db: Database, is_t: boolean, name: string, param?: Params, opts?: Options) {
		var { afterFetch, fetchTotal, onlyFetchTotal, ..._param } = <Params>(param || {});

		var model = await new Promise((resolve, reject)=> {
			query(self, db, is_t, 'get', name, function(err, data, table) {
				if (err) {
					reject(err);
				} else {
					var [{rows}] = data;
					var value = rows ? (rows[0]||null) : null;
					resolve( value ? new Model(value, {dao: self.dao,table}): null );
				}
			}, _param, opts);
		});

		if (model) {
			return await execAfterFetch(self, model, afterFetch);
		} else {
			return model;
		}
	},

	gets: async function(self: SqlMap, db: Database, is_t: boolean, name: string, param?: Params, opts?: Options) {
		var {afterFetch, fetchTotal, onlyFetchTotal, ..._param} = param || {};

		if (fetchTotal || onlyFetchTotal) {
			var table, total = await new Promise((resolve, reject)=> {
				query(self, db, is_t, 'get', name, function(err, data, t) {
					if (err) {
						reject(err);
					} else {
						table = t;
						var [{rows}] = data;
						var value = rows ? (rows[0]||null) : null;
						resolve( value ? value.data_count: 0 );
					}
				}, _param, opts, true);
			});

			if (!total || onlyFetchTotal) {
				return Object.assign(new Collection([], {dao: self.dao, table}), { total });
			}
		}

		var model = await new Promise((resolve, reject)=> {
			query(self, db, is_t, 'gets', name, function(err, data, table) {
				if (err) {
					reject(err);
				} else {
					var [{rows=[]}] = data;
					var dao = self.dao;
					var value = rows.map((e)=>new Model(e,{dao,table}));
					resolve( new Collection(value, {dao,table}) );
				}
			}, _param, opts);
		});

		if (Array.isArray(_param.limit) && _param.limit.length > 1) {
			model.index = Number(_param.limit[0]) || 0;
		}

		if (total) {
			model.total = total;
		}

		if (model.length) {
			return await execAfterFetch(self, model, afterFetch);
		} else {
			return model;
		}
	},

	post: function(self: SqlMap, db: Database, is_t: boolean, name: string, param?: Params, opts?: Options) {
		var {afterFetch, fetchTotal, onlyFetchTotal, ..._param} = param || {};

		return new Promise((resolve, reject)=> {
			query(self, db, is_t, 'post', name, function(err, data) {
				if (err) {
					reject(err);
				} else {
					resolve(data[0]);
				}
			}, _param, opts);
		});
	},

	query: function(self: SqlMap, db: Database, is_t: boolean, name: string, param?: Params, opts?: Options) {
		var {afterFetch, fetchTotal, onlyFetchTotal, ..._param} = param || {};

		return new Promise((resolve, reject)=> {
			query(self, db, is_t, 'query', name, function(err, data) {
				if (err) {
					reject(err);
				} else {
					resolve(data);
				}
			}, _param, opts);
		});
	},

};

export class SqlMap implements DataAccess {

	private m_original_mapinfo: Any<_MethodInfo> = {};
	private m_tables: Any = {};
	private m_local_cache: LocalCacheData = {};
	readonly config: Config;
	readonly tablesInfo: TablesInfo;
	readonly map: SqlMap = this;

	/**
	 * @field {Boolean} is use memcached
	 */
	get memcached() {
		return !!this.config.memcached;
	}

	/**
	 * original xml base path
	 */
	get original() {
		return this.config.original || '';
	}

	get type() {
		return this.config.type || 'mysql'
	}

	readonly dao: DataAccessObject;

	/**
	 * @constructor
	 * @arg [conf] {Object} Do not pass use center server config
	 */ 
	constructor(conf?: Config) {
		this.config = Object.assign({}, DEFAULT_CONFIG, conf);
		this.config.db = Object.assign({}, this.config.db, conf?.db);
		this.tablesInfo = {};

		fs.readdirSync(this.original).forEach(e=>{
			if (path.extname(e) == '.xml') {
				var name = path.basename(e);
				var table = name.substr(0, name.length - 4);
				var {attrs,infos} = read_original_mapinfo(this, this.original + '/' + table, table);
				var methods: MethodsInfo = {};

				for (let [method,{type}] of Object.entries(infos)) {
					type = type || method.indexOf('select') >= 0 ? 'get': 'post';
					type = type == 'get' ? 'gets': 'post';
					methods[method] = type;
				}
				this.tablesInfo[table] = methods
				this.m_tables[table] = attrs;
			}
		});

		this.dao = new DataAccessObject(this, this.tablesInfo);
	}

	primaryKey(table: string) {
		return this.m_tables[table].primaryKey;
	}

	/**
	 * @func get(name, param)
	 */
	get(name: string, param?: Params, opts?: Options) {
		return funcs.get(this, get_db(this), false, name, param, opts);
	}

	/**
	 * @func gets(name, param)
	 */
	gets(name: string, param?: Params, opts?: Options) {
		return funcs.gets(this, get_db(this), false, name, param, opts);
	}

	/**
	 * @func post(name, param)
	 */
	post(name: string, param?: Params, opts?: Options) {
		return funcs.post(this, get_db(this), false, name, param, opts);
	}

	/**
	 * @func query(name, param, cb)
	 */
	query(name: string, param?: Params, opts?: Options) {
		return funcs.query(this, get_db(this), false, name, param, opts);
	}

	/**
		* start transaction
		* @return {Transaction}
		*/
	transaction<R>(cb: (da: DataAccess, dao: DataAccessObject)=>Promise<R>): Promise<R> {
		util.assert(cb);
		var tr = new Transaction(this);
		return cb(tr, tr.dao).then((e: R)=>{
			tr.commit();
			return e;
		}).catch((e:any)=>{
			tr.rollback();
			throw e;
		});
	}
}

var shared: SqlMap | null = null;

export default {

	SqlMap: SqlMap,

	/**
	 * @func setShared
	 */
	setShared: function(sqlmap: SqlMap) {
		shared = sqlmap;
	},

	/**
		* get default dao
		* @return {SqlMap}
		* @static
		*/
	get shared() {
		return shared;
	},
};
