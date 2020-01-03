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

export class ReInterval<A extends any[]> {

	private _args: A;
	private _callback: (...args: A)=>void;
	private _interval: number;
	private _intervalid: any;

	constructor(callback: (...args: A)=>void, interval: number, args: A) {

		if (typeof callback !== 'function')
			throw new Error('callback needed');
		if (typeof interval !== 'number')
			throw new Error('interval needed');

		this._callback = callback;
		this._args = args;
		this._interval = interval;
		this._intervalid = setInterval(callback, interval, this._args);
	}

	reschedule(interval: number) {
		// if no interval entered, use the interval passed in on creation
		if (!interval)
			interval = this._interval;

		if (this._intervalid)
			clearInterval(this._intervalid);

		this._intervalid = setInterval(this._callback, interval, this._args);
	}

	clear() {
		if (this._intervalid) {
			clearInterval(this._intervalid);
			this._intervalid = null;
		}
	}

	destroy() {
		if (this._intervalid) {
			clearInterval(this._intervalid);
			this._intervalid = null;
		}
		(<any>this)._callback = null;
		(<any>this)._args = null;
		(<any>this)._interval = 0;
	}

}

export default function reInterval<A extends any[]>(
	cb: (...args: A)=>void, interval: number, ...args: A) {
	return new ReInterval(cb, interval, args);
}
