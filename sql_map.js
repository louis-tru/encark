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

var util = require('./util');
var path = require('path');
var xml = require('./xml');
var {Mysql} = require('./mysql');
var db = require('./db');
var memcached = require('./memcached');
var fs = require('./fs');
var {Model,Collection} = require('./model');

var local_cache = {};
var original_handles = {};
var original_files = {};
var REG = /\{(.+?)\}/g;

/**
 * @createTime 2012-01-18
 * @author xuewen.chu <louis.tru@gmail.com>
 */
var Transaction = util.class('Transaction', {

	/**
	 * @field map {SqlMap}
	 */
	map: null,
	
	/**
	 * @field {Database} database
	 */
	db: null,

	/**
	 * @constructor
	 */
	constructor: function(host) {
		this.map = host;
		this.db = get_db(host);
		this.db.transaction(); // start transaction
		this.dao = { $: this };
		this.m_on = 1;

		for (var {name,methods} of host.m_shortcuts) {
			this.dao[name] = new Shortcuts(this, name, methods);
		}
	},

	primaryKey(table) {
		return this.map.primaryKey(table);
	},

	/**
	 * @func get(name, param)
	 */
	get: function(name, param, opts) {
		return funcs.get(this.map, this.db, this.m_on, name, param, opts);
	},

	/**
	 * @func gets(name, param)
	 */
	gets: function(name, param, opts) {
		return funcs.gets(this.map, this.db, this.m_on, name, param, opts);
	},

	/**
	 * @func post(name, param)
	 */
	post: function(name, param, opts) {
		return funcs.post(this.map, this.db, this.m_on, name, param, opts);
	},

	/**
	 * @func query(name, param, cb)
	 */
	query: function(name, param, opts) {
		return funcs.query(this.map, this.db, this.m_on, name, param, opts);
	},

	/**
	 * commit transaction
	 */
	commit: function() {
		this.m_on = 0;
		this.db.commit();
		this.db.close();
	},

	/**
	 * rollback transaction
	 */
	rollback: function() {
		this.m_on = 0;
		this.db.rollback();
		this.db.close();
	},

});

/**
 * @createTime 2012-01-18
 * @author xuewen.chu <louis.tru@gmail.com>
 */
function parse_map_node(self, el) {
	var ls = [];
	var obj = { __t: el.tagName, __ls: ls };
	var ns = el.attributes;

	for (var i = 0, l = ns.length; i < l; i++) {
		var n = ns.item(i);
		obj[n.name] = n.value;
	}

	ns = el.childNodes;
	for ( i = 0; i < ns.length; i++ ) {
		var node = ns.item(i);
		
		switch (node.nodeType) {
			case xml.ELEMENT_NODE:
				ls.push(parse_map_node(self, node));
				break;
			case xml.TEXT_NODE:
			case xml.CDATA_SECTION_NODE:
				ls.push(node.nodeValue);
				break;
		}
	}
	return obj;
}

function read_original_handles(self, original_path, table) {

	var doc = new xml.Document();
	doc.load(fs.readFileSync(original_path + '.xml').toString('utf8'));
	var ns = doc.getElementsByTagName('map');

	if (!ns.length) {
		throw new Error(name + ' : not map the root element');
	}

	var map = ns.item(0);
	var attrs = {};
	var handles = {};
	var map_attrs = map.attributes;

	for (var i = 0; i < map_attrs.length; i++) {
		var attr = map_attrs.item(i);
		attrs[attr.name] = attr.value;
	}
	attrs.primaryKey = (attrs.primaryKey || `${table}_id`);

	ns = ns.item(0).childNodes;

	for (var i = 0; i < ns.length; i++) {
		var node = ns.item(i);
		if (node.nodeType === xml.ELEMENT_NODE) {
			var handle = parse_map_node(self, node);
			handle.__is_select = (handle.__t.indexOf('select') > -1);
			handle.__table = table;
			handles[node.tagName] = handle;
			original_handles[original_path + '/' + node.tagName] = handle;
		}
	}
	original_files[original_path] = fs.statSync(original_path + '.xml').mtime;

	return { attrs, handles };
}

