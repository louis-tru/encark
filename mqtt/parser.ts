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

import bl from './bl';
import { EventEmitter as EE } from 'events';
import constants from './constants';

export class Packet {
	cmd?: string; // null
	retain?: boolean; // false
	qos?: number; // 0
	dup?: boolean; // false
	topic?: string | Buffer; // null
	payload?: string | Buffer; // null
	messageId?: number; // 0
	length?: number; // -1
	protocolId?: string | Buffer;
	protocolVersion?: number;
	will?: {
		topic: string;
		payload: string| Buffer;
		retain?: Boolean;
		qos?: number;
	};
	clean?: boolean;
	keepalive?: number;
	clientId?: string;
	username?: string;
	password?: string | Buffer;
	sessionPresent?: boolean;
	returnCode?: number;
	subscriptions?: { topic: string, qos: number }[]
	unsubscriptions?: string[];
	granted?: number[];
}

class PacketIMPL extends Packet {
	length = -1;
	qos = 0;
}

export default class Parser extends EE {
	private _states = [
		'_parseHeader',
		'_parseLength',
		'_parsePayload',
		'_newPacket'
	];
	private _list = new bl();
	private _stateCounter = 0;
	private _pos = 0;

	packet = new PacketIMPL();
	error: Error | null = null;

	private _resetState() {
		this.packet = new PacketIMPL()
		this.error = null
		this._list = new bl()
		this._stateCounter = 0
	}

	parse(buf: Buffer) {
		if (this.error) this._resetState()

		this._list.append(buf)

		while ((this.packet.length !== -1 || this._list.length > 0) &&
					(<any>this)[this._states[this._stateCounter]]() &&
					!this.error) {
			this._stateCounter++

			if (this._stateCounter >= this._states.length) this._stateCounter = 0
		}

		return this._list.length
	}

	private _parseHeader() {
		// There is at least one byte in the buffer
		var zero = this._list.readUInt8(0)
		this.packet.cmd = constants.types[zero >> constants.CMD_SHIFT]
		this.packet.retain = (zero & constants.RETAIN_MASK) !== 0
		this.packet.qos = (zero >> constants.QOS_SHIFT) & constants.QOS_MASK
		this.packet.dup = (zero & constants.DUP_MASK) !== 0

		this._list.consume(1)

		return true
	}

	private _parseLength() {
		// There is at least one byte in the list
		var bytes = 0
		var mul = 1
		var length = 0
		var result = true
		var current

		while (bytes < 5) {
			current = this._list.readUInt8(bytes++)
			length += mul * (current & constants.LENGTH_MASK)
			mul *= 0x80

			if ((current & constants.LENGTH_FIN_MASK) === 0) break
			if (this._list.length <= bytes) {
				result = false
				break
			}
		}

		if (result) {
			this.packet.length = length
			this._list.consume(bytes)
		}

		return result
	}

	private _parsePayload() {
		var result = false

		// Do we have a payload? Do we have equarkh data to complete the payload?
		// PINGs have no payload
		if (this.packet.length === 0 || this._list.length >= (this.packet.length as number)) {
			this._pos = 0

			switch (this.packet.cmd) {
				case 'connect':
					this._parseConnect()
					break
				case 'connack':
					this._parseConnack()
					break
				case 'publish':
					this._parsePublish()
					break
				case 'puback':
				case 'pubrec':
				case 'pubrel':
				case 'pubcomp':
					this._parseMessageId()
					break
				case 'subscribe':
					this._parseSubscribe()
					break
				case 'suback':
					this._parseSuback()
					break
				case 'unsubscribe':
					this._parseUnsubscribe()
					break
				case 'unsuback':
					this._parseUnsuback()
					break
				case 'pingreq':
				case 'pingresp':
				case 'disconnect':
					// These are empty, nothing to do
					break
				default:
					this._emitError(new Error('Not supported'))
			}

			result = true
		}

		return result
	}

