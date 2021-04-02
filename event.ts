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

export declare class ListItem<T> {
	private _host;
	private _prev;
	private _next;
	private _value;
	constructor(host: List<T>, prev: ListItem<T> | null, next: ListItem<T> | null, value: T);
	get host(): List<T> | null;
	get prev(): ListItem<T> | null;
	get next(): ListItem<T> | null;
	get value(): T;
	set value(value: T);
}
/**
 * @class List linked
 */
export declare class List<T> {
	private _first;
	private _last;
	private _length;
	get first(): ListItem<T> | null;
	get last(): ListItem<T> | null;
	get length(): number;
	del(item: ListItem<T>): ListItem<T> | null;
	unshift(value: T): ListItem<T>;
	push(value: T): ListItem<T>;
	pop(): T | null;
	shift(): T | null;
	insert(prev: ListItem<T>, value: T): ListItem<T>;
	clear(): void;
}
/**
	* @class Event
	*/
export declare class Event<Data, Sender extends object = object> {
	private _data;
	protected _noticer: EventNoticer<Event<Data, Sender>> | null;
	private _origin;
	get name(): string;
	get data(): Data;
	get sender(): Sender;
	get origin(): any;
	set origin(value: any);
	get noticer(): EventNoticer<Event<Data, Sender>> | null;
	constructor(data: Data);
}
declare type DefaultEvent = Event<any>;
export interface Listen<Event = DefaultEvent, Scope extends object = object> {
	(this: Scope, evt: Event): any;
}
export interface Listen2<Event = DefaultEvent, Scope extends object = object> {
	(self: Scope, evt: Event): any;
}
export declare class EventNoticer<E = DefaultEvent> {
	private m_name;
	private m_sender;
	private m_listens;
	private m_listens_map;
	private m_length;
	private m_enable;
	private _add;
	/**
	 * @get enable {bool} # 获取是否已经启用
	 */
	get enable(): boolean;
	/**
	 * @set enable {bool} # 设置, 启用/禁用
	 */
	set enable(value: boolean);
	/**
	 * @get name {String} # 事件名称
	 */
	get name(): string;
	/**
	 * @get {Object} # 事件发送者
	 */
	get sender(): object;
	/**
	 *
	 * @get {int} # 添加的事件侦听数量
	 */
	get length(): number;
	/**
	 * @constructor
	 * @arg name   {String} # 事件名称
	 * @arg sender {Object} # 事件发起者
	 */
	constructor(name: string, sender: object);
	/**
	 * @fun on # 绑定一个事件侦听器(函数)
	 * @arg  listen {Function} #  侦听函数
	 * @arg [scope] {Object}   # 重新指定侦听函数this
	 * @arg [id]  {String}     # 侦听器别名,可通过id删除
	 */
	on<Scope extends object>(listen: Listen<E, Scope>, scopeOrId?: Scope | string, id?: string): string;
	/**
	 * @fun once # 绑定一个侦听器(函数),且只侦听一次就立即删除
	 * @arg listen {Function} #         侦听函数
	 * @arg [scope] {Object}  #         重新指定侦听函数this
	 * @arg [id] {String}     #         侦听器别名,可通过id删除
	 */
	once<Scope extends object>(listen: Listen<E, Scope>, scopeOrId?: Scope | string, id?: string): string;
	/**
	 * Bind an event listener (function),
	 * and "on" the same processor of the method to add the event trigger to receive two parameters
	 * @fun on2
	 * @arg listen {Function}  #              侦听函数
	 * @arg [scope] {Object}   #      重新指定侦听函数this
	 * @arg [id] {String}     #     侦听器别名,可通过id删除
	 */
	on2<Scope extends object>(listen: Listen2<E, Scope>, scopeOrId?: Scope | string, id?: string): string;
	/**
	 * Bind an event listener (function), And to listen only once and immediately remove
	 * and "on" the same processor of the method to add the event trigger to receive two parameters
	 * @fun once2
	 * @arg listen {Function}     #           侦听函数
	 * @arg [scope] {Object}      # 重新指定侦听函数this
	 * @arg [id] {String}         # 侦听器id,可通过id删除
	 */
	once2<Scope extends object>(listen: Listen2<E, Scope>, scopeOrId?: Scope | string, id?: string): string;
	forward(noticer: EventNoticer<E>, id?: string): string;
	forwardOnce(noticer: EventNoticer<E>, id?: string): string;
	/**
	 * @fun trigger # 通知所有观察者
	 * @arg data {Object} # 要发送的数据
	 * @ret {Object}
	 */
	trigger(data?: any): void;
	/**
	 * @fun triggerWithEvent # 通知所有观察者
	 * @arg data {Object} 要发送的event
	 * @ret {Object}
	 */
	triggerWithEvent(evt: E): void;
	/**
	 * @fun off # 卸载侦听器(函数)
	 * @arg [func] {Object}   # 可以是侦听函数,id,如果不传入参数卸载所有侦听器
	 * @arg [scope] {Object}  # scope
	 */
	off(listen?: string | Function | object, scope?: object): void;
}
export declare const VOID: any;
/**
 * @class Notification
 */
