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

if (typeof __requireFtr__ == 'function') {
	require('ftr/_ext');
} else {
	require('./_ext');
}

import './_ext';
import {Event, Notification, EventNoticer} from './event';

const base64_chars =
	'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-'.split('');

const haveNode: boolean = !!globalThis.process;
const haveFtr: boolean = !!globalThis.__requireFtr__;
const haveWeb: boolean = !!globalThis.document;

type Platform = 'darwin' | 'linux' | 'win32' | 'android'
| 'freebsd'
| 'openbsd'
| 'sunos'
| 'cygwin'
| 'netbsd' | 'web';

var argv: string[];
var webFlags: WebPlatformFlags | null = null;
var platform: Platform;
var gc: ()=>void = unrealized;

export interface WebPlatformFlags {
	windows: boolean,
	windowsPhone: boolean,
	linux: boolean,
	android: boolean,
	macos: boolean,
	ios: boolean,
	iphone: boolean,
	ipad: boolean,
	ipod: boolean,
	mobile: boolean,
	touch: boolean,
	trident: boolean,
	presto: boolean,
	webkit: boolean,
	gecko: boolean
}

interface IProcess {
	getNoticer(name: string): EventNoticer;
	exit(code?: number): void;
}

export var _process: IProcess;

var _processHandles = {
	BeforeExit: (noticer: EventNoticer, code = 0)=>{
		return noticer.triggerWithEvent(new Event(code, code));
	},
	Exit: (noticer: EventNoticer, code = 0)=>{
		return noticer.triggerWithEvent(new Event(code, code));
	},
	UncaughtException: (noticer: EventNoticer, err: Error)=>{
		return noticer.length && noticer.triggerWithEvent(new Event(err, 0)) === 0;
	},
	UnhandledRejection: (noticer: EventNoticer, reason: Error, promise: Promise<any>)=>{
		return noticer.length && noticer.triggerWithEvent(new Event({ reason, promise }, 0)) === 0;
	},
};

if (haveFtr) {
	var _util = __requireFtr__('_util');
	platform = <Platform>_util.platform;
	argv = _util.argv;
	gc = _util.garbageCollection;
	_process = require('ftr/_util')._process;
}
else if (haveNode) {
	let _nodeProcess = (globalThis as any).process;
	platform = _nodeProcess.platform;
	argv = process.argv;

	class NodeProcess extends Notification implements IProcess {
		getNoticer(name: 'BeforeExit'|'Exit'|'UncaughtException'|'UnhandledRejection') {
			if (!this.hasNoticer(name)) {
				var noticer = super.getNoticer(name);
				_nodeProcess.on(name.substr(0, 1).toLowerCase() + name.substr(1), function(...args: any[]) {
					return (_processHandles[name] as any)(noticer, ...args);
				});
			}
			return super.getNoticer(name);
		}
		exit(code?: number) {
			_nodeProcess.exit(code || 0);
		}
	}
	_process = new NodeProcess();
}
else if (haveWeb) {
	let USER_AGENT = navigator.userAgent;
	let mat = USER_AGENT.match(/\(i[^;]+?; (U; )?CPU.+?OS (\d).+?Mac OS X/);
	let ios = !!mat;
	webFlags = {
		windows: USER_AGENT.indexOf('Windows') > -1,
		windowsPhone: USER_AGENT.indexOf('Windows Phone') > -1,
		linux: USER_AGENT.indexOf('Linux') > -1,
		android: /Android|Adr/.test(USER_AGENT),
		macos: USER_AGENT.indexOf('Mac OS X') > -1,
		ios: ios,
		iphone: USER_AGENT.indexOf('iPhone') > -1,
		ipad: USER_AGENT.indexOf('iPad') > -1,
		ipod: USER_AGENT.indexOf('iPod') > -1,
		mobile: USER_AGENT.indexOf('Mobile') > -1 || 'ontouchstart' in globalThis,
		touch: 'ontouchstart' in globalThis,
		//--
		trident: !!USER_AGENT.match(/Trident|MSIE/),
		presto: !!USER_AGENT.match(/Presto|Opera/),
		webkit: 
			USER_AGENT.indexOf('AppleWebKit') > -1 || 
			!!globalThis.WebKitCSSMatrix,
		gecko:
			USER_AGENT.indexOf('Gecko') > -1 &&
			USER_AGENT.indexOf('KHTML') == -1, // || !!globalThis.MozCSSKeyframeRule
	};
	platform = 'web' as Platform;
	argv = [location.origin + location.pathname].concat(location.search.substr(1).split('&'));

	class WebProcess extends Notification implements IProcess {
		getNoticer(name: 'BeforeExit'|'Exit'|'UncaughtException'|'UnhandledRejection') {
			if (!this.hasNoticer(name)) {
				var noticer = super.getNoticer(name);
				if (name == 'UncaughtException') {
					globalThis.addEventListener('error', function(e) {
						var { message, error, filename, lineno, colno } = e;
						return _processHandles.UncaughtException(noticer, Error.new(error || message || 'unknown UncaughtException'));
					});
				} else if (name == 'UnhandledRejection') {
					globalThis.addEventListener('unhandledrejection', function(e) {
						var {reason,promise} = e;
						return _processHandles.UnhandledRejection(noticer, Error.new(reason || 'unknown UnhandledRejection'), promise);
					});
				}
			}
			return super.getNoticer(name);
		}
		exit(code?: number) {
			window.close();
		}
	}
	_process = new WebProcess();
} else {
	throw new Error('no support');
}

/**
	* @fun hash # gen hash value
	* @arg input {Object} 
	* @ret {String}
	*/
function hash(data: any): string {
	var value = Object.hashCode(data);
	var retValue = '';
	do
		retValue += base64_chars[value & 0x3F];
	while ( value >>>= 6 );
	return retValue;
}

if (!globalThis.setImmediate) {
	(globalThis as any).setImmediate = function<A extends any[]>(cb: (...args: A) => void, ...args: A): any {
		return globalThis.setTimeout(function() {
			cb(...args);
		}, 1);
	};
	globalThis.clearImmediate = globalThis.clearTimeout;
}

const nextTick: <A extends any[], R>(cb: (...args: A) => R, ...args: A) => void = 
haveNode ? process.nextTick: function(cb, ...args): void {
	if (typeof cb != 'function')
		throw new Error('callback must be a function');
	if (haveFtr) {
		_util.nextTick(()=>cb(...args));
	} else {
		setImmediate(()=>cb(...args));
	}
};

function unrealized(): any {
	throw new Error('Unrealized function');
}

export default {
	version: unrealized,
	addNativeEventListener: unrealized,
	removeNativeEventListener: unrealized,
	gc: gc,
	runScript: unrealized,
	hashCode: Object.hashCode,
	hash: hash,
	nextTick: nextTick,
	platform: platform,
	haveNode: haveNode,
	haveFtr: haveFtr,
	haveWeb: haveWeb,
	argv: argv,
	webFlags: webFlags,
	exit: (code?: number)=>{ _process.exit(code) },
	unrealized: unrealized,
}