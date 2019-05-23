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
 * @class Model
 */
class Model {

	get value() {
		return this.m_value;
	}

	get table() {
		return this.m_table;
	}

	constructor(value = null, {dao = null, table = null} = {}) {
		this.m_value = value;
		this.m_dao = dao;
		this.m_table = table;
	}

	toJSON() {
		return this.m_value;
	}

	async fetch(table, param, { select='select', ...opts } = {}) {
		var dao = this.m_dao;
		var fk = dao.primaryKey(this.m_table);
		var pk = dao.primaryKey(table);
		var value = this.m_value;
		var model = await dao[table][select].get({ [pk]: value[fk], ...param}, opts);
		// var model = new Model(child, {dao,table});
		this.m_value[table] = model;
		return this;
	}

	async child(table, param, { select='select', ...opts } = {}) {
		var dao = this.m_dao;
		var fk = dao.primaryKey(table);
		var pk = dao.primaryKey(this.m_table);
		var value = this.m_value;
		var collection = await dao[table][select]({ [fk]: value[pk], ...param}, opts);
		// var collection = new Collection(value, {dao,table});
		this.m_value[table] = collection;
		return this;
	}

}


/**
 * @class Collection
 */
class Collection {

	get value() {
		return this.m_value;
	}

	constructor(value = [], dao = null) {
		this.m_value = value;
	}

	toJSON() {
		return this.m_value;
	}

}


module.exports = {
	Model,
	Collection,
};
