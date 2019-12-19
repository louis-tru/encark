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

/**************************************************************************/

import _util from './_util';
import _pkg from './_pkgutil';
import {List} from './_event';

/**************************************************************************/

var currentTimezone = new Date().getTimezoneOffset() / -60; // 当前时区
// var default_throw = Function.prototype.throw;
var id = 10;
// var extendObject = _pkg.extendObject;
// var assign = Object.assign;
var AsyncFunctionConstructor = (async function() {}).constructor;
var scopeLockQueue = new Map();

function is_async(func: any) {
	return func && func.constructor === AsyncFunctionConstructor;
}

//
// util
// ======
//
function obj_constructor() { }

function clone_object(new_obj, obj) {
	var names = Object.getOwnPropertyNames(obj);
	for (var i = 0, len = names.length; i < len; i++) {
		var name = names[i];
		var property = Object.getOwnPropertyDescriptor(obj, name);
		if (property.writable) {
			new_obj[name] = clone(property.value);
		}
		//else {
			// Object.defineProperty(new_obj, name, property);
		//}
	}
	return new_obj;
}

function clone(obj) {
	if (obj && typeof obj == 'object') {
		var new_obj = null, i;
		
		switch (obj.constructor) {
			case Object:
				new_obj = { };
				for(i in obj) {
					new_obj[i] = clone(obj[i]);
				}
				return new_obj;
			case Array:
				new_obj = [ ];
				for (i = 0; i < obj.length; i++) {
					new_obj[i] = clone(obj[i]);
				}
				return new_obj;
			case Date:
				return new Date(obj.valueOf());
			default:
				obj_constructor.prototype = obj.constructor.prototype;
				new_obj = new obj_constructor();
				return clone_object(new_obj, obj);
		}
	}
	return obj;
}

function extend(obj, extd) {
	if (extd.__proto__ && extd.__proto__ !== Object.prototype) {
		extend(obj, extd.__proto__);
	}
	for (var i of Object.getOwnPropertyNames(extd)) {
		if (i != 'constructor') {
			var desc = Object.getOwnPropertyDescriptor(extd, i);
			desc.enumerable = false;
			Object.defineProperty(obj, i, desc);
		}
	}
	return obj;
}

function extendClass(cls, ...extds) {
	var proto = cls.prototype;
	for (var extd of extds) {
		if (extd instanceof Function) {
			extd = extd.prototype;
		}
		extend(proto, extd);
	}
	return cls;
}

async function scopeLockDequeue(mutex) {
	var item, queue = scopeLockQueue.get(mutex);
	while( item = queue.shift() ) {
		try {
			item.resolve(await item.cb());
		} catch(err) {
			item.reject(err);
		}
	}
	scopeLockQueue.delete(mutex);
}

function scopeLock(mutex, cb) {
	exports.assert(mutex, 'Bad argument');
	exports.assert(typeof cb == 'function', 'Bad argument');
	return new Promise((resolve, reject)=>{
		if (scopeLockQueue.has(mutex)) {
			scopeLockQueue.get(mutex).push({resolve, reject, cb});
		} else {
			scopeLockQueue.set(mutex, new List().push({resolve, reject, cb}).host);
			scopeLockDequeue(mutex); // dequeue
		}
	})
}

	/**
	 * @fun get(name[,self]) # get object value by name
	 * @arg name {String} 
	 * @arg [self] {Object}
	 * @ret {Object}
	 */
	function get(name: string, self: any): any {
		var names = name.split('.');
		var item;
		while ( (item = names.shift()) ) {
			self = self[item];
			if (!self)
				return self;
		}
		return self;
	}

/**
* @fun set(name,value[,self]) # Setting object value by name
* @arg name {String} 
* @arg value {Object} 
* @arg [self] {Object}
* @ret {Object}
*/
function set(name: string, value: any, self: any): any {
	self = self || global;
	var item = null;
	var names = name.split('.');
	var _name = <string>names.pop();
	while ( (item = names.shift()) ){
		self = self[item] || (self[item] = {});
	}
	self[_name] = value;
	return self;
}

/**
 * @fun def(name[,self]) # Delete object value by name
 * @arg name {String} 
 * @arg [self] {Object}
 */
function del(name: string, self: any): void {
	var names = name.split('.');
	var _name = <string>names.pop();
	self = get(names.join('.'), self || global);
	if (self)
		delete self[_name];
}

/**
 * @fun random # 创建随机数字
 * @arg [start] {Number} # 开始位置
 * @arg [end] {Number}   # 结束位置
 * @ret {Number}
 */
function random(start: number = 0, end: number = 1E8): number {
	if (start == end)
		return start;
	var r = Math.random();
	start = start || 0;
	end = end || (end===0?0:1E8);
	return Math.floor(start + r * (end - start + 1));
}

/**
* @fun fixRandom # 固定随机值,指定几率返回常数
* @arg args.. {Number} # 输入百分比
* @ret {Number}
*/
function fixRandom(...args: number[]): number {
	var total = 0;
	var argus = [];
	var i = 0;
	var len = args.length;
	for (; (i < len); i++) {
		var e = args[i];
		total += e;
		argus.push(total);
	}
	var r = random(0, total - 1);
	for (i = 0; (i < len); i++) {
		if (r < argus[i])
			return i;
	}
}

