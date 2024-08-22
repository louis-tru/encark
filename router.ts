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

interface InlRule {
	match: RegExp;
	keys: string[];
	defaultValue: Dict<string>;
}

export interface Rule {
	match: string;
	service?: string;
	action?: string;
	[prop: string]: any;
}

export interface RuleResult {
	service: string;
	action: string;
	[prop: string]: any;
}

export class Router  {

	/**
	 * 路由规则
	 * @type {InlRule[]}
	 */
	private m_rules: InlRule[] = []
	
	/**
	 * Service to handle static files
	 * @type {String}
	 */
	private m_staticService: string = '';

	/**
	 * 设置路由器
	 * @param {Object} rules   路由配置
	 */
	config({ router = [], virtual = '', staticService }: { router?: Rule[], virtual?: string, staticService?: string }) {
		virtual = virtual || '';

		this.m_staticService = staticService || 'StaticService';
		this.m_rules = [];

		var defines: Rule[] = [ 
			/* 默认api调用路由 */ 
			{ match: '/service-api/{service}/{action}' }, 
			...(Array.isArray(router) ? router : []),
		];

		for (var define of defines) {
			var keys: string[] = [];
			var defaultValue: Dict<string> = {};

			// 创建表达式字符串
			// 替换{name}关键字表达式并且转义表达式中的特殊字符
			var match = (virtual + define.match)
				.replace(/\{([^\}]+)\}|[\|\[\]\(\)\{\}\?\.\+\*\!\^\$\:\<\>\=]/g,
				function (all, key) {
					
					if (key) {
						keys.push(key); // 添加一个关键字
						switch (key) {
							case 'service': return '([\\w\\-\\_\\$]+)';
							case 'action':  return '([\\w\\-\\_\\$]+)';
						}
						// return '([^&\?]+)'; 	// 至少匹配到一个字符
						// return '([^&\?]*?)';   	// 匹配0到多个
						return '([^&\\?]*?)';   	// 匹配0到多个
					} else {
						return '\\' + all;  // 转义
					}
				});
			
			// 额外的url参数不需要在匹配范围,所以不必需从头匹配到尾
			var reg = new RegExp('^' + match + (match.match(/[^\\\*]\?/) ? '' : '(?:\\?|$)'));

			for (var j in define) {
				if (j != 'match') {
					defaultValue[j] = define[j]; // 路由默认属性
				}
			}

			var rule: InlRule = { 
				match: reg, // 用来匹配请求的url,如果成功匹配,把请求发送到目标服务处理
				keys: keys,    // 关键字信息,用来给目标服务提供参数
				defaultValue: defaultValue // 如果匹配成功后,做为目标服务的默认参数
			};

			// 必需要有service、action 关键字,否则丢弃掉
			if ((keys.indexOf('service') !== -1 || defaultValue.service) &&
					(keys.indexOf('action') !== -1 || defaultValue.action)) {
				this.m_rules.push(rule);
			}
		}
	}

	/**
	 * find router info by url
	 * @param  {String} url
	 * @return {Object}
	 */
	match(url: string): RuleResult {
		
		for (var rule of this.m_rules) {
			var mat = url.match(rule.match);
			if (mat) {
				var info = <RuleResult>Object.assign({}, rule.defaultValue);
				for (var j = 1; j < mat.length; j++) {
					info[rule.keys[j - 1]] = mat[j];
				}
				return info;
			}
		}
		// 找不到任何匹配的服务,只能使用使用静态文件服务
		return {
			service: this.m_staticService,
			action: 'unknown'
		};
	}

}