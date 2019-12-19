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

interface RequireFunction {
	(require: string): any;
}

declare var __requireNgui__: RequireFunction;
declare var __webpack_require__: RequireFunction;

interface ObjectConstructor {
	hashCode(obj: any): number;
}

interface Object {
	hashCode(): number;
}

type TimeoutResult = any; // NodeJS.Timeout | number;

interface Function {
	hashCode(): number;
	setTimeout(this: Function, time: number, ...argArray: any[]): TimeoutResult;
}

interface CallableFunction extends Function {
	setTimeout<A extends any[], R>(this: (...args: A) => R, time: number, ...args: A): TimeoutResult;
}

interface ArrayConstructor {
	toArray(obj: any, index?: number, end?: number): any[];
}

interface Array<T> {
	hashCode(): number;
	deleteOf(value: T): T[];
	indexReverse(index: number): T;
}

interface StringConstructor {
	format(str: string, ...args: any[]): string;
}

interface String {
	hashCode(): number;
}

interface Number {

	hashCode(): number;

	/**
	* 转换为前后固定位数的字符串
	* @arg before {Number}  小数点前固定位数
	* @arg [after] {Number} 小数点后固定位数
	*/
	toFixedBefore(before: number, after?: number): string;

}

interface Boolean {
	hashCode(): number;
}

interface DateConstructor {

	/**
	 * @field current timezone
	 */
	currentTimezone: number;

	/**
	 * 解析字符串为时间
	 * <pre><code>
	 * var i = '2008-02-13 01:12:13';
	 * var date = Date.parseDate(i); //返回的新时间
	 * </code></pre>
	 * @func parseDate(str[,format[,timezone]])
	 * @arg str {String}        要解析的字符串
	 * @arg [format] {String}   date format   default yyyyMMddhhmmssfff
	 * @arg [timezone] {Number} 要解析的时间所在时区,默认为当前时区
	 * @ret {Date}              返回新时间
	 */
	parseDate(date_str: string, format?: string, timezone?: number): Date;

	/**
		* 格式化时间戳(单位:毫秒)
		* <pre><code>
		* var time_span = 10002100;
		* var format = 'dd hh:mm:ss';
		* var str = Date.formatTimeSpan(time_span, format); // str = '0 2:46:42'
		* var format = 'dd天hh时mm分ss秒';
		* var str = Date.formatTimeSpan(time_span, format); // str = '0天2时46分42秒'
		* format = 'hh时mm分ss秒';
		* str = Date.formatTimeSpan(time_span, format); // str = '2时46分42秒'
		* format = 'mm分ss秒';
		* str = Date.formatTimeSpan(time_span, format); // str = '166分42秒'
		* </code></pre>
		* @func formatTimeSpan(ts[,format])
		* @arg ts {Number} 要格式化的时间戳
		* @arg [format]  {String} 要格式化的时间戳格式
		* @ret {String} 返回的格式化后的时间戳
		*/
	formatTimeSpan(time_span: number, format?: string): string;

}

interface Date {

	hashCode(): number;

	/**
	 * @func add 给当前Date时间追加毫秒,改变时间值
	 * @arg ms {Number}  要添追加的毫秒值
	 * @ret {Date}
	 */
	add(ms: number): Date;

	/**
		* 给定日期格式返回日期字符串
		* <pre><code>
		* var date = new Date();
		* var format = 'yyyy-MM-dd hh:mm:ss.fff';
		* var dateStr = date.toString(format); // dateStr的值为 '2008-12-10 10：32：23'
		* format = 'yyyy-MM-dd hh:mm:ss';
		* dateStr = date.toString(format); // dateStr的值为 '2008-12-10 10：32：23'
		* format = 'yyyy/MM/dd';
		* dateStr = date.toString(format); // dateStr的值为 '2008/12/10'
		* format = 'yyyy-MM-dd hh';
		* dateStr = date.toString(format); // dateStr的值为 '2008-12-10 10'
		* </code></pre>
		* @func date_to_string(date[,foramt])
		* @arg date {Date}
		* @arg [format] {String} 要转换的字符串格式
		* @ret {String} 返回格式化后的时间字符串
		*/
	toString(format?: string, timezone?: number): string;

}

interface ErrorDescribe {
	name?: string;
	message?: string;
	error?: string;
	description?: string;
	errno?: number;
	code?: string;
	path?: string;
	syscall?: string;
	stack?: string;
	[prop: string]: any;
}

type ErrnoCode = [number/*errno*/, string/*message*/, string?/*description*/];
type ErrorNewArg = ErrnoCode | Error | string | ErrorDescribe;

interface ErrorConstructor {
	'new'(err: ErrorNewArg, errno?: number): Error;
	toJSON(err: Error): any;
}