/**
* @fun filter # object filter
* @arg obj {Object}  
* @arg exp {Object}  #   filter exp
* @arg non {Boolean} #   take non
* @ret {Object}
*/
function filter(obj: any, exp: string[] | ((key: string, value: any)=>boolean), non: boolean = false): any {
	var rev: any = {};
	var isfn = (typeof exp == 'function');
	
	if (isfn || non) {
		for (var key in obj) {
			var value = obj[key];
			var b: boolean = isfn ? (<any>exp)(key, value) : ((<string[]>exp).indexOf(key) != -1);
			if (non ? !b : b)
				rev[key] = value;
		}
	} else {
		for (var item of <string[]>exp) {
			item = String(item);
			if (item in obj)
				rev[item] = obj[item];
		}
	}
	return rev;
}

/**
 * @fun update # update object property value
 * @arg obj {Object}      #        need to be updated for as
 * @arg extd {Object}    #         update object
 * @arg {Object}
 */
function update(obj, extd) {
	for (var key in extd) {
		if (key in obj) {
			obj[key] = exports.select(obj[key], extd[key]);
		}
	}
	return obj;
}

/**
 * @fun select
 * @arg default {Object} 
 * @arg value   {Object} 
 * @reg {Object}
 */
function select(default_, value) {
	if ( typeof default_ == typeof value ) {
		return value;
	} else {
		return default_;
	}
}

/**
 * @fun equalsClass  # Whether this type of sub-types
 * @arg baseclass {class}
 * @arg subclass {class}
 */
function equalsClass(baseclass, subclass) {
	if (!baseclass || !subclass || !subclass.prototype) return false;
	if (baseclass === subclass) return true;
	
	var prototype = baseclass.prototype;
	var subprototype = subclass.prototype;
	if (!subprototype) return false;
	var obj = subprototype.__proto__;
	
	while (obj) {
		if (prototype === obj)
			return true;
		obj = obj.__proto__;
	}
	return false;
}
	
export default {
	unrealized: _util.unrealized,
	version: _util.version,
	addNativeEventListener: _util.addNativeEventListener,
	removeNativeEventListener: _util.removeNativeEventListener,
	garbageCollection: _util.garbageCollection,
	runScript: _util.runScript,
	transformJsx: _util.transformJsx,
	transformJs: _util.transformJs,
	hash: _util.hash,
	_eval: _util._eval,
	nextTick: _util.nextTick,
	platform: _util.platform,
	haveNode: _util.haveNode,
	haveNgui: _util.haveNgui,
	haveWeb: _util.haveWeb,
	argv: _util.argv,
	webFlags: _util.webFlags,

	timezone: currentTimezone,
	resolve: _pkg.resolve,
	isAbsolute: _pkg.isAbsolute,
	extendObject: _pkg.extendObject,
	get options() { return _pkg.options },
	get config() { return _pkg.config },
	dev: _pkg.dev,

	/**
	 * Empty function
	 */
	noop: function() {},

	/**
	 * @func isAsync(func)
	 */
	isAsync: function(func: any): boolean {
		return is_async(func);
	},

	/**
	 * @func isNull(value)
	 */
	isNull: function(value: any): boolean {
		return value === null || value === undefined
	},

	/**
	 * @func extend(obj, extd)
	 */
	extend: extend,

	/**
	 * @get id
	 */
	get id() { return id++ },

	random: random,
	fixRandom: fixRandom,

	get: get,
	set: set,
	del: del,

	/**
	 * @fun clone # 克隆一个Object对像
	 * @arg obj {Object} # 要复制的Object对像
	 * @arg {Object}
	 */
	clone: clone,







	/**
	 * @fun extendClass #  EXT class prototype objects
	 */
	extendClass: extendClass,
	
	/**
	 * @fun assert
	 */
	assert: function(is, code) {
		if (is) {
			return;
		}
		if (Array.isArray(code)) {
			throw Error.new(code);
		} else {
			var args = Array.toArray(arguments);
			if (typeof code == 'number') {
				args = args.slice(2);
			} else {
				args = args.slice(1);
				code = -2;
			}
			if (args.length) {
				throw Error.new(String.format.apply(null, args), code);
			} else {
				throw Error.new('assert fail, unforeseen exceptions', code);
			}
		}
	},

	/**
	 * @func sleep()
	 */
	sleep: function(time, defaultValue) {
		return new Promise((ok, err)=>setTimeout(e=>ok(defaultValue), time));
	},

	/**
	 * @func scopeLock(mutex, cb)
	 */
	scopeLock: scopeLock,

	/**
	 * @func promise(cb)
	 */
	promise: function(cb) {
		return new Promise(function(resolve, reject) {
			try {
				var r = cb(resolve, reject);
				if (r instanceof Promise) {
					r.catch(reject);
				}
			} catch(err) {
				reject(err);
			}
		});
	},

	// @end
});
