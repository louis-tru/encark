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

var _id = 0;

class LiteItem<T> {
	private _host: List<T> | null;
	private _prev: LiteItem<T> | null; 
	private _next: LiteItem<T> | null;
	private _value: T | null;
	constructor(host: List<T>, prev: LiteItem<T> | null, next: LiteItem<T> | null, value: T) {
		this._host = host;
		this._prev = prev;
		this._next = next;
		this._value = value;
	}
	get host() { return this._host }
	get prev() { return this._prev }
	get next() { return this._next }
	get value(): T | null { return this._value }
	set value(value: T | null) { this._value = value }
}

/**
 * @class List linked 
 */
export class List<T> {

	private _first: LiteItem<T> | null = null;
	private _last: LiteItem<T> | null = null;
	private _length: number = 0;

	get first() {
		return this._first;
	}

	get last() {
		return this._last;
	}

	get length() {
		return this._length;
	}

	del(item: LiteItem<T>) {
		if ( item.host === this ) {
			var prev = item.prev;
			var next = item.next;
			if (prev) {
				(<any>prev)._next = next;
			} else {
				this._first = next;
			}
			if (next) {
				(<any>next)._prev = prev;
			} else {
				this._last = prev;
			}
			(<any>item)._host = null;
			(<any>item)._prev = null;
			(<any>item)._next = null;
			this._length--;
			return next;
		}
		return null;
	}

	unshift(value: T): LiteItem<T> {
		var item: LiteItem<T>;
		if ( this._first ) {
			item = new LiteItem(this, null, this._first, value);
			(<any>this._first)._prev = item;
			this._first = item;
		} else {
			item = new LiteItem(this, null, null, value);
			this._last = item;
			this._first = item;
		}
		this._length++;
		return item;
	}

	push(value: T): LiteItem<T> {
		var item: LiteItem<T>;
		if ( this._last ) {
			item = new LiteItem(this, this._last, null, value);
			(<any>this._last)._next = item;
			this._last = item;
		} else {
			item = new LiteItem(this, null, null, value);
			this._last = item;
			this._first = item;
		}
		this._length++;
		return item;
	}

	pop(): T | null {
		if ( this._length ) {
			var r = <LiteItem<T>>this._last;
			if ( this._length > 1 ) {
				(<any>r.prev)._next = null;
				this._last = r.prev;
			} else {
				this._first = null;
				this._last = null;
			}
			this._length--;
			(<any>r)._host = null;
			(<any>r)._prev = null;
			(<any>r)._next = null;
			return r.value;
		}
		return null;
	}

	shift(): T | null {
		if ( this._length ) {
			var r= <LiteItem<T>>this._first;
			if ( this._length > 1 ) {
				(<any>r.next)._prev = null;
				this._first = r.next;
			} else {
				this._first = null;
				this._last = null;
			}
			this._length--;
			(<any>r)._host = null;
			(<any>r)._prev = null;
			(<any>r)._next = null;
			return r.value;
		}
		return null;
	}

	clear() {
		this._first = null;
		this._last = null;
		this._length = 0;
	}

}

/**
	* @class Event
	*/
export class Event<Sender = any, Data = any, Return = number> {
	private m_data: Data;
	protected m_noticer: EventNoticer<Sender, Data, Return> | null = null;
	private m_return_value: Return | null = null;
	protected __has_event = true;
	private m_origin = null;

	get name() {
		return (<EventNoticer<Sender, Data, Return>>this.m_noticer).name;
	}

	get data () {
		return this.m_data;
	}

	get sender() {
		return (<EventNoticer<Sender, Data, Return>>this.m_noticer).sender;
	}

	get origin () {
		return this.m_origin;
	}

	set origin(value) {
		this.m_origin = value;
	}

	get noticer () {
		return this.m_noticer;
	}

	get returnValue() {
		return this.m_return_value;
	}

	set returnValue(value) {
		if ( !(value as Return) )
			throw new TypeError('Bad argument.');
		this.m_return_value = value;
	}

	/**
	 * @constructor
	 */
	constructor(data: Data) {
		this.m_data = data;
		// this.m_return_value = Return; //new Return;
	}
	// @end
}

// class EventExt<Sender = any, Data = any, Return = number> extends Event<Sender, Data, Return> {
// 	getNoticer() {
// 		return this.m_noticer;
// 	}
// 	setNoticer(noticer: EventNoticer<Sender, Data, Return> | null) {
// 		this.m_noticer = noticer;
// 	}
// }

type DefaultEvent = Event;

export interface Listen<Event = DefaultEvent, Scope = any> {
	(evt: Event): any;
}

export interface Listen2<Event = DefaultEvent, Scope = any> {
	(scope: Scope, evt: Event): any;
}