export declare class Notification<E = DefaultEvent> {
	/**
	 * @func getNoticer
	 */
	getNoticer(name: string): EventNoticer<E>;
	/**
	 * @func hasNoticer
	 */
	hasNoticer(name: string): boolean;
	/**
	 * @func addDefaultListener
	 */
	addDefaultListener(name: string, listen: Listen<E> | null): void;
	/**
	 * @func addEventListener(name, listen[,scope[,id]])
	 */
	addEventListener<Scope extends object>(name: string, listen: Listen<E, Scope>, scopeOrId?: Scope | string, id?: string): string;
	/**
	 * @func addEventListenerOnce(name, listen[,scope[,id]])
	 */
	addEventListenerOnce<Scope extends object>(name: string, listen: Listen<E, Scope>, scopeOrId?: Scope | string, id?: string): string;
	/**
	 * @func addEventListener2(name, listen[,scope[,id]])
	 */
	addEventListener2<Scope extends object>(name: string, listen: Listen2<E, Scope>, scopeOrId?: Scope | string, id?: string): string;
	/**
	 * @func addEventListenerOnce2(name, listen[,scope[,id]])
	 */
	addEventListenerOnce2<Scope extends object>(name: string, listen: Listen2<E, Scope>, scopeOrId?: Scope | string, id?: string): string;
	addEventForward(name: string, noticer: EventNoticer<E>, id?: string): string;
	addEventForwardOnce(noticer: EventNoticer<E>, id?: string): string;
	/**
	* @func trigger 通知事监听器
	* @arg name {String}       事件名称
	* @arg data {Object}       要发送的消数据
	*/
	trigger(name: string, data?: any): void;
	/**
	* @func triggerWithEvent 通知事监听器
	* @arg name {String}       事件名称
	* @arg event {Event}       Event
	*/
	triggerWithEvent(name: string, event: E): void;
	/**
	 * @func removeEventListener(name,[func[,scope]])
	 */
	removeEventListener(name: string, listen?: string | Function | object, scope?: object): void;
	/**
	 * @func removeEventListenerWithScope(scope) 卸载notification上所有与scope相关的侦听器
	 * @arg scope {Object}
	 */
	removeEventListenerWithScope(scope: object): void;
	/**
	 * @func allNoticers() # Get all event noticer
	 * @ret {Array}
	 */
	allNoticers(): EventNoticer<E>[];
	/**
	 * @func triggerListenerChange
	 */
	triggerListenerChange(name: string, count: number, change: number): void;
}
export declare function event(target: any, name: string): void;
export {};

// ======================== IMPL ========================

var _ex: any;

declare var __webpack_exports__: any;

if (typeof __require__ == 'function') { // ftr
	_ex = Object.assign(exports, __require__('_event'));
} else if (typeof __webpack_exports__ == 'object') {
	_ex = Object.assign(__webpack_exports__, require('./_event'));
} else {
	_ex = Object.assign(exports, require('./_event'));
}

export default (_ex.event as (target: any, name: string)=>void);