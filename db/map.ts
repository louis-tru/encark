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
import * as path from 'path';
import Document, { NODE_TYPE, Element, Node, Attribute, CDATASection } from '../xml';
import { Database, Result, escape } from '.';
import { default_options as mysqlDefaultOptions, Options as MysqlOptions } from '../mysql'
import * as fs from '../fs';
import {Model,Collection, FetchOptions, ModelBasic, ID} from './model';
import {Mysql} from '../mysql';

const original_handles: Dict<_MethodInfo> = {};
const original_files: Dict<Date> = {};
const REG = /\{(.+?)\}/g;
const _eval = (s:any)=>globalThis.eval(s);

export interface Config {
	type?: string;
	redis?: Dict;
	original?: string;
	db?: MysqlOptions;
}

export const defaultConfig: Config = {
	db: mysqlDefaultOptions,
	type: 'mysql',
	redis: undefined,
	original: '',
};

export interface Options {
	where?: string;
	cacheTime?: number;
}

export interface QueryParams {
	limit?: number | number[];
	group?: string | string[] | Dict<string>;
	order?: string | string[] | Dict<string>;
	[prop: string]: any;
};

export type FetchParams = [
	string, // table name
	QueryParams?, // params
	FetchOptions?, // options
];

export type FetchParamsMix = FetchOptions | string;

interface INLParams extends QueryParams {
	group_str?: string;
	order_str?: string;
}

export interface Params extends QueryParams {
	afterFetch?: FetchParamsMix[];
	fetchTotal?: boolean;
	onlyFetchTotal?: boolean;
}

export interface DataSource {
	map: SqlMap;
	readonly dao: DataAccessObject;
	primaryKey(table: string): string;
	get<T = Dict>(name: string, param?: Params, opts?: Options): Promise<Model<T> | null>;
	gets<T = Dict>(name: string, param?: Params, opts?: Options): Promise<Collection<T>>;
	post(name: string, param?: Params, opts?: Options): Promise<Result>;
	exec(name: string, param?: Params, opts?: Options): Promise<Result[]>;
}

export interface DataAccessMethod {
	<T = Collection | Result>(param?: Params, options?: Options): Promise<T>;
	exec(param?: Params, options?: Options): Promise<Result[]>;
	get(param?: Params, options?: Options): Promise<Model | null>;
}

type MethodType = string;

interface MethodsInfo {
	[method: string]: MethodType;
}

interface TablesInfo {
	[table: string]: MethodsInfo;
}

export class DataAccessShortcuts extends Proxy<Dict<DataAccessMethod>> {
	constructor(ds: DataSource, table: string, info: MethodsInfo) { // handles
		var target: Dict<DataAccessMethod> = {};
		super(target, {
			get(target: Dict<DataAccessMethod>, methodName: string, receiver: any): any {
				var method: DataAccessMethod = target[methodName];
				if (!method) {
					var type = info[methodName];
					utils.assert(type, `Dao table method not defined, ${table}.${methodName}`);
					var fullname = table + '/' + methodName;
					method = <any>((param?: Params, options?: Options)=>(<any>ds)[type](fullname, param, options));
					method.exec = (param?: Params, options?: Options)=>ds.exec(fullname, param, options);
					if (type == 'gets') {
						method.get = (param?: Params, options?: Options)=>ds.get(fullname, param, options);
					}
					target[methodName] = method;
				}
				return method;
			}
		});
	}
	[method: string]: DataAccessMethod;
}

export class DataAccessObject extends Proxy<Dict<DataAccessShortcuts>> {
	constructor(ds: DataSource, info: TablesInfo) {
		var target: Dict<DataAccessShortcuts> = {};
		super(target, {
			get(target: Dict<DataAccessShortcuts>, tableName: string, receiver: any): any {
				var shortcuts = target[tableName];
				if (!shortcuts) {
					var methodsInfo = info[tableName];
					utils.assert(methodsInfo, `Dao table not defined, ${tableName}`);
					target[tableName] = new DataAccessShortcuts(ds, tableName, methodsInfo);
				}
				return shortcuts;
			}
		});
	}
	[table: string]: DataAccessShortcuts;
}

/**
 * @createTime 2012-01-18
 * @author blue.chu <louis.tru@gmail.com>
 */
class Transaction implements DataSource {
	private m_on: boolean;
	readonly map: SqlMap;
	readonly db: Database;
	readonly dao: DataAccessObject;