interface ListenItem {
	origin: any,
	listen: any,
	scope: any,
	id: string,
}

function check_noticer(noticer: any) {
	if ( !(noticer as EventNoticer) )
		throw new Error('Event listener function type is incorrect ');
}

function check_fun(origin: any) {
	if ( typeof origin != 'function' ) {
		throw new Error('Event listener function type is incorrect ');
	}
}

function forwardNoticeNoticer<Sender, Data, Return>(
	forward_noticer: EventNoticer<Sender, Data, Return>, 
	evt: Event<Sender, Data, Return>
) {
	var noticer = (<any>evt).m_noticer;
	forward_noticer.triggerWithEvent(evt);
	(<any>evt).m_noticer = noticer;
}

/**
 * @class EventNoticer
 */
export class EventNoticer<Sender = any, Data = any, Return = number> {

	private m_name: string;
	private m_sender: any;
	private m_listens: List<ListenItem> | null = null;
	private m_listens_map: Map<string, LiteItem<ListenItem>> | null = null
	private m_length: number = 0
	private m_enable: boolean = true

	/* @fun add # Add event listen */
	private _add(origin_listen: any, listen: any, scope: any, id?: string): string {
		var self = this;

		var listens_map = self.m_listens_map;
		if ( !listens_map ) {
			self.m_listens = new List();
			self.m_listens_map = listens_map = new Map();
		}

		if (typeof scope != 'object') {
			id = String(scope || ++_id);
			scope = self.m_sender;
		} else {
			scope = scope || self.m_sender;
			id = String(id || ++_id);
		}

		id = String(id);

		var value: ListenItem = {
			origin: origin_listen,
			listen: listen,
			scope: scope,
			id: id,
		};
		var item = listens_map.get(id);

		if ( item ) { // replace
			item.value = value;
		} else { // add
			listens_map.set(id, (<List<ListenItem>>self.m_listens).push(value));
			self.m_length++;
		}

		return id;
	}

	/**
	 * @get enable {bool} # 获取是否已经启用
	 */
	get enable() {
		return this.m_enable;
	}
	
	/**
	 * @set enable {bool} # 设置, 启用/禁用
	 */
	set enable(value: boolean) {
		this.m_enable = value;
	}
	
	/**
	 * @get name {String} # 事件名称
	 */
	get name(): string {
		return this.m_name;
	}
	
	/**
	 * @get {Object} # 事件发送者
	 */
	get sender() {
		return this.m_sender;
	}

	/**
	 * 
	 * @get {int} # 添加的事件侦听数量
	 */
	get length () {
		return this.m_length;
	}
	
	/**
	 * @constructor
	 * @arg name   {String} # 事件名称
	 * @arg sender {Object} # 事件发起者
	 */
	constructor (name: string, sender: Sender) {
		this.m_name = name;
		this.m_sender = sender;
	}

	/**
	 * @fun on # 绑定一个事件侦听器(函数)
	 * @arg  listen {Function} #  侦听函数
	 * @arg [scope] {Object}   # 重新指定侦听函数this
	 * @arg [id]  {String}     # 侦听器别名,可通过id删除
	 */
	on<Scope>(listen: Listen<Event<Sender, Data, Return>, Scope>, scope: Scope = this.m_sender, id?: string): string {
		check_fun(listen);
		return this._add(listen, listen, scope, id);
	}

	/**
	 * @fun once # 绑定一个侦听器(函数),且只侦听一次就立即删除
	 * @arg listen {Function} #         侦听函数
	 * @arg [scope] {Object}  #         重新指定侦听函数this
	 * @arg [id] {String}     #         侦听器别名,可通过id删除
	 */
	once<Scope>(listen: Listen<Event<Sender, Data, Return>, Scope>, scope: Scope = this.m_sender, id?: string): string {
		check_fun(listen);
		var self = this;
		var _id = this._add(listen, {
			call: function (scope: Scope, evt: Event<Sender, Data, Return>) {
				self.off(_id);
				listen.call(scope, evt);
			}
		}, scope, id);
		return _id;
	}

	/**
	 * Bind an event listener (function),
	 * and "on" the same processor of the method to add the event trigger to receive two parameters
	 * @fun on2
	 * @arg listen {Function}  #              侦听函数
	 * @arg [scope] {Object}   #      重新指定侦听函数this
	 * @arg [id] {String}     #     侦听器别名,可通过id删除
	 */
	on2<Scope>(listen: Listen2<Event<Sender, Data, Return>, Scope>, scope: Scope = this.m_sender, id?: string): string {
		check_fun(listen);
		return this._add(listen, { call: listen }, scope, id);
	}

