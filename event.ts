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

import _util from './_util';
import {EventNoticer,Event,Listen,Listen2} from './_event';
export * from './_event';

const PREFIX = 'on';

/**********************************************************************************/

// const {EventNoticer,Event} = event;
const REG = new RegExp('^' + PREFIX);

/**
 * @class Notification
 */
export class Notification<Data = any, Return = number, Sender = any> {

	/**
	 * @func getNoticer
	 */
	getNoticer(name: string): EventNoticer<Data, Return, Sender> {
		var noticer = (<any>this)[PREFIX + name];
		if ( ! noticer ) {
			noticer = new EventNoticer<Data, Return, Sender>(name, <any>this);
			(<any>this)[PREFIX + name] = noticer;
		}
		return noticer;
	}

	/**
	 * @func hasNoticer
	 */
	hasNoticer(name: string) {
		return (PREFIX + name) in this;
	}
	
	/**
	 * @func addDefaultListener
	 */
	addDefaultListener(name: string, listen: Listen<Event<Data, Return, Sender>>) {
		if ( typeof listen == 'string' ) {
			var func = (<any>this)[listen]; // find func 
			if ( typeof func == 'function' ) {
				return this.addEventListener(name, func, 0); // default id 0
			} else {
				throw Error.new(`Cannot find a function named "${listen}"`);
			}
		} else {
			if (listen) {
				return this.addEventListener(name, listen, 0); // default id 0
			} else { // delete default listener
				this.removeEventListener(name, 0)
			}
		}
	}

	/**
	 * @func addEventListener(name, listen[,scope[,id]])
	 */
	addEventListener<Scope>(name: string, listen: Listen<Event<Data, Return, Sender>, Scope>, scope?: Scope, id?: string) {
		var del = this.getNoticer(name);
		var r = del.on(listen, scope, id);
		this.triggerListenerChange(name, del.length, 1);
		return r;
	}

	/**
	 * @func addEventListenerOnce(name, listen[,scope[,id]])
	 */
	addEventListenerOnce<Scope>(name: string, listen: Listen<Event<Data, Return, Sender>, Scope>, scope?: Scope, id?: string) {
		var del = this.getNoticer(name);
		var r = del.once(listen, scope, id);
		this.triggerListenerChange(name, del.length, 1);
		return r;
	}

	/**
	 * @func addEventListener2(name, listen[,scope[,id]])
	 */
	addEventListener2<Scope>(name: string, listen: Listen2<Event<Data, Return, Sender>, Scope>, scope?: Scope, id?: string) {
		var del = this.getNoticer(name);
		var r = del.on2(listen, scope, id);
		this.triggerListenerChange(name, del.length, 1);
		return r;
	}

	/**
	 * @func addEventListenerOnce2(name, listen[,scope[,id]])
	 */
	addEventListenerOnce2<Scope>(name: string, listen: Listen2<Event<Data, Return, Sender>, Scope>, scope?: Scope, id?: string) {
		var del = this.getNoticer(name);
		var r = del.once2(listen, scope, id);
		this.triggerListenerChange(name, del.length, 1);
		return r;
	}

	addEventForward(name: string, noticer: EventNoticer<Data, Return, Sender>, id?: string) {
		var del = this.getNoticer(name);
		var r = del.forward(noticer, id);
		this.triggerListenerChange(name, del.length, 1);
		return r;
	}

	addEventForwardOnce(noticer: EventNoticer<Data, Return, Sender>, id?: string) {
		var del = this.getNoticer(name);
		var r = del.forwardOnce(noticer, id);
		this.triggerListenerChange(name, del.length, 1);
		return r;
	}

	/**
	* @func trigger 通知事监听器
	* @arg name {String}       事件名称
	* @arg data {Object}       要发送的消数据
	*/
	trigger(name: string, data?: Data) {
		return this.triggerWithEvent(name, new Event<Data, Return, Sender>(data));
	}

	/**
	* @func triggerWithEvent 通知事监听器
	* @arg name {String}       事件名称
	* @arg event {Event}       Event 
	*/
	triggerWithEvent(name: string, event: Event<Data, Return, Sender>) {
		var noticer = (<any>this)[PREFIX + name];
		if (noticer) {
			return noticer.triggerWithEvent(event);
		}
		return event.returnValue;
	}

	/**
	 * @func $trigger(name, event, is_event)
	 */
	$trigger(name: string, event?: Event<Data, Return, Sender> | Data, is_event?: boolean) {
		var noticer = (<any>this)[PREFIX + name];
		if (noticer) {
			if ( is_event ) {
				return this.triggerWithEvent(name, <Event<Data, Return, Sender>>event)
			} else {
				return this.trigger(name, <Data>event)
			}
		}
		return 0;
	}

	/**
	 * @func removeEventListener(name,[func[,scope]])
	 */
	removeEventListener(name: string, listen: any, scope?: any) {
		var noticer = (<any>this)[PREFIX + name];
		if (noticer) {
			noticer.off(listen, scope);
			this.triggerListenerChange(name, noticer.length, -1);
		}
	}

	/**
	 * @func removeEventListenerWithScope(scope) 卸载notification上所有与scope相关的侦听器
	 * @arg scope {Object}
	 */
	removeEventListenerWithScope(scope: any) {
		for ( let noticer of this.allNoticers() ) {
			noticer.off(scope);
			this.triggerListenerChange(name, noticer.length, -1);
		}
	}

	/**
	 * @func allNoticers() # Get all event noticer
	 * @ret {Array}
	 */
	allNoticers() {
		return allNoticers(this);
	}

	/**
	 * @func triggerListenerChange
	 */
	triggerListenerChange(name: string, count: number, change: number) {}

}

/**
 * @fun initEvents(self) init event delegate
 * @arg self     {Object} 
 * @arg argus... {String}  event name
 */
export function initEvents(self: any) {
	if (arguments.length == 1) {
		if (self) {
			var root = self;
			var REG = new RegExp('^' + PREFIX + '[a-zA-Z]');
			while (self !== Object.prototype) {
				for (var e of Object.getOwnPropertyNames(self)) {
					if (REG.test(e)) {
						var name = e.substr(PREFIX.length);
						if (root[PREFIX + name]) {
							return;
						} else {
							root[PREFIX + name] = new EventNoticer(name, root);
						}
					}
				}
				self = self.__proto__;
			}
		}
	} else {
		var args = Array.toArray(arguments);
		for (var i = 1, name: string; (name = args[i]); i++) {
			self[PREFIX + name] = new EventNoticer(name, self);
		}
	}
}

export function allNoticers(notification: any) {
	var result: any[] = [];
	for ( var i in notification ) {
		if ( REG.test(i) ) {
			var noticer = notification[i];
			if ( noticer instanceof EventNoticer ) {
				result.push(noticer);
			}
		}
	}
	return result;
}
