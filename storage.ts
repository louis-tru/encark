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

import util from './util';
import url from './path';
import {DelayCall} from './delay_call';

const { haveNode, haveNgui, haveWeb } = util;

if (haveWeb) {

	var sync_local = function(self: Storage) {}
	var commit = function(self: Storage) {}

	var format_key = function(self: Storage, key: string) {
		return (<any>self).m_prefix + key
	};

	var stringify_val = function(val: any): any {
		return JSON.stringify(val);
	};

	var paese_value = function(val: any): any {
		try { 
			return JSON.parse(val);
		} catch(e) { console.warn(e) }
		return null;
	};

} else {
	if (haveNgui) {
		var fs = __requireNgui__('_fs');
	} else if (haveNode) {
		var fs = require('fs');
	}

	var sync_local = function(self: Storage) {
		if ((<any>self).m_change) {
			fs.writeFileSync((<any>self).m_path, JSON.stringify((<any>self).m_value, null, 2));
			(<any>self).m_change = false;
		}
	};

	var commit = function(self: Storage) {
		(<any>self).m_change = true;
		(<any>self).m_sync.call();
	};

	var format_key = function(self: Storage, key: string) {
		return key
	};

	var stringify_val = function(val: any): any {
		return val;
	};

	var paese_value = function(val: any): any {
		return val;
	};
}

var shared: Storage | null = null;

export interface IStorage {
	get<T = any>(key: string, defaultValue?: T): T;
	has(key: string): boolean;
	set(key: string, value: any): void;
	delete(key: string): void;
	clear(): void;
	commit(): void;
}

/**
 * @class Storage
 */
export class Storage implements IStorage {

	private m_path: string;
	private m_prefix: string = '';
	private m_change: boolean = false;
	private m_value: Dict = {};
	private m_sync: any;

	constructor(path = url.cwd() + '/' + '.storage') {
		this.m_path = url.fallbackPath(path);
		this.m_value = {};

		if (haveWeb) {
			this.m_sync = { call: util.noop };
			this.m_prefix = util.hash(this.m_path || 'default') + '_';
			this.m_value = localStorage;
		} else {
			this.m_sync = new DelayCall(e=>sync_local(this), 100); // 100ms后保存到文件
			if (fs.existsSync(this.m_path)) {
				try {
					this.m_value = JSON.parse(fs.readFileSync(this.m_path, 'utf-8')) || {};
				} catch(e) {}
			}
		}
	}

	get(key: string, defaultValue?: any) {
		key = format_key(this, key);
		if (key in this.m_value) {
			return paese_value(this.m_value[key]);
		} else {
			if (defaultValue !== undefined) {
				this.m_value[key] = stringify_val(defaultValue);
				commit(this);
				return defaultValue;
			}
		}
	}

	has(key: string) {
		key = format_key(this, key);
		return key in this.m_value;
	}

	set(key: string, value: any) {
		key = format_key(this, key);
		this.m_value[key] = stringify_val(value);
		commit(this);
	}

	del(key: string) {
		this.delete(key);
	}

	delete(key: string) {
		key = format_key(this, key);
		delete this.m_value[key];
		commit(this);
	}

	clear() {
		if (haveWeb) {
			var keys: any[] = [];
			for (var i in this.m_value) {
				if (i.substr(0, this.m_prefix.length) == this.m_prefix) {
					keys.push(this.m_value);
				}
			}
			for (var key of keys) {
				delete this.m_value[key];
			}
		} else {
			this.m_value = {};
		}
		commit(this);
	}

	commit() {
		sync_local(this);
	}

	save() {
		this.commit();
	}

}

function _shared(): IStorage {
	if (!shared) {
		shared = new Storage();
	}
	return shared;
}

export default {

	get shared() {
		return _shared();
	},

	setShared: function(value: Storage) {
		shared = value;
	},

	get: function(key: string, defaultValue?: any) {
		return _shared().get(key, defaultValue);
	},

	has: function(key: string) {
		return _shared().has(key);
	},

	set: function(key: string, value: any) {
		return _shared().set(key, value);
	},

	del: function(key: string) {
		return _shared().delete(key);
	},

	clear: function() {
		return _shared().clear();
	},

	save: function() {
		_shared().commit();
	},

	commit: function() {
		_shared().commit();
	},

};
