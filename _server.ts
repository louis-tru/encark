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
import {Router, Rule} from './router';
import {Notification, EventNoticer, Event} from './event';
import * as http from 'http';
import * as net from 'net';
import * as fs from './fs';
import * as path from 'path';
import incoming_form from './incoming_form';
import * as _conv from './ws/_conv';
import {Service} from './service';
import {StaticService} from './static_service';
import {Descriptors} from './http_service';

var shared: Server | null = null;
var mimeTypes: Dict = {};
var default_root: string[] = [process.cwd()];
var default_temp: string = incoming_form.temp_dir;

function read_mime(filename: string) {
	var data = fs.readFileSync(  __dirname + '/' + filename ) + '';
	var ls = data.replace(/ *#.*\r?\n?/g, '').split(/\n/);
	
	for (var i = 0; i < ls.length; i++) {
		var item = ls[i].replace(/^\s|\s$|;\s*$/g, '')
			.replace(/\s+|\s*=\s*/, '*%*').split('*%*');
			
		var key = item[0];
		var value = item[1];
		if (value) {
			var values = value.split(/\s+/);
			var len2 = values.length;
			
			for(var j = 0; j < len2; j++){
				mimeTypes[values[j]] = key;
			}
		}
	}
}

read_mime('mime.types');
read_mime('mime+.types');

export interface Options {
	host?: string;
	printLog?: boolean;
	autoIndex?: boolean;
	mimeTypes?: Dict<string>;
	errorStatus?: Dict<string>;
	agzip?: boolean;
	origins?: string[];
	allowOrigin?: string;
	port?: number;
	fileCacheTime?: number;
	expires?: number;
	timeout?: number;
	session?: number;
	maxFileSize?: number;
	maxFormDataSize?: number;
	maxUploadFileSize?: number;
	textEncoding?: string;
	defaults?: string[];
	formHash?: string;
	disable?: RegExp | string | string[];
	root?: string | string[];
	temp?: string;
	virtual?: string;
	gzip?: RegExp | string | false;
	staticService?: string;
	router?: Rule[];
	tryFiles?: string;
}

/**
	* @class Server
	*/
export abstract class Server extends Notification {

	protected _isRun: boolean = false;
	protected _wsConversations = new Map<string, _conv.ConversationBasic>();// Dict<_conv.ConversationBasic> = {};
	private _server: http.Server;
	private _host: string = '';
	private _port: number = 0; // 自动端口
	private _serviceCls: Dict<typeof Service> = {};

	get host() { return this._host }
	get port() { return this._port }

	/**
	 * 获取所有的服务名称列表
	 */
	get services() { return Object.keys(this._serviceCls) }

	/**
		* 打印log
		*/
	readonly printLog: boolean = !!util.config.moreLog;

	/**
	 * session timeout default 15 minutes
	 * @type {Number}
	 */
	readonly session: number = 15;

	/**
	 * @type {String}
	 */
	readonly formHash: string = 'md5';

	/**
	 * 站点根目录
	 * @type {String}
	 */
	readonly root: string[] = default_root;

	/**
	 * 临时目录
	 * @type {String}
	 */
	readonly temp: string = default_temp;

	/**
	 * 站点虚拟目录
	 * @type {String}
	 */
	readonly virtual: string = '';

	/**
	 * web socket conversation verify origins
	 * @type {String[]}
	 */
	readonly origins: string[] = ['*:*'];

	/**
	 * @type {String}
	 */
	readonly allowOrigin: string = '*';

	/**
	 * 是否浏览静态文件目录
	 * @type {Boolean}
	 */
	readonly autoIndex: boolean = false;

	/**
	 * 静态缓存文件过期时间,以分钟为单位,为默认为30天
	 * @type {Number}
	 */
	readonly expires: number = 60 * 24 * 30;

	/**
	 * 静态文件缓存,该值可减低硬盘静态文件读取次数,但需要消耗内存,单位(秒)
	 * @type {Number}
	 */
	readonly fileCacheTime: number = 10;

	/**
	 * Download file size limit
	 * @type {Number}
	 */
	readonly maxFileSize: number = 5 * 1024 * 1024;

	/**
	 * Max form data size limit
	 */
	readonly maxFormDataSize: number = 5 * 1024 * 1024;

	/**
	 * Upload file size limit
	 * @type {Number}
	 */
	readonly maxUploadFileSize: number = 5 * 1024 * 1024;

	/**
	 * 文本文件编码,默认为utf-8
	 */
	readonly textEncoding: string = 'utf-8';

	/**
	 * 错误文件指向
	*/
	readonly tryFiles = '';

	/**
	 * 请求超时时间(毫秒)
	 * @type {Number}
	 */
	get timeout() {
		return this._server.timeout;
	}

	/**
	 * 静态gzip文件格式
	 * defaults javascript|text|json|xml
	 * @type {Regexp}
	 */
	readonly gzip: RegExp | boolean = /javascript|text|json|xml/i;

	/**
	 * 是否动态数据内容压缩
	 * @type {Boolean}
	 */
	readonly agzip: boolean = true;

	/**
	 * 默认页
	 * @type {String[]}
	 */
	readonly defaults: string[] = ['index.html', 'index.htm', 'default.html'];

	/**
	 * 设置禁止访问的目录
	 * @type {RegExp}
	 */
	readonly disable: RegExp = /^\/server/i;

	/**
	 * 错误状态页
	 * @type {Object}
	 */
	readonly errorStatus: Dict<string> = {};

	/**
	 * 配置的文件mime
	 * mime types
	 * @type {Object}
	 */
	readonly mimeTypes: Dict<string> = mimeTypes;

	/**
	 * http请求路由器
	 * @type {Router}
	 */
	readonly router: Router;

	/**
	 * @get impl 
	 */
	get impl() {
		return this._server;
	}

	readonly onWSConversationOpen = new EventNoticer<Event<Server, _conv.ConversationBasic>>('WSConversationOpen', this);
	readonly onWSConversationClose = new EventNoticer<Event<Server, _conv.ConversationBasic>>('WSConversationClose', this);

	/**
	 * 构造函数
	 * @constructor
	 * @param {Object} opt (Optional) 配置项
	 */
	constructor(config?: Options) {
		super();
		this._server = new http.Server();
		this.router = new Router();
		(this._server as any).__wrap__ = this;

		config = config || {};
	
		util.update(this, util.filter(config, [
			'printLog',
			'autoIndex',
			'mimeTypes',
			'errorStatus',
			'agzip',
			'origins',
			'allowOrigin',
			'fileCacheTime',
			'expires',
			'timeout',
			'session',
			'maxFileSize',
			'maxFormDataSize',
			'maxUploadFileSize',
			'textEncoding',
			'defaults',
			'formHash',
			'tryFiles',
		]));

		this._port   = Number(process.env.WEB_SERVER_PORT) || Number(config.port) || 0;
		this._host   = config.host ? String(config.host): '';
		this.root     = config.root ? Array.isArray(config.root) ? 
			config.root.map(e=>path.resolve(e)): [path.resolve(config.root)] : this.root;
		this.temp     = config.temp ? path.resolve(config.temp) : this.temp;

		var disable   = config.disable;

		if (disable) {
			if (Array.isArray(disable)) 
				disable = disable.join(' ');
			disable = String(disable).trim().replace(/\s+/mg, '|');
			this.disable = new RegExp('^\\/(' + disable + ')');
		}
		if (config.virtual) {
			this.virtual = String(config.virtual).trim().replace(/^(\/|\\)*([^\/\\]+)/, '/$2');
		}
	
		if ('gzip' in config) {
			if (config.gzip === false) {
				this.gzip = false;
			} else if (config.gzip instanceof RegExp) {
				this.gzip = config.gzip;
			} else {
				var gzip = String(config.gzip).trim().replace(/\s+/, '|');
				this.gzip = new RegExp('javascript|text|json|xml|' + gzip, 'i');
			}
		}

		fs.mkdirpSync(this.temp);
		
		this.router.config({
			staticService: config.staticService,
			virtual: this.virtual,
			router: config.router,
		});

		this.onWSConversationOpen.on(e=>{
			var conv = e.data;
			this._wsConversations.set(conv.token, conv); // TODO private visit
		});

		this.onWSConversationClose.on(e=>{
			var conv = e.data;
			this._wsConversations.delete(conv.token); // TODO private visit
		});

		this.setService('descriptors', Descriptors);
		this.setService('StaticService', StaticService);

		this.initialize(this._server);
	}

	protected abstract initialize(server: http.Server): void;

	/**
	 * Get wsConversations conversation 
	 */
	get wsConversations(): IterableIterator<_conv.ConversationBasic> {
		return this._wsConversations.values();
	}

	set timeout(timeout: number) {
		timeout = Number(timeout) || this._server.timeout;
		this._server.setTimeout(timeout);
	}

	/**
	 * @func interceptRequest(req, res)
	 */
	interceptRequest(req: http.IncomingMessage, res: http.ServerResponse) {
		return false;
	}

	/**
	 * MIME 获取类型
	 * @param {String}   ename  扩展名或文件名称
	 * @return {String}
	 */
	getMime(name: string) {
		var mat = name.match(/\.([^$\?\/\\\.]+)((#|\?).+)?$/);
		if (mat) {
			name = mat[1];
		}
		name = name.toLowerCase();
		return this.mimeTypes[name] || mimeTypes[name] || 'application/octet-stream';
	}

	/**
	 * 是否正在运行
	 */
	get isRun(){
		return this._isRun;
	}

	/**
	 * 启动服务
	 */
	start() {
		return util.promise<void>((resolve)=>{
			var complete = ()=>{
				var addr = <net.AddressInfo>(this._server).address();
				this._host = addr.address;
				this._port = addr.port;
				this._isRun = true;
				this.trigger('Startup', {});
				resolve();
			}
			if (this._port) {
				this._server.listen(this._port, this._host, complete);
			} else if ( this._host ) {
				this._server.listen(String(this._host), complete);
			} else {
				this._server.listen(complete);
			}
		});
	}

	/**
	 * @func stop() sopt service
	 */
	stop() {
		this._server.close();
	}

	/**
	 * @func restart() restart service
	 */
	restart() {
		this.stop();
		(async ()=>{
			var i = 4;
			while (--i) {
				if (!this._isRun) {
					this.start();
					break;
				}
				await util.sleep(5e2/*500ms*/);
			}
		})().catch(console.error);
	}

	/**
	 * 通过名称获取服务class
	 */
	getService(name: string): typeof Service {
		return this._serviceCls[name];
	}

	/**
	 * @func setService() Registration Service
	*/
	setService(name: string, cls: any) {
		util.assert(util.equalsClass(Service, cls), `"${name}" is not a "Service" type`);
		util.assert(!(name in this._serviceCls), `service repeat definition, "${name}"`);
		cls.id = name;
		this._serviceCls[name] = cls;
	}

	/**
	 * @func removeService() remove service
	*/
	removeService(name: string) {
		delete this._serviceCls[ name ];
	}

}

export default {

	/**
	 * @func setShared
	 */
	setShared: function(server: Server) {
		shared = server;
	},

	/**
	 * @get shared # default web server
	 */
	get shared() {
		return shared;
	},

};
