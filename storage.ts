/* ***** BEGIN LICENSE BLOCK *****
 * Distributed under the BSD license:
 *
 * Copyright (c) 2015, blue.chu
 * All rights reserved.
 * 
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *     * Redistributions of source code must retain the above copyright
 *       notice, this list of conditions and the following disclaimer.
 *     * Redistributions in binary form must reproduce the above copyright
 *       notice, this list of conditions and the following disclaimer in the
 *       documentation and/or other materials provided with the distribution.
 *     * Neither the name of blue.chu nor the
 *       names of its contributors may be used to endorse or promote products
 *       derived from this software without specific prior written permission.
 * 
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
 * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL blue.chu BE LIABLE FOR ANY
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

const { isNode, isQuark, isWeb } = util;

if (isWeb) {

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
		} catch(e) {
			console.warn('encark#storage#paese_value', e);
		}
		return null;
	};

} else {
	if (isQuark) {
		var fs = __binding__('_fs');
	} else if (isNode) {
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

var shared: IStorageSync | null = null;

export interface IStorage {
	get<T = any>(key: string, defaultValue?: T): Promise<T>;
	has(key: string): Promise<boolean>;
	set(key: string, value: any): Promise<void>;
	delete(key: string): Promise<void>;
	clear(): Promise<void>;
}

export interface IStorageSync extends IStorage {
	getSync<T = any>(key: string, defaultValue?: T): T;
	hasSync(key: string): boolean;
	setSync(key: string, value: any): void;
	deleteSync(key: string): void;
	clearSync(): void;
}

/**
 * @class Storage
 */
export class Storage implements IStorageSync {

	private m_path: string;
	private m_prefix: string = '';
	private m_change: boolean = false;
	private m_value: Dict = {};
	private m_sync: any;

	constructor(path?: string) {
		this.m_path = url.fallbackPath(path?path:(isWeb ? location.origin: url.cwd()) + '/' + '.storage');
		this.m_value = {};

		if (isWeb) {
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

	async get<T = any>(key: string, defaultValue?: T) { return this.getSync(key, defaultValue) }
	async has(key: string) { return this.hasSync(key) }
	async set(key: string, value: any) { this.setSync(key, value) }
	async delete(key: string) { this.deleteSync(key) }
	async clear() { this.clearSync() }

	getSync(key: string, defaultValue?: any) {
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

	hasSync(key: string) {
		key = format_key(this, key);
		return key in this.m_value;
	}

	setSync(key: string, value: any) {
		key = format_key(this, key);
		this.m_value[key] = stringify_val(value);
		commit(this);
	}

	deleteSync(key: string) {
		key = format_key(this, key);
		delete this.m_value[key];
		commit(this);
	}

	clearSync() {
		if (isWeb) {
			var keys: any[] = [];
			for (var i in this.m_value) {
				if (i.substring(0, this.m_prefix.length) == this.m_prefix) {
					keys.push(i);
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

}

function _shared(): IStorageSync {
	if (!shared) {
		shared = new Storage();
	}
	return shared;
}

export default {

	get shared() {
		return _shared();
	},

	setShared: function(value: IStorageSync) {
		shared = value;
	},

	get: function(key: string, defaultValue?: any) {
		return _shared().getSync(key, defaultValue);
	},

	has: function(key: string) {
		return _shared().hasSync(key);
	},

	set: function(key: string, value: any) {
		return _shared().setSync(key, value);
	},

	delete: function(key: string) {
		return _shared().deleteSync(key);
	},

	clear: function() {
		return _shared().clearSync();
	},

};
