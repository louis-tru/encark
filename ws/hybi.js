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

var crypto = require('crypto');
var {Conversation} = require('./conv');
var { PacketParser, sendDataPacket, sendPingPacket } = require('./parser');
var errno = require('../errno');

var KEEP_ALIVE_TIME = 5e4;

/**
 * @class Hybi
 */
class Hybi extends Conversation {

	constructor(req, upgradeHead, bind_services_name) {
		super(req, bind_services_name);
	}

	/**
	 * @func handshakes()
	 */
	handshakes() {
		var self = this;
		var req = self.request;
		var socket = self.socket;
		var key = req.headers['sec-websocket-key'];
		var origin = req.headers['sec-websocket-origin'];
		// var location = (socket.encrypted ? 'wss' : 'ws') + '://' + req.headers.host + req.url;
		var upgrade = req.headers.upgrade;

		if (!upgrade || upgrade.toLowerCase() !== 'websocket') {
			console.error('connection invalid');
			return false;
		}
		
		if (!self.verifyOrigin(origin)) {
			console.error('connection invalid: origin mismatch');
			return false;
		}

		if (!key) {
			console.error('connection invalid: received no key');
			return false;
		}

		// calc key
		var shasum = crypto.createHash('sha1');
		shasum.update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11');
		key = shasum.digest('base64');

		var headers = [
			'HTTP/1.1 101 Switching Protocols',
			'Upgrade: websocket',
			'Connection: Upgrade',
			'Session-Token: ' + self.token,
			'Sec-WebSocket-Accept: ' + key,
		];

		try {
			socket.write(headers.concat('', '').join('\r\n'));
		}
		catch (e) {
			console.error(e);
			return false;
		}

		return true;
	}

	/**
	 * @overwrite
	 */
	initialize() {
		if (!this.handshakes()) {
			return false;
		}
		var self = this;
		var socket = this.socket;
		var parser = new PacketParser();

		//socket.setNoDelay(true);
		socket.setTimeout(0);
		socket.setKeepAlive(true, KEEP_ALIVE_TIME);

		socket.on('timeout', e=>self.close());
		socket.on('end', e=>self.close());
		socket.on('close', e=>self.close());
		socket.on('data', e=>parser.add(e));
		socket.on('error', function (e) {
			var socket = self.socket;
			self.close();
			if (socket)
				socket.destroy();
		});
		
		parser.onText.on(e=>self.handlePacket(0, e.data));
		parser.onData.on(e=>self.handlePacket(1, e.data));
		parser.onPing.on(e=>self.onPing.trigger());
		parser.onClose.on(e=>self.close());
		parser.onError.on(e=>(console.error('web socket parser error:',e.data),self.close()));

		return true;
	}

	/**
	 * @overwrite
	 */
	send(data) {
		if (this.isOpen) {
			try {
				sendDataPacket(this.socket, data);
			} catch (e) {
				console.error(e);
				this.close();
			}
		} else {
			throw Error.new(errno.ERR_CONNECTION_CLOSE_STATUS);
		}
	}

	pong() {
		if (this.isOpen) {
			try {
				sendPingPacket(this.socket);
			} catch (e) {
				console.error(e);
			}
		}
	}

	/**
	 * @overwrite
	 */
	close () {
		if (this.isOpen) {
			var socket = this.socket;
			socket.removeAllListeners('end');
			socket.removeAllListeners('close');
			socket.removeAllListeners('error');
			socket.removeAllListeners('data');
			if (socket.writable) 
				socket.end();
			this.onClose.trigger();
		}
	}

}

module.exports = {
	PacketParser, Hybi
};
