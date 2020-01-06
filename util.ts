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

var id = 10;
var currentTimezone = new Date().getTimezoneOffset() / -60; // 当前时区
var AsyncFunctionConstructor = (async function() {}).constructor;
var scopeLockQueue = new Map();

function isAsync(func: any): boolean {
	return func && func.constructor === AsyncFunctionConstructor;
}

class obj_constructor {}

function clone_object(new_obj: any, obj: any): any {
	for (var name of Object.getOwnPropertyNames(obj)) {
		var property = <PropertyDescriptor>Object.getOwnPropertyDescriptor(obj, name);
		if (property.writable) {
			new_obj[name] = clone(property.value);
		}//else {
			// Object.defineProperty(new_obj, name, property);
		//}
	}
	return new_obj;
}

/**
 * @fun clone # 克隆一个Object对像
 * @arg obj {Object} # 要复制的Object对像
 * @arg {Object}
 */
function clone(obj: any): any {
	if (obj && typeof obj == 'object') {
		var new_obj: any = null, i;

		switch (obj.constructor) {
			case Object:
				new_obj = {};
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

/**
 * @func extend(obj, extd)
 */
function extend(obj: any, extd: any): any {
	if (extd.__proto__ && extd.__proto__ !== Object.prototype)
		extend(obj, extd.__proto__);
	for (var i of Object.getOwnPropertyNames(extd)) {
		if (i != 'constructor') {
			var desc = <PropertyDescriptor>Object.getOwnPropertyDescriptor(extd, i);
			desc.enumerable = false;
			Object.defineProperty(obj, i, desc);
		}
	}
	return obj;
}

/**
 * Empty function
 */
function noop() {}

/**
 * @func isNull(value)
 */
function isNull(value: any): boolean {
	return value === null || value === undefined
}

/**
 * @fun extendClass #  EXT class prototype objects
 */
function extendClass(cls: Function, ...extds: Function[]) {
	var proto = cls.prototype;
	for (var extd of extds) {
		if (extd instanceof Function) {
			extd = extd.prototype;
		}
		extend(proto, extd);
	}
	return cls;
}

async function scopeLockDequeue(mutex: any): Promise<void> {
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

/**
 * @func scopeLock(mutex, cb)
 */
function scopeLock(mutex: any, cb: ()=>void): Promise<void> {
	assert(mutex, 'Bad argument');
	assert(typeof cb == 'function', 'Bad argument');
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
	self = get(names.join('.'), self);
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
function fixRandom(arg: number, ...args: number[]): number {
	if (!args.length)
		return 0;
	var total = arg;
	var argus = [arg];
	var len = args.length;
	for (var i = 0; i < len; i++) {
		total += args[i];
		argus.push(total);
	}
	var r = random(0, total - 1);
	for (var i = 0; (i < len); i++) {
		if (r < argus[i])
			return i;
	}
	return 0;
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
function update<T>(obj: T, extd: any): T {
	for (var key in extd) {
		if (key in obj) {
			(<any>obj)[key] = select((<any>obj)[key], extd[key]);
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
function select<T>(default_: T, value: any): T {
	if ( typeof default_ == typeof value ) {
		return <T>value;
	} else {
		return default_;
	}
}

/**
 * @fun equalsClass  # Whether this type of sub-types
 * @arg baseclass {class}
 * @arg subclass {class}
 */
function equalsClass(baseclass: Function, subclass: Function): boolean {
	if (!baseclass || !subclass || !subclass.prototype)
		return false;
	if (baseclass === subclass)
		return true;
	
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

/**
 * @fun assert
 */
function assert(condition: any, code?: ErrnoCode | number | string, ...args: string[]): void {
	if (condition)
		return;
	if (Array.isArray(code)) { // ErrnoCode
		throw Error.new(code);
	} else {
		var errno: ErrnoCode;
		if (typeof code == 'number') {
			errno = [code, 'assert fail, unforeseen exceptions'];
		} else {
			errno = [-30009, String.format(String(code), ...args)];
		}
		throw Error.new(errno);
	}
}

/**
 * @func sleep()
 */
function sleep<T>(time: number, defaultValue?: T): Promise<T> {
	return new Promise((ok, err)=>setTimeout(()=>ok(defaultValue), time));
}

interface PromiseExecutor<T> {
	(resolve: (value?: T)=>void, reject: (reason?: any)=>void, promise: Promise<T>): Promise<void> | void;
}

export class PromiseNx<T extends any> extends Promise<T> {
	protected m_executor?: PromiseExecutor<T>;
	constructor(executor?: (resolve: (value?: T)=>void, reject: (reason?: any)=>void, promise: Promise<T>)=>any) {
		var _resolve: any;
		var _reject: any;

		super(function(resolve: (value?: T)=>void, reject: (reason?: any)=>void) {
			_resolve = resolve;
			_reject = reject;
		});

		this.m_executor = executor;

		try {
			var r = this.executor(_resolve, _reject);
			if (r instanceof Promise) {
				r.catch(_reject);
			}
		} catch(err) {
			_reject(err);
		}
	}

	executor(resolve: (value?: T)=>void, reject: (reason?: any)=>void) {
		if (this.m_executor) {
			return this.m_executor(resolve, reject, this);
		} else {
			throw Error.new('executor undefined');
		}
	}

}

/**
 * @func promise(executor)
 */
function promise<T extends any>(executor: (resolve: (value?: T)=>void, reject: (reason?: any)=>void, promise: Promise<T>)=>any) {
	return new PromiseNx<T>(executor) as Promise<T>;
}

export default {
	// _util
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
	// _pkgutil
	timezone: currentTimezone,
	resolve: _pkg.resolve,
	isAbsolute: _pkg.isAbsolute,
	get options() { return _pkg.options },
	get config() { return _pkg.config },
	dev: _pkg.dev,
	// util
	isAsync,
	get id() { return id++ },
	clone,
	extend,
	noop,
	isNull,
	extendClass,
	scopeLock,
	get,
	set,
	del,
	random,
	fixRandom,
	filter,
	update,
	select,
	equalsClass,
	assert,
	sleep,
	PromiseNx,
	promise,
}