	/**
	 * Bind an event listener (function), And to listen only once and immediately remove
	 * and "on" the same processor of the method to add the event trigger to receive two parameters
	 * @fun once2
	 * @arg listen {Function}     #           侦听函数
	 * @arg [scope] {Object}      # 重新指定侦听函数this
	 * @arg [id] {String}         # 侦听器id,可通过id删除
	 */
	once2<Scope>(listen: Listen2<Event<Sender, Data, Return>, Scope>, scope: Scope = this.m_sender, id?: string): string {
		check_fun(listen);
		var self = this;
		var _id = this._add(listen, {
			call: function (scope: Scope, evt: Event<Sender, Data, Return>) {
				self.off(_id);
				listen(scope, evt);
			}
		}, scope, id);
		return _id;
	}
	
	forward(noticer: EventNoticer<Sender, Data, Return>, id?: string): string {
		check_noticer(noticer);
		return this._add(noticer, { call: forwardNoticeNoticer }, noticer, id);
	}

	forwardOnce(noticer: EventNoticer<Sender, Data, Return>, id?: string): string {
		check_noticer(noticer);
		var self = this;
		var _id = this._add(noticer, function(evt: Event<Sender, Data, Return>) {
			self.off(_id);
			forwardNoticeNoticer(noticer, evt);
		}, noticer, id);
		return _id;
	}

	/**
	 * @fun trigger # 通知所有观察者
	 * @arg data {Object} # 要发送的数据
	 * @ret {Object}
	 */
	trigger(data: Data): Return | null {
		return this.triggerWithEvent(new Event(data));
	}

	/**
	 * @fun triggerWithEvent # 通知所有观察者
	 * @arg data {Object} 要发送的event
	 * @ret {Object}
	 */
	triggerWithEvent(evt: Event<Sender, Data, Return>): Return | null {
		if ( this.m_enable && this.m_length ) {
			(<EventExt<Sender, Data, Return>>evt).setNoticer(this);
			var listens = <List<ListenItem>>this.m_listens;
			var item = listens.first;
			while ( item ) {
				var value = item.value;
				if ( value ) {
					value.listen.call(value.scope, evt);
					item = item.next;
				} else {
					item = listens.del(item);
				}
			}
			(<EventExt<Sender, Data, Return>>evt).setNoticer(null);
		}
		return evt.returnValue;
	}

	/**
	 * @fun off # 卸载侦听器(函数)
	 * @arg [func] {Object}   # 可以是侦听函数,id,如果不传入参数卸载所有侦听器
	 * @arg [scope] {Object}  # scope
	 */
	off(listen: any, scope?: any): number {
		if ( !this.m_length ) {
			return 0;
		}
		var r = 0;
		if (listen) {
			if ( typeof listen == 'string' ) { // by id delete 
				let listens_map = <Map<string, LiteItem<ListenItem>>>this.m_listens_map;
				let item = listens_map.get(listen);
				if ( item ) {
					this.m_length--;
					listens_map.delete(listen);
					item.value = null; // clear
					r++;
				}
			} else if ( listen instanceof Function ) { // 要卸载是一个函数
				let listens = <List<ListenItem>>this.m_listens;
				let listens_map = <Map<string, LiteItem<ListenItem>>>this.m_listens_map;
				let item = listens.first;
				if (scope) { // 需比较范围
					while ( item ) {
						let value = item.value;
						if ( value ) {
							if ( value.origin === listen && value.scope === scope ) {
								this.m_length--;
								listens_map.delete(value.id);
								item.value = null;
								r++;
								break; // clear
							}
						}
						item = item.next;
					}
				} else { // 与这个函数有关系的
					let listens_map = <Map<string, LiteItem<ListenItem>>>this.m_listens_map;
					while ( item ) {
						let value = item.value;
						if ( value ) {
							if ( value.origin === listen ) {
								this.m_length--;
								listens_map.delete(value.id);
								item.value = null;
								r++;
								break; // clear
							}
						}
						item = item.next;
					}
				}
			} else if ( listen instanceof Object ) { //
				let listens = <List<ListenItem>>this.m_listens;
				let listens_map = <Map<string, LiteItem<ListenItem>>>this.m_listens_map;
				let item = listens.first;
				// 要卸载这个范围上相关的侦听器,包括`EventNoticer`代理
				while ( item ) {
					var value = item.value;
					if ( value ) {
						if ( value.scope === listen ) {
							this.m_length--;
							listens_map.delete(value.id);
							item.value = null; // break; // clear
							r++;
						}
					}
					item = item.next;
				}
			} else { //
				throw new Error('Param err');
			}
		} else { // 全部删除
			let listens = <List<ListenItem>>this.m_listens;
			let item = listens.first;
			while ( item ) {
				item.value = null; // clear
				item = item.next;
				r++;
			}
			this.m_length = 0;
			this.m_listens_map = new Map<string, LiteItem<ListenItem>>();
		}
		return r;
	}

	// @end
}