	private _parseConnect() {
		var protocolId // Protocol ID
		var clientId // Client ID
		var topic // Will topic
		var payload // Will payload
		var password // Password
		var username // Username
		var flags: Dict = {}
		var packet = this.packet

		// Parse protocolId
		protocolId = this._parseString()

		if (protocolId === null) return this._emitError(new Error('Cannot parse protocolId'))
		if (protocolId !== 'MQTT' && protocolId !== 'MQIsdp') {
			return this._emitError(new Error('Invalid protocolId'))
		}

		packet.protocolId = protocolId

		// Parse constants version number
		if (this._pos >= this._list.length) return this._emitError(new Error('Packet too short'))

		packet.protocolVersion = this._list.readUInt8(this._pos)

		if (packet.protocolVersion !== 3 && packet.protocolVersion !== 4) {
			return this._emitError(new Error('Invalid protocol version'))
		}

		this._pos++

		if (this._pos >= this._list.length) {
			return this._emitError(new Error('Packet too short'))
		}

		// Parse connect flags
		flags.username = (this._list.readUInt8(this._pos) & constants.USERNAME_MASK)
		flags.password = (this._list.readUInt8(this._pos) & constants.PASSWORD_MASK)
		
		// var will = 
		flags.will = (this._list.readUInt8(this._pos) & constants.WILL_FLAG_MASK)

		if (flags.will) {
			packet.will = {
				topic: '',
				payload: '',
			}
			packet.will.retain = (this._list.readUInt8(this._pos) & constants.WILL_RETAIN_MASK) !== 0
			packet.will.qos = (this._list.readUInt8(this._pos) &
														constants.WILL_QOS_MASK) >> constants.WILL_QOS_SHIFT
		}

		packet.clean = (this._list.readUInt8(this._pos) & constants.CLEAN_SESSION_MASK) !== 0
		this._pos++

		// Parse keepalive
		packet.keepalive = this._parseNum()
		if (packet.keepalive === -1) return this._emitError(new Error('Packet too short'))

		// Parse clientId
		clientId = this._parseString()
		if (clientId === null) return this._emitError(new Error('Packet too short'))
		packet.clientId = clientId

		if (packet.will) {
			// Parse will topic
			topic = this._parseString()
			if (!topic)
				return this._emitError(new Error('Cannot parse will topic'))
			packet.will.topic = topic

			// Parse will payload
			payload = this._parseBuffer()
			if (payload === null) return this._emitError(new Error('Cannot parse will payload'))
			packet.will.payload = payload
		}

		// Parse username
		if (flags.username) {
			username = this._parseString()
			if (username === null) return this._emitError(new Error('Cannot parse username'))
			packet.username = username
		}

		// Parse password
		if (flags.password) {
			password = this._parseBuffer()
			if (password === null) return this._emitError(new Error('Cannot parse password'))
			packet.password = password
		}

		return packet
	}

	private _parseConnack() {
		var packet = this.packet

		if (this._list.length < 2) return null

		packet.sessionPresent = !!(this._list.readUInt8(this._pos++) & constants.SESSIONPRESENT_MASK)
		packet.returnCode = this._list.readUInt8(this._pos)

		if (packet.returnCode === -1) return this._emitError(new Error('Cannot parse return code'))
	}

	private _parsePublish() {
		var packet = this.packet
		packet.topic = this._parseString()

		if (packet.topic === null) return this._emitError(new Error('Cannot parse topic'))

		// Parse messageId
		if (packet.qos > 0) 
			if (!this._parseMessageId()) { return }

		packet.payload = this._list.slice(this._pos, packet.length)
	}

	private _parseSubscribe() {
		var packet = this.packet
		var topic
		var qos

		if (packet.qos !== 1) {
			return this._emitError(new Error('Wrong subscribe header'))
		}

		packet.subscriptions = []

		if (!this._parseMessageId()) { return }

		while (this._pos < packet.length) {
			// Parse topic
			topic = this._parseString()
			if (!topic)
				return this._emitError(new Error('Cannot parse topic'))

			qos = this._list.readUInt8(this._pos++)

			// Push pair to subscriptions
			packet.subscriptions.push({ topic: topic, qos: qos })
		}
	}

	private _parseSuback() {
		this.packet.granted = []

		if (!this._parseMessageId()) { return }

		// Parse granted QoSes
		while (this._pos < this.packet.length) {
			this.packet.granted.push(this._list.readUInt8(this._pos++))
		}
	}

	private _parseUnsubscribe() {
		var packet = this.packet

		packet.unsubscriptions = []

		// Parse messageId
		if (!this._parseMessageId()) { return }

		while (this._pos < packet.length) {
			var topic

			// Parse topic
			topic = this._parseString()

			if (!topic) 
				return this._emitError(new Error('Cannot parse topic'))

			// Push topic to unsubscriptions
			packet.unsubscriptions.push(topic)
		}
	}

	private _parseUnsuback() {
		if (!this._parseMessageId()) return this._emitError(new Error('Cannot parse messageId'))
	}

	private _parseMessageId() {
		var packet = this.packet

		packet.messageId = this._parseNum()

		if (packet.messageId === null) {
			this._emitError(new Error('Cannot parse messageId'))
			return false
		}

		return true
	}

	private _parseString(/*maybeBuffer?: Buffer*/) {
		var length = this._parseNum()
		var result
		var end = length + this._pos

		if (length === -1 || end > this._list.length || end > this.packet.length)
			return;

		result = this._list.toString('utf8', this._pos, end)
		this._pos += length

		return result
	}

	private _parseBuffer() {
		var length = this._parseNum()
		var result
		var end = length + this._pos

		if (length === -1 || end > this._list.length || end > this.packet.length) return null

		result = this._list.slice(this._pos, end)

		this._pos += length

		return result
	}

	private _parseNum() {
		if (this._list.length - this._pos < 2) return -1

		var result = this._list.readUInt16BE(this._pos)
		this._pos += 2

		return result
	}

	private _newPacket() {
		if (this.packet) {
			this._list.consume(this.packet.length)
			this.emit('packet', this.packet)
		}

		this.packet = new PacketIMPL();

		return true
	}

	private _emitError(err: Error) {
		this.error = err
		this.emit('error', err)
	}

}