	constructor(host: SqlMap) {
		this.map = host;
		this.db = host.build();
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
	get<T = Dict>(name: string, param?: Params, opts?: Options) {
		return funcs.get<T>(this.map, this.db, this.m_on, name, param, opts);
	}

	/**
	 * @func gets(name, param)
	 */
	gets<T = Dict>(name: string, param?: Params, opts?: Options) {
		return funcs.gets<T>(this.map, this.db, this.m_on, name, param, opts);
	}

	/**
	 * @func post(name, param)
	 */
	post(name: string, param?: Params, opts?: Options) {
		return funcs.post(this.map, this.db, this.m_on, name, param, opts);
	}

	/**
	 * @func exec(name, param, cb)
	 */
	exec(name: string, param?: Params, opts?: Options) {
		return funcs.exec(this.map, this.db, this.m_on, name, param, opts);
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
	cacheTime: number;
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
 * @author blue.chu <louis.tru@gmail.com>
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
		throw new Error(original_path + ' : not map the root element');

	var map = <Element>ns.item(0); 
	if (!map /*|| map.nodeType != NODE_TYPE.ELEMENT_NODE*/)
		throw new Error('map cannot empty');

	var attrs: Dict<string> = {};
	var infos: Dict<_MethodInfo> = {};
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
	if (info && !utils.debug) {
		return info;
	}

	var table_name = path.dirname(name);
	var method_name = path.basename(name);
	var original_path = path.resolve(self.original, table_name);

	if (original_path in original_files) {
		if (utils.debug) {
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
function NewDB(self: SqlMap): Database {
	var db_class = null;
	switch (self.type) {
		case 'mysql' : 
			db_class = Mysql; break;
		case 'mssql' : 
		case 'oracle': 
		default:
			break;
	}
	utils.assert(db_class, `Not supporting database, ${self.type}`);
	return new (<any>db_class)(self.config.db);
}

// exec script
function execExp(self: SqlMap, exp: string, param: INLParams) {
	return _eval(`(function (g, ctx){with(ctx){return(${exp})}})`)(globalThis, param);
}

//format sql
function format_sql(self: SqlMap, sql: string, param: INLParams) {
	return sql.replace(REG, function (all, exp) {
		return escape(execExp(self, exp, param));
	});
}

// join map
function parse_sql_join(self: SqlMap, item: _El, param: INLParams, asql: AbstractSql) {
	var name = item.props.name || 'ids';
	var value = param[name];

	if (!value) return '';

	var ls = Array.toArray(value);
	
	for (var i = 0, l = ls.length; i < l; i++) {
		ls[i] = escape(ls[i]);
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
		if (!execExp(self, exp, param)) {
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
		utils.assert(name, 'name prop cannot be empty')
		var val = param[<string>name];
		if (Array.isArray(val)) {
			asql.sql.push(` ${name} in (${val.map(e=>escape(e)).join(',')}) `);
		} else {
			val = escape(val);
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
function parseSql(self: SqlMap, name: string, param: QueryParams, options: Options, is_total?: boolean) {
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
	map.cacheTime = Number(options.cacheTime || map.props.cacheTime);

	return map;
}

export interface Cache {
	get(key: string): Promise<Result[] | null>;
	set(key: string, data: Result[], cacheTime?: number): Promise<boolean>;
	remove(key: string): Promise<boolean>;
	close(): void;
}

interface LocalCacheData {
	data: Result[];
	timeout: number;
}

export class LocalCache implements Cache {
	private m_host: SqlMap;
	private m_cache: Map<string, LocalCacheData>;
	private m_tntervalid: any;

	constructor(host: SqlMap) {
		this.m_host = host;
		this.m_cache = new Map();
		this.m_tntervalid = setInterval(()=>this._ClearTimeout(), 3e4/*30s*/);
	}

	async get(key: string): Promise<Result[] | null> {
		var data = this.m_cache.get(key);
		if (data) {
			if (data.timeout > Date.now()) {
				this.m_cache.delete(key);
				return null;
			}
			return data.data;
		}
		return null;
	}

	async set(key: string, data: Result[], cacheTime: number = 0): Promise<boolean> {
		this.m_cache.set(key, {
			data: data,
			timeout: cacheTime ? Date.now() + cacheTime: 0 
		});
		return true;
	}

	async remove(key: string): Promise<boolean> {
		this.m_cache.delete(key);
		return true;
	}

	_ClearTimeout() {
		var now = Date.now();
		var cache = this.m_cache;
		for (var [key, data] of cache) {
			if (data.timeout) {
				if (data.timeout < now) {
					cache.delete(key); // clear data
				}
			}
		}
	}

	close(): void {
		clearInterval(this.m_tntervalid)
		this.m_cache = new Map();
	}
}

interface ExecCallback {
	(err: Error | null, data: Result[], table?: string): any;
}

// exec query
function exec(
	self: SqlMap, 
	db: Database, 
	is_transaction: boolean, 
	type: string, 
	name: string, 
	cb: ExecCallback, 
	param: QueryParams, 
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

	// param = new Proxy(param, {
	// 	get: (target: QueryParams, name: string)=>target[name],
	// 	has:()=>true,
	// });

	try {
		var map = parseSql(self, name, param, options || {}, is_total);
		var cacheTime = map.cacheTime;
		var sql = map.sql, key: string;
		var table = map.table

		if (utils.debug) {
			console.log(sql);
		}

		function handlePromise(p: Promise<any>) {
			p.then(function (data: Result[]) {
				if (type == 'get') {
					if (cacheTime > 0) {
						self.cache.set(key, <Result[]>data, cacheTime);
					}
				}
				cb(null, <Result[]>data, table);
			}).catch(function (err) {
				cb(err, [], table);
			}).finally(function () {
				if (!is_transaction) {
					db.close(); // Non transaction, shut down immediately after the query
				}
			});
		}

		if (type == 'get') { // use cache
			if (cacheTime > 0) {
				key = utils.hash('get:' + sql);
				self.cache.get(key).then(e=>{
					if (e) {
						cb(null, e, table);
					} else {
						handlePromise(db.exec(sql));
					}
				}).catch(e=>{
					console.warn('encark#map#exec', e);
					handlePromise(db.exec(sql));
				});
			} else {
				handlePromise(db.exec(sql));
			}
		} else {
			handlePromise(db.exec(sql));
		}
	} catch (err: any) {
		if (db) {
			if (!is_transaction) {
				db.close();
			}
		}
		cb(err, []);
	}
}

async function execAfterFetch(self: SqlMap, model: ModelBasic, afterFetch?: FetchParamsMix[]) {
	if (afterFetch) {
		for (var i of afterFetch) {
			var args: FetchParams = <FetchParams>i;
			if (!Array.isArray(i)) {
				args = [<string>i];
			}
			var [table, ..._args] = args;
			if (table[0] == '@') {
				await model.fetchChild(table.substr(1), ..._args);
			} else {
				await model.fetch(table, ..._args);
			}
		}
	}
}

const funcs = {

	get: async function<T = Dict>(self: SqlMap, db: Database, is_t: boolean, name: string, param?: Params, opts?: Options): Promise<Model<T> | null> {
		var { afterFetch, fetchTotal, onlyFetchTotal, ..._param } = <Params>(param || {});

		var model = await new Promise((resolve: (r: Model<T> | null)=>void, reject)=>{
			exec(self, db, is_t, 'get', name, function(err, data, table) {
				if (err) {
					reject(err);
				} else {
					var [{rows}] = data;
					var value = rows ? (rows[0]||null) : null;
					resolve( value ? new Model<T>(value, {dataSource: self, table }): null );
				}
			}, _param, opts);
		});

		if (model) {
			await execAfterFetch(self, model, afterFetch);
		}
		return model;
	},

	gets: async function<T = Dict>(self: SqlMap, db: Database, is_t: boolean, name: string, param?: Params, opts?: Options): Promise<Collection<T>> {
		var {afterFetch, fetchTotal, onlyFetchTotal, ..._param} = param || {};
		var total, table;

		if (fetchTotal || onlyFetchTotal) {
			total = await new Promise((resolve: (r: number)=>void, reject)=> {
				exec(self, db, is_t, 'get', name, function(err, data, t) {
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
				return Object.assign(new Collection<T>([], {dataSource: self, table}), { total });
			}
		}

		var col = await new Promise((resolve: (r: Collection<T>)=>void, reject)=> {
			exec(self, db, is_t, 'gets', name, function(err, data, table) {
				if (err) {
					reject(err);
				} else {
					var [{rows=[]}] = data;
					var value = rows.map((e)=>new Model<T>(<T>e, { dataSource: self, table }));
					resolve( new Collection<T>(value, {dataSource: self, table }) );
				}
			}, _param, opts);
		});

		if (Array.isArray(_param.limit) && _param.limit.length > 1) {
			col.index = Number(_param.limit[0]) || 0;
		}

		if (total) {
			col.total = total;
		}

		if (col.length) {
			await execAfterFetch(self, col, afterFetch);
		}
		return col;
	},

	post: function(self: SqlMap, db: Database, is_t: boolean, name: string, param?: Params, opts?: Options): Promise<Result> {
		var {afterFetch, fetchTotal, onlyFetchTotal, ..._param} = param || {};

		return new Promise((resolve: (r: Result)=>void, reject)=> {
			exec(self, db, is_t, 'post', name, function(err, data) {
				if (err) {
					reject(err);
				} else {
					resolve((<Result[]>data)[0]);
				}
			}, _param, opts);
		});
	},

	exec: function(self: SqlMap, db: Database, is_t: boolean, name: string, param?: Params, opts?: Options): Promise<Result[]> {
		var {afterFetch, fetchTotal, onlyFetchTotal, ..._param} = param || {};

		return new Promise((resolve: (r: Result[])=>void, reject)=> {
			exec(self, db, is_t, 'query', name, function(err, data) {
				if (err) {
					reject(err);
				} else {
					resolve(data);
				}
			}, _param, opts);
		});
	},

};

export class SqlMap implements DataSource {

	private m_original_mapinfo: Dict<_MethodInfo> = {};
	private m_tables: Dict = {};
	private m_cache: Cache;
	private _builder: typeof NewDB;
	readonly config: Config;
	readonly tablesInfo: TablesInfo;
	readonly map: SqlMap = this;

	build() {
		return this._builder(this);
	}

	/**
	 * @field {Cache} is use cache
	 */
	get cache() {
		return this.m_cache;
	}

	set cache(value: Cache) {
		this.m_cache = value;
	}

	/**
	 * original xml base path
	 */
	get original() {
		return this.config.original || '';
	}

	get type() {
		return this.config.type || 'mysql';
	}

	readonly dao: DataAccessObject;

	/**
	 * @constructor
	 * @arg [conf] {Object} Do not pass use center server config
	 */ 
	constructor(conf?: Config, builder?: typeof NewDB) {
		this.config = Object.assign({}, defaultConfig, conf);
		this.config.db = Object.assign({}, defaultConfig.db, conf?.db);
		this.tablesInfo = {};
		this._builder = builder || NewDB;

		fs.readdirSync(this.original).forEach(e=>{
			if (path.extname(e) == '.xml') {
				var name = path.basename(e);
				var table = name.substr(0, name.length - 4);
				var {attrs,infos} = read_original_mapinfo(this, this.original + '/' + table, table);
				var methods: MethodsInfo = {};

				for (let [method,{props: {type}}] of Object.entries(infos)) {
					type = type || method.indexOf('select') >= 0 ? 'get': 'post';
					type = type == 'get' ? 'gets': 'post';
					methods[method] = type;
				}
				this.tablesInfo[table] = methods
				this.m_tables[table] = attrs;
			}
		});

		this.dao = new DataAccessObject(this, this.tablesInfo);
		this.m_cache = new LocalCache(this);
	}

	primaryKey(table: string) {
		return this.m_tables[table].primaryKey;
	}

	/**
	 * @func get(name, param)
	 */
	get<T = Dict>(name: string, param?: Params, opts?: Options) {
		return funcs.get<T>(this, this.build(), false, name, param, opts);
	}

	/**
	 * @func gets(name, param)
	 */
	gets<T = Dict>(name: string, param?: Params, opts?: Options) {
		return funcs.gets<T>(this, this.build(), false, name, param, opts);
	}

	/**
	 * @func post(name, param)
	 */
	post(name: string, param?: Params, opts?: Options) {
		return funcs.post(this, this.build(), false, name, param, opts);
	}

	/**
	 * @func query(name, param, cb)
	 */
	exec(name: string, param?: Params, opts?: Options) {
		return funcs.exec(this, this.build(), false, name, param, opts);
	}

	/**
		* start transaction
		* @return {Transaction}
		*/
	transaction<R>(cb: (ds: DataSource, dao: DataAccessObject)=>Promise<R>): Promise<R> {
		utils.assert(cb);
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