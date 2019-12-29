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

/* Mnemonic => Command code */
/* Command code => mnemonic */
export enum types {
	reserved,
	connect,
	connack,
	publish,
	puback,
	pubrec,
	pubrel,
	pubcomp,
	subscribe,
	suback,
	unsubscribe,
	unsuback,
	pingreq,
	pingresp,
	disconnect,
	reserve,
}

class CONSTANTS {

/* Header */
	readonly CMD_SHIFT = 4;
	readonly CMD_MASK = 0xF0;
	readonly DUP_MASK = 0x08;
	readonly QOS_MASK = 0x03;
	readonly QOS_SHIFT = 1;
	readonly RETAIN_MASK = 0x01;

/* Length */
	readonly LENGTH_MASK = 0x7F;
	readonly LENGTH_FIN_MASK = 0x80;

/* Connack */
	readonly SESSIONPRESENT_MASK = 0x01;
	readonly SESSIONPRESENT_HEADER = Buffer.from([this.SESSIONPRESENT_MASK]);
	readonly CONNACK_HEADER = Buffer.from([types['connack'] << this.CMD_SHIFT]);

/* Connect */
	readonly USERNAME_MASK = 0x80;
	readonly PASSWORD_MASK = 0x40;
	readonly WILL_RETAIN_MASK = 0x20;
	readonly WILL_QOS_MASK = 0x18;
	readonly WILL_QOS_SHIFT = 3;
	readonly WILL_FLAG_MASK = 0x04;
	readonly CLEAN_SESSION_MASK = 0x02;
	readonly CONNECT_HEADER = Buffer.from([types['connect'] << this.CMD_SHIFT]);

	/* Publish */
	readonly PUBLISH_HEADER = this.genHeader('publish');

	/* Subscribe */
	readonly SUBSCRIBE_HEADER = this.genHeader('subscribe');

	/* Unsubscribe */
	readonly UNSUBSCRIBE_HEADER = this.genHeader('unsubscribe');

	/* Confirmations */
	readonly ACKS = {
		unsuback: this.genHeader('unsuback'),
		puback: this.genHeader('puback'),
		pubcomp: this.genHeader('pubcomp'),
		pubrel: this.genHeader('pubrel'),
		pubrec: this.genHeader('pubrec')
	};

	readonly SUBACK_HEADER = Buffer.from([types['suback'] << this.CMD_SHIFT]);

	/* Protocol versions */
	readonly VERSION3 = Buffer.from([3])
	readonly VERSION4 = Buffer.from([4])

	/* QoS */
	readonly QOS = [0, 1, 2].map(function (qos) {
		return Buffer.from([qos])
	});

	/* Empty packets */
	readonly EMPTY = {
		pingreq: Buffer.from([types['pingreq'] << 4, 0]),
		pingresp: Buffer.from([types['pingresp'] << 4, 0]),
		disconnect: Buffer.from([types['disconnect'] << 4, 0])
	};

	private genHeader(type: string) {
		var self = this;
		return [0, 1, 2].map(function (qos) {
			return [0, 1].map(function (dup) {
				return [0, 1].map(function (retain) {
					var buf = Buffer.alloc(1)
					buf.writeUInt8(
						(<any>types)[type] << self.CMD_SHIFT |
						(dup ? self.DUP_MASK : 0) |
						qos << self.QOS_SHIFT | retain, 0)
					return buf
				})
			})
		})
	}

}

export default new CONSTANTS();
