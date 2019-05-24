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

var util = require('./util');

/**
 * @class ModelBasic
 */
class ModelBasic {

	get value() {
		return this.m_value;
	}

	get table() {
		return this.m_table;
	}

	constructor(value = null, {dao,table} = {}) {
		this.m_value = value;
		this.m_dao = dao;
		this.m_table = table;
	}

	toJSON() {
		return this.m_value;
	}

	fetch() {}
	child() {}

}

/**
 * @class Model
 */
class Model extends ModelBasic {

	async fetch(table, param, { key, select='select', ...opts } = {}) {
		var dao = this.m_dao;
		var fk = key || dao.$.primaryKey(table);
		var value = this.m_value;
		var model = await dao[table][select].get({ [fk]: value[fk], ...param}, opts);
		this.m_value[table] = model;
		return this;
	}

	async fetchChild(table, param, { key, select='select', ...opts } = {}) {
		var dao = this.m_dao;
		var pk = key || dao.$.primaryKey(this.m_table);
		var value = this.m_value;
		var collection = await dao[table][select]({ [pk]: value[pk], ...param}, opts);
		this.m_value[table] = collection;
		return this;
	}

}

/**
 * @class Collection
 */
class Collection extends ModelBasic {

	constructor(value = [], opts = {}) {
		super(value, opts);
		this.m_map = {};
		this.m_ids = [];
		var pk = this.m_dao.$.primaryKey(this.m_table);

		for (var m of this.m_value) {
			var id = m.value[pk];
			if (id) {
				this.m_ids.push(id);
				this.m_map[id] = m;
			}
		}
	}

	get(id) {
		return this.m_map[id];
	}

	get ids() {
		return this.m_ids;
	}

	async fetch(table, param, { key, select='select', ...opts } = {}) {
		var dao = this.m_dao;
		var pk0 = dao.$.primaryKey(table);
		var fk = key || pk0;
		var ids = this.m_value.map(e=>e.value[fk]).filter(e=>e);
		if (ids.length) {
			var collection = await dao[table][select]({ [fk]:ids, ...param}, opts);
			var map = collection.m_map;
			if (fk != pk0) {
				map = {};
				for (var m of collection.m_value) {
					var id = m.value[fk];
					if (id) {
						map[id] = m;
					}
				}
			}
			this.m_value.forEach(({m_value})=>{
				m_value[table] = map[m_value[fk]] || null;
			});
		}
		return this;
	}

	async fetchChild(table, param, { key, select='select', ...opts } = {}) {
		var dao = this.m_dao;
		var pk0 = dao.$.primaryKey(this.m_table);
		var pk = key || pk0;
		var ids = this.m_value.map(e=>e.value[pk]).filter(e=>e);

		if (ids.length) {
			var collection = await dao[table][select]({ [pk]:ids, ...param}, opts);
			var map = {};
			for (var m of collection.m_value) {
				var id = m.value[pk];
				if (id) {
					var ls = map[id];
					if (!ls)
						map[id] = ls = [];
					ls.push(m);
				}
			}
			this.m_value.forEach(({m_value})=>{
				m_value[table] = map[m_value[pk]] || [];
			});
		}
		return this;
	}

}


module.exports = {
	Model,
	Collection,
};
