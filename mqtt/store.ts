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

import {Readable} from 'stream';
import * as parser from './parser';

/**
 * Module dependencies
 */
function xtend<A extends any[]>(...args: A) {
	return Object.assign({}, ...args);
}

interface StreamsOpts {
	objectMode: boolean;
}

interface Options {
	clean: boolean;
}

const streamsOpts: StreamsOpts = { objectMode: true }
const defaultStoreOptions: Options = { clean: true }

/**
 * es6-map can preserve insertion order even if ES version is older.
 *
 * https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map#Description
 * It should be noted that a Map which is a map of an object, especially
 * a dictionary of dictionaries, will only map to the object's insertion
 * order. In ES2015 this is ordered for objects but for older versions of
 * ES, this may be random and not ordered.
 *
 */

interface Callback {
	(e?: Error, d?: any): void;
}

export default class Store {

	private _inflights = new Map();

	readonly options: Options;

	/**
	 * In-memory implementation of the message store
	 * This can actually be saved into files.
	 *
	 * @param {Object} [options] - store options
	 */
	constructor(options?: Options) {
		this.options = xtend(defaultStoreOptions, options)
	}

	/**
	 * Adds a packet to the store, a packet is
	 * anything that has a messageId property.
	 *
	 */
	put(packet: parser.Packet, cb: Callback) {
		this._inflights.set(packet.messageId, packet)

		if (cb) {
			cb()
		}

		return this
	}

	/**
	 * Creates a stream with all the packets in the store
	 *
	 */
	createStream() {
		var stream = new Readable(streamsOpts)
		var destroyed = false
		var values: any[] = []
		var i = 0

		this._inflights.forEach(function (value, key) {
			values.push(value)
		})

		stream._read = function () {
			if (!destroyed && i < values.length) {
				this.push(values[i++])
			} else {
				this.push(null)
			}
		}

		stream.destroy = function (this: Readable) {
			if (!destroyed) {
				var self = this

				destroyed = true

				process.nextTick(function () {
					self.emit('close')
				});
			}

			return this;
		} as any;

		return stream
	}

	/**
	 * deletes a packet from the store.
	 */
	del(packet: parser.Packet, cb: Callback) {
		packet = this._inflights.get(packet.messageId)
		if (packet) {
			this._inflights.delete(packet.messageId)
			cb(undefined, packet)
		} else if (cb) {
			cb(new Error('missing packet'))
		}
		return this
	}

	/**
	 * get a packet from the store.
	 */
	get(packet: parser.Packet, cb: Callback) {
		packet = this._inflights.get(packet.messageId)
		if (packet) {
			cb(undefined, packet)
		} else/* if (cb)*/ {
			cb(new Error('missing packet'))
		}
		return this
	}

	/**
	 * Close the store
	 */
	close(cb?: Callback) {
		if (this.options.clean) {
			(<any>this)._inflights = null
		}
		if (cb) {
			cb()
		}
	}

}