interface Error {
	description?: string;
	errno?: number;
	code?: any;
	path?: string;
	syscall?: string;
	stack?: string;
	[prop: string]: any;
}

(function() {

if (Date.formatTimeSpan !== undefined)
	return;

// ----------------------------- impl -----------------------------

var currentTimezone = new Date().getTimezoneOffset() / -60;
var G_slice = Array.prototype.slice;
var G_hash_code_id = 1;
var G_hash_code_set = new WeakSet();
var dateToString = Date.prototype.toString;

/**
 * @fun ext_class #  EXT class prototype objects
 */
function definePropertys(obj: any, extd: any): void {
	for (var i in extd) {
		var desc = <PropertyDescriptor>Object.getOwnPropertyDescriptor(extd, i);
		desc.enumerable = false;
		Object.defineProperty(obj, i, desc);
	}
}

function hashCode(obj: any): number {
	return 	obj === null ? -1354856:
					obj === undefined ? -3387255: obj.hashCode();
}

// index of
function indexOf(str: string, str1: string): number {
	var index = str.indexOf(str1);
	return index > -1 ? index : Infinity;
}

definePropertys(Object, {
	hashCode: hashCode,
});

definePropertys(Object.prototype, {
	hashCode: function(): number {
		if (G_hash_code_set.has(this)) 
			return 0;
		G_hash_code_set.add(this);
		var _hash = 5381;
		for (var key in this) {
			_hash += (_hash << 5) + (key.hashCode() + hashCode(this[key]));
		}
		G_hash_code_set.delete(this);
		return _hash;
	},
});

definePropertys(Function.prototype, {
	
	hashCode: function(): number {
		if (!this.hasOwnProperty('M_hashCode')) {
			Object.defineProperty(this, 'M_hashCode', { 
				enumerable: false, configurable: false, writable: false, value: G_hash_code_id++
			});
		}
		return this.M_hashCode;
	},

	setTimeout: function(time: number, ...args: any[]): TimeoutResult {
		var fn = this;
		return setTimeout(function() {
			fn(...args);
		}, time);
	},

});

definePropertys(Array, {
	toArray: function (obj: any, index: number, end: number): any[] {
		return G_slice.call(obj, index, end);
	},
});

definePropertys(Array.prototype, {

	hashCode: function(): number {
		if (G_hash_code_set.has(this)) 
			return 0;
		G_hash_code_set.add(this);
		var _hash = 5381;
		for (var item of this) {
			if (item) {
				_hash += (_hash << 5) + item.hashCode();
			}
		}
		G_hash_code_set.delete(this);
		return _hash;
	},

	deleteOf: function(value: any): any[] {
		var i = this.indexOf(value);
		if (i != -1) {
			this.splice(i, 1);
		}
		return this;
	},

	indexReverse: function (index: number): any {
		return this[this.length - 1 - index];
	},

});

definePropertys(String, {
	format: function(str: string, ...args: any[]): string {
		var val = String(str);
		for (var i = 0, len = args.length; i < len; i++)
			val = val.replace(new RegExp('\\{' + i + '\\}', 'g'), args[i]);
		return val;
	}
});

definePropertys(String.prototype, {
	hashCode: function(): number {
		var _hash = 5381;
		var len = this.length;
		while (len--) 
			_hash += (_hash << 5) + this.charCodeAt(len);
		return _hash;
	},
});

definePropertys(Number.prototype, {

	hashCode: function(): number {
		return this;
	},

	toFixedBefore: function(before: number, after: number): string {
		if (!isFinite(this)) {
			return String(this);
		} else {
			var num = typeof after == 'number' ? this.toFixed(after) : String(this);
			var match = num.match(/^(\d+)(\.\d+)?$/);
			var integer = match[1];
			var len = before - integer.length;
			if (len > 0)
				num = new Array(len + 1).join('0') + num;
			return num;
		}
	},

});

definePropertys(Boolean.prototype, {
	hashCode: function(): number {
		return this == true ? -1186256: -23547257;
	},
});

definePropertys(Date, {

	currentTimezone: currentTimezone,

	parseDate: function(
		date_str: string, 
		format?: string, /* = 'yyyyMMddhhmmssfff', */
		timezone?: number, /* = currentTimezone*/
	): Date 
	{
		var s = String(date_str).replace(/[^0-9]/gm, '');
		var f = '';

		format = format || 'yyyyMMddhhmmssfff';
		format.replace(/(yyyy|MM|dd|hh|mm|ss|fff)/gm, e=>{
			f += e;
			return '';
		});
		
		if (timezone === undefined)
			timezone = currentTimezone;

		var d = new Date();
		var diffTime = currentTimezone - timezone;

		return new Date(
			Number(s.substr(indexOf(f, 'yyyy'), 4)) || d.getFullYear(),
			Number(s.substr(indexOf(f, 'MM'), 2) || 1/*(d.getMonth() + 1)*/) - 1,
			Number(s.substr(indexOf(f, 'dd'), 2)) || 1/*d.getDate()*/,
			Number(s.substr(indexOf(f, 'hh'), 2) || 0/*d.getHours()*/) - diffTime,
			Number(s.substr(indexOf(f, 'mm'), 2)) || 0/*d.getMinutes()*/,
			Number(s.substr(indexOf(f, 'ss'), 2)) || 0/*d.getSeconds()*/,
			Number(s.substr(indexOf(f, 'fff'), 3)) || 0
		);
	},

	formatTimeSpan: function(time_span: number, format: string = 'dd hh:mm:ss'): string {

		var data = [];
		var items = [
			[1, 1000, /fff/g],
			[1000, 60, /ss/g],
			[60, 60, /mm/g],
			[60, 24, /hh/g],
			[24, 1, /dd/g]
		];
		
		var start = false;

		for (var i = 0; i < 5; i++) {
			var item = items[i];
			var reg = <RegExp>item[2];

			if (format.match(reg)) {
				start = true;
			}
			else if (start) {
				break;
			}
			time_span = time_span / <number>item[0];
			data.push([time_span % <number>item[1], time_span]);
		}

		if (!start) {
			return format;
		}

		data.indexReverse(0).reverse();
		data.forEach(function (item, index) {
			format =
				format.replace(<RegExp>items[index][2], Math.floor(<number>item[0]).toFixedBefore(2));
		});
		return format;
	},

});

definePropertys(Date.prototype, {

	hashCode: function(): number {
		return this.valueOf();
	},

	add: function(ms: number): Date {
		this.setMilliseconds(this.getMilliseconds() + ms);
		return this;
	},

	toString: function(format?: string, timezone?: number): string {
		if (format/*typeof format == 'string'*/) {
			var d = new Date(this.valueOf());
			if (typeof timezone == 'number') {
				var cur_time_zone = d.getTimezoneOffset() / -60;
				var offset = timezone - cur_time_zone;
				d.setHours(d.getHours() + offset);
			}
			return format.replace('yyyy', String(d.getFullYear()))
				.replace('MM', (d.getMonth() + 1).toFixedBefore(2))
				.replace('dd', d.getDate().toFixedBefore(2))
				.replace('hh', d.getHours().toFixedBefore(2))
				.replace('HH', d.getHours().toFixedBefore(2))
				.replace('mm', d.getMinutes().toFixedBefore(2))
				.replace('ss', d.getSeconds().toFixedBefore(2))
				.replace('fff', d.getMilliseconds().toFixedBefore(3));
		} else {
			return dateToString.call(this);
		}
	},

});

interface Errors {
	[name: string]: Function;
}

const errors: Errors = {
	Error,
	SyntaxError,
	ReferenceError,
	TypeError,
	RangeError,
	EvalError,
	URIError,
};

definePropertys(Error, {

	new: function(arg: ErrorNewArg, errno?: number): Error {
		var err: Error;
		if (arg as Object) { // ErrnoCode | Error | ErrorDescribe;
			if (arg as Error) {
				err = <Error>arg;
			} if (Array.isArray(arg)) { // ErrnoCode
				var errno_code = <ErrnoCode>arg;
				err = new Error(errno_code[1] || errno_code[2] || 'unknown');
				err.errno = errno_code[0];
				err.description = errno_code[2] || '';
			} else { // ErrorDescribe
				var describe = <ErrorDescribe>arg;
				var Err = <ErrorConstructor>(errors[(<Error>arg).name] || Error);
				var msg = describe.message || describe.error || 'unknown';
				err = <Error>Object.assign(new Err(msg), arg);
			}
		} else { // string
			err = new Error(String(arg));
		}

		err.errno = Number(errno || err.errno) || -1;
		return err;
	},

	toJSON(err: any): Error {
		return Error.new(err).toJSON()
	},

});

definePropertys(Error.prototype, {

	hashCode: function(): number {
		var _hash = Object.prototype.hashCode.call(this);
		_hash += (_hash << 5) + this.message.hashCode();
		return _hash;
	},

	toJSON: function(): any {
		var err = this;
		var r = Object.assign({}, err);
		r.name = err.name || '';
		r.message = err.message || 'unknown';
		r.errno = Number(err.errno) || -1;
		if (r.code) // compatible old
			r.rawCode = r.code;
		r.code = r.errno; // compatible old
		r.description = err.description || '';
		r.stack = err.stack || '';
		return r;
	},
});

})();