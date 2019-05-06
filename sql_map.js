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

var local_cache = {};
var original_handles = {};
var original_files = {};
var REG = /\{(.+?)\}/g;

/**
 * @createTime 2012-01-18
 * @author xuewen.chu <louis.tru@gmail.com>
 */
var private$transaction = util.class('private$transaction', {

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

		for (var {name,methods} of host.m_shortcuts) {
			this.dao[name] = new Shortcuts(this, name, methods);
		}
	},

	/**
	 * @func get(name, param)
	 */
	get: function(name, param, opts) {
		return funcs.get(this.map, this.db, 1, name, param, opts);
	},

	/**
	 * @func gets(name, param)
	 */
	gets: function(name, param, opts) {
		return funcs.gets(this.map, this.db, 1, name, param, opts);
	},

	/**
	 * @func post(name, param)
	 */
	post: function(name, param, opts) {
		return funcs.post(this.map, this.db, 1, name, param, opts);
	},

	/**
	 * @func query(name, param, cb)
	 */
	query: function(name, param, opts) {
		return funcs.query(this.map, this.db, 1, name, param, opts);
	},

	/**
	 * commit transaction
	 */
	commit: function() {
		this.db.commit();
		this.db.close();
	},

	/**
	 * rollback transaction
	 */
	rollback: function() {
		this.db.rollback();
		this.db.close();
	},

});

function read_original_handles(self, original_path) {

	var doc = new xml.Document();
	doc.load(fs.readFileSync(original_path + '.xml').toString('utf8'));
	var ns = doc.getElementsByTagName('map');

	if (!ns.length) {
		throw new Error(name + ' : not map the root element');
	}
	ns = ns.item(0).childNodes;

	var result = {};

	for (var i = 0; i < ns.length; i++) {
		var node = ns.item(i);
		if (node.nodeType === xml.ELEMENT_NODE) {
			var handle = parseMapEl(self, node);
			result[node.tagName] = handle;
			original_handles[original_path + '/' + node.tagName] = handle;
		}
	}
	original_files[original_path] = fs.statSync(original_path + '.xml').mtime;

	return result;
}

function get_original_handle(self, name) {
	var handle = self.m_original_handles[name];
	if (handle && !util.dev) {
		return handle;
	}

	var handle_name = path.basename(name);
	var original_path = path.resolve(self.original, path.dirname(name));

	if (original_path in original_files) {
		if (util.dev) {
			if (fs.statSync(original_path + '.xml').mtime != original_files[original_path]) {
				read_original_handles(self, original_path);
			}
		}
	} else {
		read_original_handles(self, original_path);
	}

	self.m_original_handles[name] = handle = 
		original_handles[original_path + '/' + handle_name];
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

/**
 * @createTime 2012-01-18
 * @author xuewen.chu <louis.tru@gmail.com>
 */
function parseMapEl(self, el) {
	var ls = [];
	var obj = { __t__: el.tagName, __ls__: ls };
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
				ls.push(parseMapEl(self, node));
				break;
			case xml.TEXT_NODE:
			case xml.CDATA_SECTION_NODE:
				ls.push(node.nodeValue);
				break;
		}
	}
	return obj;
}

// exec script
function exec(self, exp, param) {
	return util._eval(`(function (ctx){with(ctx){return(${exp})}})`)(param);
}

//format sql
function format(self, sql, param) {
	return sql.replace(REG, function (all, exp) {
		return db.escape(exec(self, exp, param));
	});
}

//join map
function joinMap(self, item, param) {

	var name = item.name;
	var value = param[name];

	if (!value) {
		return '';
	}
	var ls = Array.toArray(value);
	
	for (var i = 0, l = ls.length; i < l; i++) {
		ls[i] = db.escape(ls[i]);
	}
	return ls.join(item.value || '');
}

