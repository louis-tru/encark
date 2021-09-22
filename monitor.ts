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
import errno from './errno';

function clear(self: Watch) {
	clearTimeout((<any>self).m_timeout_id);
	(<any>self).m_running_id = 0;
	(<any>self).m_timeout_id = 0;
	(<any>self).m_run_loop = null;
}

export class Watch {
	private m_interval: number;
	private m_maxDuration: number;
	private m_running_id: number = 0;
	private m_timeout_id: any = 0;
	private m_run_loop: any = null;
	private m_run_starttime: number = 0;

	get interval() { return this.m_interval }
	set interval(val) { this.m_interval = val }
	get maxDuration() { return this.m_maxDuration }
	set maxDuration(val) { this.m_maxDuration = val }

	constructor(interval = 1e3, maxDuration = -1) {
		this.m_interval = interval;
		this.m_maxDuration = maxDuration;
	}

	start<R>(run: (m: Watch)=>Promise<R>|R): Promise<R|null> {
		return new Promise(async (resolve: (r:R|null)=>void, reject)=>{
			if (this.m_running_id) {
				reject(Error.new(errno.ERR_MONITOR_BEEN_STARTED));
			} else {
				var id = utils.id;
				this.m_running_id = id;
				this.m_run_starttime = Date.now();

				var run_loop = async()=>{
					var r: R | null = null;
					if (id == this.m_running_id) {
						try {
							r = await run(this);
							if (id == this.m_running_id) {
								if (this.m_maxDuration == -1 || 
										this.m_maxDuration > (Date.now() - this.m_run_starttime)) {
									this.m_timeout_id = setTimeout(run_loop, this.m_interval);
									return;
								}
							}
						} catch (e) {
							clear(this); 
							reject(e); 
							return;
						}
					}
					clear(this);
					resolve(r); // end
				};
				this.m_run_loop = run_loop;

				run_loop();
			}
		});
	}

	stop() {
		utils.assert(this.m_running_id, errno.ERR_MONITOR_NOT_BEEN_STARTED);
		clearTimeout(this.m_timeout_id);
		this.m_running_id = 0;
		this.m_timeout_id = 0;
		var run_loop = this.m_run_loop;
		if (run_loop) {
			utils.nextTick(()=>{
				if (run_loop === this.m_run_loop)
					run_loop();
			});
		}
	}

	get running() {
		return !!this.m_running_id;
	}

}

export const Monitor: typeof Watch = Watch;
