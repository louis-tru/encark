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

var Early = require('./early').Early;
var Hybi = require('./hybi').Hybi;
var querystring = require('querystring');

var protocol_versions = {
	'7': Hybi,
	'8': Hybi,
	'9': Hybi,
	'10': Hybi,
	'11': Hybi,
	'12': Hybi,
	'13': Hybi,
	'14': Hybi,
	'15': Hybi,
	'16': Hybi,
	'17': Hybi
};

/**
 * @func upgrade() create websocket
 * @arg  {http.ServerRequest} req
 * @arg  {Buffer}             upgradeHead
 * @ret {Conversation}
 */
function upgrade(req, upgradeHead) {
	var mat = decodeURI(req.url).match(/\?(.+)/);
	var params = querystring.parse(mat ? mat[1] : '');
	var bind_services = params.bind_services || '';
	var version = req.headers['sec-websocket-version'];
	
	if (version) {
		var klass = protocol_versions[version];
		if (klass) {
			return new klass(req, upgradeHead, bind_services);
		}
	}
	return new Early(req, upgradeHead, bind_services);
}

module.exports = upgrade;