//if map
function ifMap(self, item, param) {

	var exp = item.exp;
	var name = item.name;
	var prepend = item.prepend;

	if (exp) {
		if (!exec(self, exp, param)) {
			return null;
		}
	}
	else if (name) {
		if (name[0] == '!') {
			if (param[name.substr(1)] !== undefined) {
				return null;
			}
		} else if (param[name] === undefined) {
			return null;
		}
	}

	var sql = lsMap(self, item.__ls__, param);

	return { prepend: prepend, sql: sql };
}

//ls map
function lsMap(self, ls, param) {

	var result = [];
	for (var i = 0, l = ls.length; i < l; i++) {
		var item = ls[i];
		var type = item.__t__;

		if (typeof item == 'string') {
			item = format(self, item, param).trim();
			if (item) {
				result.push(' ' + item);
			}
			continue;
		}

		if (type == 'if') {
			item = ifMap(self, item, param);
			if (item && item.sql) {
				var prepend = result.length ? (item.prepend || '') + ' ' : '';

				result.push(' ' + prepend + item.sql);
			}
		}
		else if (type == 'join') {
			result.push(joinMap(self, item, param));
		}
	}
	return result.join(' ');
}

//get map object
function getMap(self, name, param) {
	var map = get_original_handle(self, name);
	var i = ifMap(self, map, param);

	map.sql = i ? '{0} {1}'.format(i.prepend || '', i.sql) : '';
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

	param = new Proxy(Object.assign(Object.create(global), param), {
		get:(target, name)=>target[name],
		has:()=>1,
	});

	try {
		var map = Object.assign(getMap(self, name, param), options);
		var cacheTime = parseInt(map.cacheTime) || 0;
		var sql = map.sql;
		var key;

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
				cb(null, data);
			}
		}

		if (type == 'get') { // use cache
			if (cacheTime > 0) {
				key = util.hash('get:' + sql);
				if (self.memcached) {
					memcached.shared.get(key, function (err, data) {
						if (err) {
							console.err(err);
						}
						if (data) {
							cb(err, data);
						} else {
							db.query(sql, handle);
						}
					});
				} else {
					var c = local_cache[key];
					if (c) {
						cb(null, c.data);
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

var funcs = {

	get: function(map, db, is_t, name, param, opts) {
		return new Promise((resolve, reject)=> {
			query(map, db, is_t, 'get', name, function(err, data) {
				if (err) {
					reject(err);
				} else {
					var [{rows}] = data;
					resolve(rows ? (rows[0] || null) : null);
				}
			}, param, opts);
		});
	},

	gets: function(map, db, is_t, name, param, opts) {
		return new Promise((resolve, reject)=> {
			query(map, db, is_t, 'get', name, function(err, data) {
				if (err) {
					reject(err);
				} else {
					var [{rows}] = data;
					resolve(rows || null);
				}
			}, param, opts);
		});
	},

	post: function(map, db, is_t, name, param, opts) {
		return new Promise((resolve, reject)=> {
			query(map, db, is_t, 'post', name, function(err, data) {
				if (err) {
					reject(err);
				} else {
					resolve(data[0]);
				}
			}, param, opts);
		});
	},

	query: function(map, db, is_t, name, param, opts) {
		return new Promise((resolve, reject)=> {
			query(map, db, is_t, 'query', name, function(err, data) {
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

		fs.readdirSync(this.original).forEach(e=>{
			if (path.extname(e) == '.xml') {
				var name = path.basename(e);
				name = name.substr(0, name.length - 4);
				var handles = read_original_handles(this, this.original + '/' + name);
				var methods = [];
				for (let [method,{type}] of Object.entries(handles)) {
					type = type || method.indexOf('select') >= 0 ? 'get': 'post';
					type = type == 'get'? 'gets': 'post';
					methods.push([method, type]);
				}
				this.dao[name] = new Shortcuts(this, name, methods);
				this.m_shortcuts.push({name, methods});
			}
		});
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
		* @return {private$transaction}
		*/
	transaction: function(cb) {
		util.assert(cb);
		util.assert(util.isAsync(cb));

		var tr = new private$transaction(this);

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
