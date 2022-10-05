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

import {WSConversation} from './conv';
import * as querystring from 'querystring';
import * as http from 'http';

const protocol_versions: Dict = {
	'7': WSConversation,
	'8': WSConversation,
	'9': WSConversation,
	'10': WSConversation,
	'11': WSConversation,
	'12': WSConversation,
	'13': WSConversation,
	'14': WSConversation,
	'15': WSConversation,
	'16': WSConversation,
	'17': WSConversation,
};

/**
 * @func upgrade() create websocket
 * @arg  {http.ServerRequest} req
 * @arg  {Buffer}             upgradeHead
 * @ret {Conversation}
 */
export default function upgrade(req: http.IncomingMessage, upgradeHead: any) {
	var mat = decodeURI(req.url || '').match(/\?(.+)/);
	var params = querystring.parse(mat ? mat[1] : '');
	var bind_services = params.bind_services || '';
	var version = <string>req.headers['sec-websocket-version'];
	
	if (version) {
		var klass = protocol_versions[version];
		if (klass) {
			return new klass(req, upgradeHead, bind_services);
		}
	}
	req.socket.destroy();
	console.warn('Unrecognized websocket protocol header');
}