function get_original_handle(self, name) {
	var handle = self.m_original_handles[name];
	if (handle && !util.dev) {
		return handle;
	}

	var handle_name = path.basename(name);
	var table_name = path.dirname(name);
	var original_path = path.resolve(self.original, table_name);

	if (original_path in original_files) {
		if (util.dev) {
			if (fs.statSync(original_path + '.xml').mtime != original_files[original_path]) {
				read_original_handles(self, original_path, table_name);
			}
		}
	} else {
		read_original_handles(self, original_path, table_name);
	}

	handle = original_handles[original_path + '/' + handle_name];
	self.m_original_handles[name] = handle;

	if (!handle) {
		throw new Error(name + ' : can not find the map');
	}
	return handle;
}

//get db
function get_db(self) {
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
function exec(self, exp, param) {
	return util._eval(`(function (ctx){with(ctx){return(${exp})}})`)(param);
}

//format sql
function format_sql(self, sql, param) {
	return sql.replace(REG, function (all, exp) {
		return db.escape(exec(self, exp, param));
	});
}

// join map
function parse_sql_join(self, item, param, result) {

	var name = item.name || 'ids';
	var value = param[name];

	if (!value) {
		return '';
	}
	var ls = Array.toArray(value);
	
	for (var i = 0, l = ls.length; i < l; i++) {
		ls[i] = db.escape(ls[i]);
	}
	return result.sql.push(ls.join(item.value || ','));
}

// if
function parse_if_sql(self, node, param, result, is_select) {
	var exp = node.exp;
	var name = node.name;
	var not = name && name[0] == '!';
	if (not)
		name = name.substr(1);

	if (exp) {
		if (!exec(self, exp, param)) {
			return null;
		}
	} else if (name) {
		if (not) {
			if (param[name] !== undefined) {
				return null;
			}
		} else if (param[name] === undefined) {
			return null;
		}
	}

	if (node.__ls.length) {
		parse_sql_ls(self, node.__ls, param, result, is_select);
	} else {
		var val = param[name];
		if (Array.isArray(val)) {
			result.sql.push(` ${name} in (${val.map(e=>db.escape(e)).join(',')}) `);
		} else {
			result.sql.push(` ${name} = ${db.escape(val)} `);
		}
	}

	return {
		prepend: node.prepend,
	};
}

// ls
function parse_sql_ls(self, ls, param, result, is_select) {

	var result_count = 0;

	for (var i = 0, l = ls.length; i < l; i++) {
		var node = ls[i];
		var tag = node.__t;
		var end_pos = result.sql.length;

		if (typeof node == 'string') {
			var sql = format_sql(self, node, param).trim();
			if (sql) {
				result.sql.push(` ${sql} `);
			}
		} else {
			if (tag == 'if') {
				var r = parse_if_sql(self, node, param, result, is_select);
				if (r && result.sql.length > end_pos) {
					var prepend = result_count ? (r.prepend || '') + ' ' : '';
					result.sql[end_pos] = ' ' + prepend + result.sql[end_pos];
				}
			} else if (tag == 'join') {
				parse_sql_join(self, node, param, result);
			} else if (is_select) {
				if (tag == 'out') {
					var value = ` ${node.value || '*'} `;
					if (node.__ls.length) {
						parse_sql_ls(self, node.__ls, param, result, is_select);
						if (result.sql.length > end_pos) {
							result.out.push([end_pos, result.sql.length - 1]);
						} else {
							result.out.push([end_pos, end_pos]);
							result.sql.push(value);
						}
					} else {
						result.out.push([end_pos, end_pos]);
						result.sql.push(value);
					}
				} else if (tag == 'group') {
					var value = param.group_str || node.default;
					if (value) {
						result.group.push(end_pos);
						result.sql.push(` group by ${value} `);
						if (result.out.length) {
							var index = result.out.last(0)[1];
							result.sql[index] += ' ,count(*) as data_count ';
							result.out.pop();
						}
					}
				} else if (tag == 'order') {
					var value = param.order_str || node.default;
					if (value) {
						result.order.push(end_pos);
						result.sql.push(` order by ${value} `);
					}
				} else if (tag == 'limit') {
					var value = Number(param.limit) || Number(node.default);
					if (value) {
						result.limit.push(end_pos);
						result.sql.push(` limit ${value} `);
					}
				} else {
					//...
				}
			}
		}

		if (result.sql.length > end_pos) {
			result_count++;
		}
	}
}

// parse sql str
function parseSql(self, name, param) {
	var map = get_original_handle(self, name);
	var result = { sql: [], out: [], group: [], order: [], limit: [] };

	if (map.__is_select) {
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

		if (param.limit === '0') {
			param.limit = 0;
		} else if (Array.isArray(param)) {
			param.limit = param.join(',');
		}
	}

	var r = parse_if_sql(self, map, param, result, map.__is_select);

	if (map.__is_select) {

		// limit
		if ( param.limit && !result.limit.length ) {
			result.limit.push(result.sql.length);
			result.sql.push(` limit ${param.limit}`);
		}

		// order
		if ( param.order_str && !result.order.length ) {
			if (result.limit.length) {
				var index = result.limit.last(0);
				var sql = result.sql[index];
				result.sql[index] = ` order by ${param.order_str} ${sql} `;
				result.order.push(index);
			} else {
				result.order.push(result.sql.length);
				result.sql.push(` order by ${param.order_str} `);
			}
		}

		// group
		if ( param.group_str && !result.group.length ) {
			if (result.order.length) {
				var index = result.order.last(0);
				var sql = result.sql[index];
				result.sql[index] = ` group by ${param.group_str} ${sql} `;
				result.group.push(index);
			} else if (result.limit.length) {
				var index = result.limit.last(0);
				var sql = result.sql[index];
				result.sql[index] = ` group by ${param.group_str} ${sql} `;
				result.group.push(index);
			} else {
				result.group.push(result.sql.length);
				result.sql.push(` group by ${param.group_str} `);
			}

			if (result.out.length) {
				var index = result.out.last(0)[1];
				result.sql[index] += ' ,count(*) as data_count ';
				result.out.pop();
			}
		}
	}

	var sql = result.sql.join('');
	map.sql = r ? '{0} {1}'.format(r.prepend || '', sql) : '';

	return map;
}

// del cache
//
// Special attention,
// taking into account the automatic javascript resource management,
// where there is no "This", more conducive to the release of resources
//
function delCache(key) {
	delete local_cache[key];
}

function setCache(self, key, data, timeout) {
	if (timeout > 0) {
		var c = local_cache[key];
		if (c) {
			clearTimeout(c.id);
		}
		var id = delCache.setTimeout(timeout * 1e3, key);
		local_cache[key] = { data, id, timeout };
	}
}

function noop(err) {
	if (err) throw err;
}

function select_cb(param, cb) {
	return (typeof param == 'function') ? param : (typeof cb != 'function' ? noop : cb);
}

//query
function query(self, db, is_transaction, type, name, cb, param, options) {

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
		has:()=>1,
	});

	try {
		var map = Object.assign(parseSql(self, name, param), options);
		var cacheTime = parseInt(map.cacheTime) || 0;
		var sql = map.sql, key;
		var table = map.__table

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

async function execAfterFetch(self, model, afterFetch) {
	if (afterFetch) {
		for (var args of afterFetch) {
			if (!Array.isArray(args)) {
				args = [args];
			}
			var table = args.shift();

			if (table[0] == '@') {
				await model.fetchChild(table.substr(1), ...args);
			} else {
				await model.fetch(table, ...args);
			}
		}
	}
	return model;
}

var funcs = {

	get: async function(self, db, is_t, name, param, opts) {
		var {afterFetch, ...param} = param || {};
		var model = await new Promise((resolve, reject)=> {
			query(self, db, is_t, 'get', name, function(err, data, table) {
				if (err) {
					reject(err);
				} else {
					var [{rows}] = data;
					var value = rows ? (rows[0]||null) : null;
					resolve( value ? new Model(value, {dao: self.dao,table}): null );
				}
			}, param, opts);
		});
		return await execAfterFetch(self, model, afterFetch);
	},

	gets: async function(self, db, is_t, name, param, opts) {
		var {afterFetch, ...param} = param || {};
		var model = await new Promise((resolve, reject)=> {
			query(self, db, is_t, 'gets', name, function(err, data, table) {
				if (err) {
					reject(err);
				} else {
					var [{rows=[]}] = data;
					var dao = self.dao;
					var value = rows.map(e=>new Model(e,{dao,table}));
					resolve( new Collection(value, {dao,table}) );
				}
			}, param, opts);
		});
		return await execAfterFetch(self, model, afterFetch);
	},

	post: function(self, db, is_t, name, param, opts) {
		return new Promise((resolve, reject)=> {
			query(self, db, is_t, 'post', name, function(err, data) {
				if (err) {
					reject(err);
				} else {
					resolve(data[0]);
				}
			}, param, opts);
		});
	},

	query: function(self, db, is_t, name, param, opts) {
		return new Promise((resolve, reject)=> {
			query(self, db, is_t, 'query', name, function(err, data) {
				if (err) {
					reject(err);
				} else {
					resolve(data);
				}
			}, param, opts);
		});
	},

};

/**
 * @class Shortcuts
 */
class Shortcuts {
	constructor(host, name, methods) { // handles
		this.m_host = host;
		this.m_name = name;

		for (let [method,type] of methods) {
			let fullname = name + '/' + method;
			this[method] = (param, options)=>host[type](fullname, param, options);
			this[method].query = (param, options)=>host.query(fullname, param, options);
			if (type == 'gets') {
				this[method].get = (param, options)=>host.get(fullname, param, options);
			}
		}
	}
};

var SqlMap = util.class('SqlMap', {

	//private:
	m_original_handles: null,

	//public:
	/**
	 * @field {String} database type
	 */
	type: 'mysql',

	/**
	 * @field {Boolean} is use memcached
	 */
	memcached: false,

	/**
	 * 
	 * @field {Object} db config info
	 */
	db: null,

	/**
	 * original xml base path
	 * @type {String}
	 */
	original: '',

	/**
	 * @constructor
	 * @arg [conf] {Object} Do not pass use center server config
	 */ 
	constructor: function(conf) {
		this.m_original_handles = {};
		if (conf) {
			util.update(this, conf);
			this.config = {
				port: 3306,
				host: 'localhost',
				user: 'root',
				password: '',
				database: '',
				...this.config,
			};
			this.config = this.db;
		} else {
			// use center server config
			// on event
			throw new Error('use center server config');
		}

		this.m_shortcuts = [];
		this.dao = { $: this };
		this.m_tables = {};

		fs.readdirSync(this.original).forEach(e=>{
			if (path.extname(e) == '.xml') {
				var name = path.basename(e);
				var table = name.substr(0, name.length - 4);
				var {attrs,handles} = read_original_handles(this, this.original + '/' + table, table);
				var methods = [];
				for (let [method,{type}] of Object.entries(handles)) {
					type = type || method.indexOf('select') >= 0 ? 'get': 'post';
					type = type == 'get'? 'gets': 'post';
					methods.push([method, type]);
				}
				this.dao[table] = new Shortcuts(this, table, methods);
				this.m_shortcuts.push({name:table, methods});
				this.m_tables[table] = attrs;
			}
		});
	},

	primaryKey(table) {
		return this.m_tables[table].primaryKey;
	},

	/**
	 * @func get(name, param)
	 */
	get: function(name, param, opts) {
		return funcs.get(this, get_db(this), 0, name, param, opts);
	},

	/**
	 * @func gets(name, param)
	 */
	gets: function(name, param, opts) {
		return funcs.gets(this, get_db(this), 0, name, param, opts);
	},

	/**
	 * @func post(name, param)
	 */
	post: function(name, param, opts) {
		return funcs.post(this, get_db(this), 0, name, param, opts);
	},

	/**
	 * @func query(name, param, cb)
	 */
	query: function(name, param, opts) {
		return funcs.query(this, get_db(this), 0, name, param, opts);
	},

	/**
		* start transaction
		* @return {Transaction}
		*/
	transaction: function(cb) {
		util.assert(cb);
		util.assert(util.isAsync(cb));

		var tr = new Transaction(this);

		return cb(tr, tr.dao).then(e=>{
			tr.commit();
			return e;
		}).catch(e=>{
			tr.rollback();
			throw e;
		});
	},

});

var shared = null;

module.exports = {

	SqlMap: SqlMap,

	/**
	 * @func setShared
	 */
	setShared: function(sqlmap) {
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
