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

import utils from './util';
import path from './path';
import { Notification } from './event';
import path2 from './path';

const { haveNode, haveQuark, haveWeb } = utils;
const fb = path2.fallbackPath;

if (haveQuark) {
	var fs = __require__('_fs');
} else if (haveNode) {
	var fs = require('./fs');
}

// import  * as fs from './fs';

function formatTime(time: Date) {
	return time.toString('yyyy-MM-dd hh:mm:ss.fff');
}

function timeSpace(self: Console) {
	return new Array((<any>self).m_timeStack.length).join('  ');
}

interface Stack {
	date: Date;
	tag: string;
	timelines: { 
		date: Date;
		tag: string;
	}[];
}

export const log = console.log;
export const error = console.error;
export const dir = console.dir;
export const warn = console.warn;

var cur: Console | null = null;

export class Console extends Notification {

	private m_pathname: string;
	private m_fd = 0;
	private m_fd_open_time = new Date();
	private m_timeStack: Map<string, Stack>;
	private m_autoCutFileTime = 0;
	private _prefix: string;

	get autoCutFileTime() {
		return this.m_autoCutFileTime;
	}

	set autoCutFileTime(value) {
		this.m_autoCutFileTime = value ? Math.max(3600*1000, value) : value;
	}

	get fd(): number {
		return this.m_fd;
	}

	get pathname(): string {
		return this.m_pathname;
	}

	constructor(pathname?: string, prefix?: string) {
		super();
		this.m_pathname = pathname || '';
		this.m_timeStack = new Map<string, any>();
		this._prefix = prefix || '';
		this.reopen();
	}

	private _Indent = true;

	setIndent(indent: boolean) {
		this._Indent = !!indent;
	}

	reopen(cut = false) {
		if (this.m_pathname) {
			if (haveWeb) {
				this.m_fd = 0;
			} else {
				var now = new Date();
				fs.mkdirpSync(fb(path.dirname(this.m_pathname)));
				if (this.m_fd) {
					var format = 'yyyyMMddhhmmss';
					fs.closeSync(this.m_fd);
					if (cut) {
						try {
							fs.renameSync(fb(this.m_pathname), fb(`${this.m_pathname}-${this.m_fd_open_time.toString(format)}-${now.toString(format)}`));
						} catch(err) {
							console.error(err);
						}
					}
					this.m_fd = 0;
				}
				this.m_fd = fs.openSync(fb(this.m_pathname), 'a');
				this.m_fd_open_time = now;
			}
		} else {
			this.m_fd = 0;
		}
	}

	private _print(TAG: string, style: string, func: any, ...args: any[]) {
		args.unshift(TAG + ' ' + new Date().toString('yyyy-MM-dd hh:mm:ss.fff'));

		if (this._prefix) {
			args.unshift(this._prefix);
		}

		let log = args.map(e=>{
			try {
				return typeof e == 'object' ? this._Indent ? JSON.stringify(e, null, 2): JSON.stringify(e): e;
			} catch(e) {
				return e;
			}
		}).join(' ');

		if (style) {
			func.call(console, '%c' + log, style);
		} else {
			func.call(console, ...args);
		}

		if (this.m_fd) {
			let cutTime = this.autoCutFileTime;
			if (cutTime && Date.now() - this.m_fd_open_time.valueOf() > cutTime) {
				this.reopen(true);
			}
			fs.write(this.m_fd, log + '\n', (err:any)=>{
				if (err) {
					this.reopen();
				}
			});
		}

		this.trigger('Log', { prefix: this._prefix, tag: TAG, data: log });

		return log;
	}

	makeDefault() {
		console.log = this.log.bind(this);
		console.error = this.error.bind(this);
		console.dir = this.dir.bind(this);
		console.warn = this.warn.bind(this);
		console.time = this.time.bind(this);
		console.timeLog = this.timeLog.bind(this);
		(console as any).timeline = this.timeline.bind(this);
		console.timeEnd = this.timeEnd.bind(this);
		(<any>console)._log = (<any>this)._log = log;
		(<any>console)._error = (<any>this)._error = error;
		(<any>console)._dir = (<any>this)._dir = dir;
		(<any>console)._warn = (<any>this)._warn = warn;
		cur = this;
		return this;
	}

	static get defaultInstance() {
		if (!cur) {
			cur = new Console().makeDefault();
		}
		return cur;
	}

	log(msg: any, ...args: any[]) {
		return this._print('LOG', '', log, msg, ...args);
	}

	warn(msg: any, ...args: any[]) {
		return this._print('WARN', 'color: #a89d7f; background: #fffbe9', log, msg, ...args);
	}

	error(msg: any, ...args: any[]) {
		return this._print('ERR', '', error, msg, ...args);
	}

	fault(msg: any, ...args: any[]) {
		return this._print('Fault', '', error, msg, ...args);
	}

	dir(msg: any, ...args: any[]) {
		return this._print('DIR', '', dir, msg, ...args);
	}

	print(tag: string, ...args: any[]) {
		return this._print(tag, '', log, ...args);
	}

	time(tag: string = '') {
		if (this.m_timeStack.has(tag))
			return warn(tag, 'already exists for console.time()');
		var date = new Date();
		var time = { date, tag, timelines: [{ date, tag }] };
		this.m_timeStack.set(tag, time);
		this.log(timeSpace(this), 'Time    ', formatTime(time.date), ' ', tag);
	}

	timeLog(tag: string = '', ...data: any[]) {
		this._timelog(tag, 'TimeLine', data);
	}

	/**
	 * @deprecated Use console.timeLog() instead.
	 */
	timeline(tag: string = '', ...data: any[]) {
		this._timelog(tag, 'TimeLine', data);
	}

	private _timelog(tag: string, prefix: string, data: any[]) {
		var time = this.m_timeStack.get(tag);
		if (!time)
			return warn(`No such label '${tag}' for console.timeLog()`);
		var privline = time.timelines.indexReverse(0);
		var line = { tag, date: new Date() };
		time.timelines.push(line);
		this.log(timeSpace(this), prefix, 
			formatTime(line.date), line.date.valueOf() - privline.date.valueOf(), tag, ...data);
	}

	timeEnd(tag: string = '') {
		var time = this.m_timeStack.get(tag);
		if (!time)
			return warn(`No such label '${tag}' for console.timeEnd()`);
		var { tag: tag1, timelines } = time;
		this._timelog(tag, 'TimeEnd ', []);
		this.m_timeStack.delete(tag);
		this.log(timeSpace(this), 'Finish  ', formatTime(timelines[0].date), tag1);
		timelines.forEach((e, j: number)=>{
			if (j) {
				this.log(timeSpace(this), '---->   ', 
					formatTime(e.date), e.date.valueOf() - timelines[j-1].date.valueOf(), e.tag);
			} else {
				// this.log(timeSpace(this), '---->   ', formatTime(e.date), ' ' ,e.tag);
			}
		});
		this.log(timeSpace(this), 'Total   ', '--------------------', tag1, 
			timelines.indexReverse(0).date.valueOf() - timelines[0].date.valueOf(), '--------------------');
	}

}

export default console;