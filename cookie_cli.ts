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

const { isWeb } = util;

interface ClientCookie {

	/**
	 * 根据名字取Cookie值
	 * @param {String} name cookie的名称
	 * @return {String} 返回cookie值
	 * @static
	 */
	get(name: string): string | null;

	/**
	 * 获取全部Cookie
	 * @return {Object} 返回cookie值
	 * @static
	 */
	getAll(): Dict;

	/**
	 * 设置cookie值
	 * @param {String}  name 名称
	 * @param {String}  value 值
	 * @param {Date}    expires (Optional) 过期时间
	 * @param {String}  path    (Optional)
	 * @param {String}  domain  (Optional)
	 * @param {Boolran} secure  (Optional)
	 * @static
	 */
	set(name: string, 
		value: string | number | boolean, 
		expires?: Date, 
		path?: string, 
		domain?: string, secure?: boolean
	): void;

	/**
	 * 删除一个cookie
	 * @param {String}  name 名称
	 * @param {String}  path    (Optional)
	 * @param {String}  domain  (Optional)
	 * @static
	 */
	remove(name: string, path?: string, domain?: string): void;

	/**
	 * 删除全部cookie
	 * @static
	 */
	removeAll(): void;
}

var ImplCookie;

if (isWeb)

/**
 * @class ClientCookie
 */
ImplCookie = class implements ClientCookie {

	get(name: string) {
		var i = document.cookie.match(new RegExp(String.format('(?:^|;\\s*){0}=([^;]+)(;|$)', name)));
		return i && decodeURIComponent(i[1]);
	}

	getAll() {
		var cookie: Dict = {};
		for (var item of document.cookie.split(';')) {
			if (item) {
				var sp = item.split('=');
				cookie[sp[0]] = decodeURIComponent(sp[1]);
			}
		}
		return cookie;
	}

	set(name: string, 
		value: string | number | boolean, 
		expires?: Date, 
		path?: string, 
		domain?: string, secure?: boolean
	) {
		var cookie =
			String.format('{0}={1}{2}{3}{4}{5}',
				name, encodeURIComponent(value),
				expires ? '; Expires=' + expires.toUTCString() : '',
				path ? '; Path=' + path : '',
				domain ? '; Domain=' + domain : '',
				secure ? '; Secure' : ''
			);
		document.cookie = cookie;
	}

	remove(name: string, path?: string, domain?: string) {
		this.set(name, 'NULL', new Date(0, 1, 1), path, domain);
	}

	removeAll() {
		for (var i in this.getAll())
			this.remove(i);
	}
}

else

ImplCookie = class implements ClientCookie {
	get(name: string) { return null }
	getAll() { return {} }
	set() {}
	remove() {}
	removeAll() {}
}

export default new ImplCookie() as ClientCookie;
