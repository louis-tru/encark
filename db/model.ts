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

import utils from '../util';
import * as sql from './map';

function pkeyValue(self: ModelBasic, keyPath: string[]): string {
	var m: any = self;
	for (var key of keyPath) {
		// TODO private visit
		m = m.m_value[key];
		if (!m)
			return m;
	}
	return m;
}

function primaryKey(mkey: string) {
	var [key,key2] = mkey.split('=');
	var fetchKeyPath = (key2 || key).split('.');
	return {
		pkeyName: key2 ? key: fetchKeyPath.indexReverse(0),
		fetchKeyPath,
	};
}

export interface Options {
	dataSource?: sql.DataSource;
	table?: string;
}

export interface FetchOptions extends sql.Options {
	key?: string,
	table?: string,
	method?: string,
}

/**
 * @class ModelBasic
 */
export abstract class ModelBasic {

	protected m_value: any;
	protected m_ds: sql.DataSource | null;
	protected m_table: string;
	protected m_parent: ModelBasic | null = null;

	get baseValue() {
		return this.m_value;
	}

	get table() {
		return this.m_table;
	}

	get parent() {
		return this.m_parent;
	}

	constructor(value: any = null, opts: Options = {}) {
		this.m_value = value;
		this.m_ds = opts.dataSource || null;
		this.m_table = opts.table || '';
	}

	toJSON() {
		return this.m_value;
	}

	abstract fetch(name: string, param?: sql.QueryParams, options?: FetchOptions): Promise<this>;
	abstract fetchChild(name: string, param?: sql.QueryParams, options?: FetchOptions): Promise<this>;

}

/**
 * @class Model
 */
export class Model<T = Dict> extends ModelBasic {

	get value(): T {
		return <T>this.m_value;
	}

	async fetch(name: string, param?: sql.QueryParams, { key, table, method='select', ...opts }: FetchOptions = {}) {
		var _table = table || name;
		var ds = <sql.DataSource>this.m_ds;
		utils.assert(ds);
		var {pkeyName,fetchKeyPath} = primaryKey(key || ds.primaryKey(_table));
		var model = await ds.dao[_table][method].get({ [pkeyName]: pkeyValue(this,fetchKeyPath), ...param}, opts);
		this.m_value[name] = model;
		return this;
	}

	async fetchChild(name: string, param?: sql.QueryParams, { key, table, method='select', ...opts }: FetchOptions = {}) {
		var _table = table || name;
		var ds = <sql.DataSource>this.m_ds;
		utils.assert(ds);
		var {pkeyName,fetchKeyPath} = primaryKey(key || ds.primaryKey(this.m_table));
		var collection = <Collection<Dict>>await ds.dao[_table][method]({ [pkeyName]: pkeyValue(this,fetchKeyPath), limit: 0, ...param}, opts);
		// TODO private visit
		(<any>collection).m_parent = this;
		this.m_value[name] = collection;
		return this;
	}

}

export type ID = string | number;

/**
 * @class Collection
 */
export class Collection<T = Dict> extends ModelBasic {

	private m_map: Map<ID, Model<T>> = new Map();
	private m_ids: ID[] = [];
	private m_index: number = 0;
	private m_total: number = 0;

	constructor(value: Model<T>[] = [], opts: Options = {}) {
		super(value, opts);
		var ds = <sql.DataSource>this.m_ds;
		utils.assert(ds);
		var pk = ds.primaryKey(this.m_table);
		for (var m of this.m_value) {
			var id = <ID>m.value[pk];
			if (id) {
				this.m_ids.push(id);
				this.m_map.set(id, m);
			}
		}
	}

	get value(): Model<T>[] {
		return <Model<T>[]>this.m_value;
	}

	get(id: ID) {
		return this.m_map.get(id);
	}

	get total() {
		return this.m_total || this.length;
	}

	set total(value) {
		this.m_total = Number(value) || 0;
	}

	get index() {
		return this.m_index;
	}

	set index(value) {
		this.m_index = Number(value) || 0;
	}

	get length(): number {
		return (<T[]>this.m_value).length;
	}

	get IDs() {
		return this.m_ids;
	}

	async fetch(name: string, param?: sql.QueryParams, { key, table, method='select', ...opts }: FetchOptions = {}) {
		var _table = table || name;
		var ds = <sql.DataSource>this.m_ds;
		utils.assert(ds);
		var pk0 = ds.primaryKey(_table);
		var {pkeyName,fetchKeyPath} = primaryKey(key || pk0);
		var ids_set: Set<string> = new Set;
		var ids = this.value
			.map( (m)=>pkeyValue(m,fetchKeyPath) )
			.filter( (e: string)=>{
				if (e) {
					if (!ids_set.has(e)) {
						ids_set.add(e);
						return true;
					}
				}
				return false;
			});

		if (ids.length) {
			var collection = <Collection<any>>await ds.dao[_table][method]({ [pkeyName]:ids, limit: 0, ...param}, opts);
			var map = collection.m_map;
			if (pkeyName != pk0) {
				map = new Map();
				for (var m of collection.value) {
					var id = m.value[pkeyName];
					if (id)
						map.set(id, m);
				}
			}
			this.value.forEach(e=>{
				// TODO private visit
				(<any>e).m_value[name] = map.get(pkeyValue(e, fetchKeyPath)) || null;
			});
		}
		return this;
	}

	async fetchChild(name: string, param?: sql.QueryParams, { key, table, method='select', ...opts }: FetchOptions = {}) {
		var _table = table || name;
		var ds = <sql.DataSource>this.m_ds;
		utils.assert(ds);
		var pk0 = ds.primaryKey(this.m_table);
		var {pkeyName,fetchKeyPath} = primaryKey(key || pk0);
		var ids_set: Set<string> = new Set();
		var ids = this.value
			.map( (m)=>pkeyValue(m,fetchKeyPath) )
			.filter( (e: string)=>{
				if (e) {
					if (!ids_set.has(e)) {
						ids_set.add(e);
						return true;
					}
				}
				return false;
			});

		if (ids.length) {
			var collection = <Collection<any>>await ds.dao[_table][method]({ [pkeyName]:ids, limit: 0, ...param}, opts);
			var map = new Map<ID, Collection<any>>();
			for (var m of collection.m_value) {
				var id = <ID>m.m_value[pkeyName];
				if (id) {
					var col = map.get(id);
					var ls: Model<any>[];
					if (col) {
						ls = col.m_value;
					} else {
						ls = [];
						map.set(id, new Collection(ls, {table: _table, dataSource: ds}) );
					}
					ls.push(m);
				}
			}
			this.value.forEach(e=>{
				// TODO private visit
				var v = <any>e.value;
				var col = map.get(pkeyValue(e, fetchKeyPath)) || new Collection([],{table:_table, dataSource: ds});
				v[name] = col;
				col.m_parent = e;
			});
		}
		return this;
	}

	toJSON() {
		if (this.m_parent) {
			return this.m_value;
		} else {
			return {
				index: this.m_index,
				total: this.total,
				length: this.m_value.length,
				value: this.m_value,
			};
		}
	}

}