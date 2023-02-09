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

import * as events from 'events';
import Store from './store';
import eos from './end-of-stream';
import writeToStream from './writeToStream';
import Parser, {Packet} from './parser';
import {Writable} from 'stream';
import reInterval, {ReInterval} from './reinterval';
import validations from './validations';
import * as url from 'url';
import * as net from 'net';
import * as tls from 'tls';
import {Readable} from 'stream';

var protocols = {
	mqtt: stream_builder_tcp,
	tcp: stream_builder_tcp,
	mqtts: stream_builder_ssl,
	ssl: stream_builder_ssl,
	tls: stream_builder_ssl,
};

export type Protocol = 'mqtt' | 'tcp' | 'mqtts' | 'ssl' | 'tls'

export interface CreateOptions {
	url?: string;
	keepalive?: number;
	reschedulePings?: boolean;
	protocolId?: string;
	protocolVersion?: number;
	reconnectPeriod?: number;
	connectTimeout?: number;
	clean?: boolean;
	resubscribe?: boolean;
	clientId?: string;
	outgoingStore?: Store;
	incomingStore?: Store;
	queueQoSZero?: boolean;
	protocol?: Protocol;
	port?: number;
	query?: any;
	auth?: string;
	username?: string;
	password?: string;
	cert?: string;
	key?: string;
	servers?: { host: string; port: number; protocol: Protocol }[];
	host?: string;
	hostname?: string;
	rejectUnauthorized?: boolean;
}

export interface Options {
	qos?: number;
	dup?: false;
	retain?: boolean;
}

export interface SubscribeOptions extends Options {
	resubscribe?: any;
}

interface QueueItem {
	packet: Packet;
	cb?: Callback;
}

interface Callback {
	(e?: Error, data?: any): void;
}

interface Done {
	(): void;
}

function defaultId() {
	return 'mqttjs_' + Math.random().toString(16).substr(2, 8);
}

function nop() {}

/*
	variables port and host can be removed since
	you have all required information in opts object
*/
function stream_builder_tcp(mqttClient: MqttClient, opts: CreateOptions) {
	opts.port = opts.port || 1883;
	opts.hostname = opts.hostname || opts.host || '127.0.0.1';
	return net.createConnection(opts.port, opts.hostname);
}

function stream_builder_ssl(mqttClient: MqttClient, opts: CreateOptions) {
	opts.port = opts.port || 8883;
	opts.host = opts.hostname || opts.host || '127.0.0.1';
	opts.rejectUnauthorized = opts.rejectUnauthorized !== false;

	// delete opts.path;

	var stream = tls.connect(opts);

	/* eslint no-use-before-define: [2, "nofunc"] */
	stream.on('secureConnect', function () {
		if (opts.rejectUnauthorized && !stream.authorized) {
			stream.emit('error', new Error('TLS not authorized'));
		} else {
			stream.removeListener('error', handleTLSerrors);
		}
	});

	function handleTLSerrors(err: Error) {
		// How can I get verify this error is a tls error?
		if (opts.rejectUnauthorized) {
			mqttClient.emit('error', err);
		}

		// close this connection to match the behaviour of net
		// otherwise all we get is an error from the connection
		// and close event doesn't fire. This is a work around
		// to enable the reconnect code to work the same as with
		// net.createConnection
		stream.end();
	}

	stream.on('error', handleTLSerrors);

	return stream;
}

/**
 * Parse the auth attribute and merge username and password in the options object.
 *
 * @param {Object} [opts] option object
 */
function parseAuthOptions(opts: CreateOptions) {
	if (opts.auth) {
		var matches = opts.auth.match(/^(.+):(.+)$/);
		if (matches) {
			opts.username = matches[1];
			opts.password = matches[2];
		} else {
			opts.username = opts.auth;
		}
	}
}

/**
 * @param {Object} opts
 */
function resolveOptions(opts?: CreateOptions) {
	// Default options
	var options: CreateOptions = {
		url: typeof opts == 'string' ? opts: opts?.url,
		keepalive: 60,
		reschedulePings: true,
		protocolId: 'MQTT',
		protocolVersion: 4,
		protocol: 'mqtt',
		reconnectPeriod: 1000,
		connectTimeout: 30 * 1000,
		clean: true,
		resubscribe: true,
		clientId: defaultId(),
		outgoingStore: new Store(),
		incomingStore: new Store(),
		queueQoSZero: true,
	};

	if (options.url) {
		var _url = url.parse(options.url, true);
		options.hostname = _url.hostname || undefined;
		options.port = Number(_url.port) || undefined;
		options.protocol = _url.protocol?.replace(/:$/, '') as Protocol;
	}

	Object.assign(options, opts);

	options.protocol = options.protocol || 'mqtt';
	options.port = Number(options.port) || 1883;
	options.hostname = options.hostname || '127.0.0.1';

	// merge in the auth options if supplied
	parseAuthOptions(options);

	// support clientId passed in the query string of the url
	if (options.query && typeof options.query.clientId === 'string') {
		options.clientId = <any>options.query.clientId;
	}

	if (options.cert && options.key) {
		options.protocol = 'mqtts';
	}
	if (!protocols[options.protocol]) {
		options.protocol = 'mqtt';
	}

	if (options.clean === false && !options.clientId) {
		throw new Error('Missing clientId for unclean clients');
	}

	return options;
}

/**
 * @class MqttClient
 */
export class MqttClient extends events.EventEmitter {

	readonly options: CreateOptions;

	private _reconnectCount = 0;

	// Inflight message storages
	private _outgoingStore: Store;
	private _incomingStore: Store;

	// Should QoS zero messages be queued when the connection is broken?
	private _queueQoSZero: boolean;

	// map of subscribed topics to support reconnection
	private _resubscribeTopics: Dict<number> = {};

	// map of a subscribe messageId and a topic
	private _messageIdToTopic: Dict<number[]> = {};

	// Ping timer, setup in _setupPingTimer
	private _pingTimer: ReInterval<[]> | null = null;

	// Packet queue
	private _queue: QueueItem[] = [];
	// connack timer
	private _connackTimer: any;
	// Reconnect timer
	private _reconnectTimer: any;

	private _protocol: Protocol;

	/**
	 * MessageIDs starting with 1
	 * ensure that nextId is min. 1, see https://github.com/mqttjs/MQTT.js/issues/810
	 */
	private _nextId = Math.max(1, Math.floor(Math.random() * 65535));

	// Inflight callbacks
	private _outgoing: Map<string | number, Callback> = new Map();

	private _stream: net.Socket | null = null;

	private _deferredReconnect: (()=>void) | null = null;
	private _pingResp = false;

	private _connected = false;	
	private _disconnecting = false;
	private _disconnected = false;
	private _reconnecting = false;

	// Is the client connected?
	get connected() { return this._connected }
	// Are we disconnecting?
	get disconnecting() { return this._disconnecting }
	get disconnected() { return this._disconnected }
	get reconnecting() { return this._reconnecting }

	get nextId() {
		return this._nextId;
	}

	/**
	 * MqttClient constructor
	 *
	 * @param {Object} [options] - connection options
	 * (see Connection#connect)
	 */
	constructor(options?: CreateOptions) {
		super();

		// resolve options
		options = resolveOptions(options);
		this._protocol = options.protocol as Protocol;

		this.options = options;

		// Inflight message storages
		this._outgoingStore = this.options.outgoingStore as Store;
		this._incomingStore = this.options.incomingStore as Store;

		// Should QoS zero messages be queued when the connection is broken?
		this._queueQoSZero = this.options.queueQoSZero as boolean;

		var that = this;

		// Mark connected on connect
		this.on('connect', ()=>{
			if (this.disconnected) {
				return;
			}

			this._connected = true;
			var outStore: Readable | null = this._outgoingStore.createStream();

			this.once('close', remove);

			outStore.on('end', function () {
				that.removeListener('close', remove);
			});
			outStore.on('error', function (err) {
				that.removeListener('close', remove);
				that.emit('error', err);
			});

			function remove () {
				outStore?.destroy();
				outStore = null;
			}

			function storeDeliver () {
				// edge case, we wrapped this twice
				if (!outStore) {
					return;
				}

				var packet = outStore.read(1);
				var cb: Callback | undefined;

				if (!packet) {
					// read when data is available in the future
					outStore.once('readable', storeDeliver);
					return;
				}

				// Avoid unnecessary stream read operations when disconnected
				if (!that.disconnecting && !that._reconnectTimer) {
					cb = that._outgoing.get(packet.messageId);
					that._outgoing.set(packet.messageId, function (err, status) {
						// Ensure that the original callback passed in to publish gets invoked
						if (cb) {
							cb(err, status);
						}

						storeDeliver();
					})
					that._sendPacket(packet);
				} else if (outStore.destroy) {
					outStore.destroy();
				}
			}

			// start flowing
			storeDeliver();
		});

		// Mark disconnected on stream close
		this.on('close', ()=>{
			this._connected = false;
			clearTimeout(this._connackTimer);
		})

		// Setup ping timer
		this.on('connect', this._setupPingTimer)

		// Send queued packets
		this.on('connect', ()=>{
			var queue = this._queue;

			function deliver() {
				var entry = queue.shift();
				var packet = null;

				if (!entry)
					return;

				packet = entry.packet;

				that._sendPacket(packet, function (err) {
					if (entry?.cb) {
						entry.cb(err);
					}
					deliver();
				});
			}

			deliver();
		});

		var firstConnection = true;

		this.on('connect', e=>{
			if (!firstConnection && this.options.clean) {
				if (Object.keys(this._resubscribeTopics).length > 0) {
					if (this.options.resubscribe) {
						this.subscribe(this._resubscribeTopics, {resubscribe:true});
					} else {
						this._resubscribeTopics = {};
					}
				}
			}
			firstConnection = false;
		});

		// Clear ping timer
		this.on('close', ()=>{
			if (that._pingTimer) {
				that._pingTimer.clear();
				that._pingTimer = null;
			}
		});

		// Setup reconnect timer on disconnect
		this.on('close', this._setupReconnect);

		this._setupStream();
	}

	private _flush() {
		var self: MqttClient = this;
		var queue = self._outgoing;
		if (queue) {
			for (var [key,value] of queue) {
				if (typeof value === 'function') {
					value(new Error('Connection closed'));
					queue.delete(key);
				}
			}
		}
	}
	
	private __sendPacket(packet: Packet, cb?: Callback) {
		var self: MqttClient = this;
		self.emit('packetsend', packet);
	
		var stream = self._stream as net.Socket;
	
		var result = writeToStream(packet, stream);
	
		if (!result && cb) {
			stream.once('drain', cb);
		} else if (cb) {
			cb();
		}
	}
	
	private _storeAndSend(packet: Packet, cb?: Callback) {
		var self: MqttClient = this;
		self._outgoingStore.put(packet, (err)=>{
			if (err) {
				return cb && cb(err);
			}
			this.__sendPacket(packet, cb);
		})
	}
	
	/**
	 * @func stream_builder()
	 */
	private stream_builder() {
		var self: MqttClient = this;
		var opts = self.options;
		if (opts.servers) {
			if (!self._reconnectCount || 
				self._reconnectCount === opts.servers.length) {
				self._reconnectCount = 0;
			}
			opts.host = opts.servers[self._reconnectCount].host;
			opts.port = opts.servers[self._reconnectCount].port;
			opts.protocol = opts.servers[self._reconnectCount].protocol || this._protocol;
			opts.hostname = opts.host;
			self._reconnectCount++;
		}
		return protocols[<Protocol>opts.protocol](self, opts);
	}

	/**
	 * setup the event handlers in the inner stream.
	 *
	 * @api private
	 */
	private _setupStream() {

		var that = this;
		var writable = new Writable();
		var parser = new Parser(/*this.options*/);
		var completeParse: Callback | null = null;
		var packets: Packet[] = [];

		this._clearReconnect();

		this._stream = this.stream_builder();

		parser.on('packet', function (packet) {
			packets.push(packet);
		});

		function nextTickWork () {
			process.nextTick(work);
		}

		function work() {
			var packet = packets.shift();
			var done = completeParse as Callback;

			if (packet) {
				that._handlePacket(packet, nextTickWork);
			} else {
				completeParse = null;
				done();
			}
		}

		writable._write = function (buf, enc, done) {
			completeParse = done;
			parser.parse(buf);
			work();
		};

		this._stream.pipe(writable);

		// Suppress connection errors
		this._stream.on('error', nop);

		// Echo stream close
		eos(this._stream, {}, ()=>this.emit('close'));

		// Send a connect packet
		var connectPacket = Object.assign(Object.create(this.options), { cmd: 'connect' }) as Packet;
		// avoid message queue
		this.__sendPacket(connectPacket);

		// Echo connection errors
		parser.on('error', this.emit.bind(this, 'error'));

		// many drain listeners are needed for qos 1 callbacks if the connection is intermittent
		this._stream.setMaxListeners(1000);

		clearTimeout(this._connackTimer);

		this._connackTimer = setTimeout(()=>{
			that._cleanUp(true);
		}, this.options.connectTimeout);
	}

	private _handlePacket(packet: Packet, done: Done) {
		this.emit('packetreceive', packet);

		switch (packet.cmd) {
			case 'publish':
				this._handlePublish(packet, done);
				break
			case 'puback':
			case 'pubrec':
			case 'pubcomp':
			case 'suback':
			case 'unsuback':
				this._handleAck(packet);
				done();
				break;
			case 'pubrel':
				this._handlePubrel(packet, done);
				break;
			case 'connack':
				this._handleConnack(packet);
				done();
				break
			case 'pingresp':
				this._handlePingresp();
				done();
				break
			default:
				// do nothing
				// maybe we should do an error handling
				// or just log it
				break
		}
	}

	private _checkDisconnecting(callback?: Callback) {
		if (this.disconnecting) {
			if (callback) {
				callback(new Error('client disconnecting'));
			} else {
				this.emit('error', new Error('client disconnecting'));
			}
		}
		return this.disconnecting;
	}

	/**
	 * publish - publish <message> to <topic>
	 *
	 * @param {String} topic - topic to publish to
	 * @param {String, Buffer} message - message to publish
	 * @param {Object} [opts] - publish options, includes:
	 *    {Number} qos - qos level to publish on
	 *    {Boolean} retain - whether or not to retain the message
	 *    {Boolean} dup - whether or not mark a message as duplicate
	 * @param {Function} [callback] - function(err){}
	 *    called when publish succeeds or fails
	 * @returns {MqttClient} this - for chaining
	 * @api public
	 *
	 * @example client.publish('topic', 'message');
	 * @example
	 *     client.publish('topic', 'message', {qos: 1, retain: true, dup: true});
	 * @example client.publish('topic', 'message', console.log);
	 */
	publish(topic: string, message?: string | Buffer, opts?: Options, callback?: Callback) {
		var packet: Packet;

		// .publish(topic, payload, cb);
		if (typeof opts === 'function') {
			callback = opts;
			opts = {};
		}

		// default opts
		var options = Object.assign({qos: 0, retain: false, dup: false}, opts);

		if (this._checkDisconnecting(callback)) {
			return this;
		}

		packet = {
			cmd: 'publish',
			topic: topic,
			payload: message,
			qos: options.qos,
			retain: options.retain,
			messageId: this.__nextId(),
			dup: options.dup,
			length: 0
		};

		switch (options.qos) {
			case 1:
			case 2:
				// Add to callbacks
				this._outgoing.set(packet.messageId as number, callback || nop);
				this._sendPacket(packet);
				break;
			default:
				this._sendPacket(packet, callback);
				break;
		}

		return this;
	}

	/**
	 * subscribe - subscribe to <topic>
	 *
	 * @param {String, Array, Object} topic - topic(s) to subscribe to, supports objects in the form {'topic': qos}
	 * @param {Object} [opts] - optional subscription options, includes:
	 *    {Number} qos - subscribe qos level
	 * @param {Function} [callback] - function(err, granted){} where:
	 *    {Error} err - subscription error (none at the moment!)
	 *    {Array} granted - array of {topic: 't', qos: 0}
	 * @returns {MqttClient} this - for chaining
	 * @api public
	 * @example client.subscribe('topic');
	 * @example client.subscribe('topic', {qos: 1});
	 * @example client.subscribe({'topic': 0, 'topic2': 1}, console.log);
	 * @example client.subscribe('topic', console.log);
	 */
	subscribe(topics: string | string[] | Dict<number>, opts: SubscribeOptions | Callback = {}, callback: Callback = nop) {

		if (typeof topics === 'string') {
			topics = [topics];
		}

		if (typeof opts == 'function') {
			callback = opts;
			opts = {};
		}

		var qos = opts.qos || 0;

		type Topic = [string, number];

		var _topics: Topic[] = Array.isArray(topics) ? topics.map(e=>[e,qos]): Object.entries(topics);

		var invalidTopic = validations.validateTopics(_topics);
		if (invalidTopic) {
			setImmediate(callback, new Error('Invalid topic ' + invalidTopic));
			return this;
		}

		if (this._checkDisconnecting(callback)) {
			return this;
		}

		var subs: { topic: string, qos: number }[] = [];
		var resubscribe = opts.resubscribe;

		for (var [k, _qos] of _topics) {
			if (!this._resubscribeTopics.hasOwnProperty(k) ||
					this._resubscribeTopics[k] < _qos || resubscribe) {
				subs.push({ topic: k, qos: _qos, });
			}
		}

		var packet = {
			cmd: 'subscribe',
			subscriptions: subs,
			qos: 1,
			retain: false,
			dup: false,
			messageId: this.__nextId(),
		};

		if (!subs.length) {
			callback(undefined, []);
			return this;
		}

		// subscriptions to resubscribe to in case of disconnect
		if (this.options.resubscribe) {
			this._messageIdToTopic[packet.messageId] = topics = [];
			for (var sub of subs) {
				if (this.options.reconnectPeriod as number > 0) {
					this._resubscribeTopics[sub.topic] = sub.qos;
					topics.push(sub.topic);
				}
			}
		}

		this._outgoing.set(packet.messageId, function(err, packet) {
			if (!err) {
				var granted = packet.granted;
				for (var i = 0; i < granted.length; i++) {
					subs[i].qos = granted[i];
				}
			}
			callback(err, subs);
		})

		this._sendPacket(packet);

		return this;
	}

	/**
	 * unsubscribe - unsubscribe from topic(s)
	 *
	 * @param {String, Array} topic - topics to unsubscribe from
	 * @param {Function} [callback] - callback fired on unsuback
	 * @returns {MqttClient} this - for chaining
	 * @api public
	 * @example client.unsubscribe('topic');
	 * @example client.unsubscribe('topic', console.log);
	 */
	unsubscribe(topic: string | string[], callback = nop) {
		var packet: Packet = {
			cmd: 'unsubscribe',
			qos: 1,
			messageId: this.__nextId(),
		};

		if (this._checkDisconnecting(callback)) {
			return this;
		}

		if (typeof topic === 'string') {
			packet.unsubscriptions = [topic];
		} else if (typeof topic === 'object' && topic.length) {
			packet.unsubscriptions = topic;
		}

		if (this.options.resubscribe) {
			(packet.unsubscriptions as string[]).forEach(topic=>delete this._resubscribeTopics[topic]);
		}

		this._outgoing.set(packet.messageId as number, callback);

		this._sendPacket(packet);

		return this;
	}

	/**
	 * end - close connection
	 *
	 * @returns {MqttClient} this - for chaining
	 * @param {Boolean} force - do not wait for all in-flight messages to be acked
	 * @param {Function} cb - called when the client has been closed
	 *
	 * @api public
	 */
	end(force?: boolean | Callback, cb?: Callback) {
		var that = this;

		if (typeof force === 'function') {
			cb = force;
			force = false;
		}

		function closeStores() {
			that._disconnected = true;
			that._incomingStore.close(function() {
				that._outgoingStore.close(function(...args: any[]) {
					if (cb) {
						cb(...args);
					}
					that.emit('end');
				})
			});
			if (that._deferredReconnect) {
				that._deferredReconnect();
			}
		}

		function finish() {
			// defer closesStores of an I/O cycle,
			// just to make sure things are
			// ok for websockets
			that._cleanUp(force as boolean, setImmediate.bind(null, closeStores));
		}

		if (this.disconnecting) {
			return this;
		}

		this._clearReconnect();

		this._disconnecting = true;

		if (!force && Object.keys(this._outgoing).length > 0) {
			// wait 10ms, just to be sure we received all of it
			this.once('outgoingEmpty', setTimeout.bind(null, finish, 10));
		} else {
			finish();
		}

		return this;
	}

	/**
	 * removeOutgoingMessage - remove a message in outgoing store
	 * the outgoing callback will be called withe Error('Message removed') if the message is removed
	 *
	 * @param {Number} mid - messageId to remove message
	 * @returns {MqttClient} this - for chaining
	 * @api public
	 *
	 * @example client.removeOutgoingMessage(client.getLastMessageId());
	 */
	removeOutgoingMessage(mid: number) {
		var cb = this._outgoing.get(mid);
		if (cb) {
			this._outgoing.delete(mid);
			this._outgoingStore.del({messageId: mid}, function() {
				(cb as Callback)(new Error('Message removed'));
			});
		}
		return this;
	}

	/**
	 * reconnect - connect again using the same options as connect()
	 *
	 * @param {Object} [opts] - optional reconnect options, includes:
	 *    {Store} incomingStore - a store for the incoming packets
	 *    {Store} outgoingStore - a store for the outgoing packets
	 *    if opts is not given, current stores are used
	 * @returns {MqttClient} this - for chaining
	 *
	 * @api public
	 */
	reconnect(opts: CreateOptions = {}) {
		var that = this;
		var f = function() {
			if (opts) {
				that.options.incomingStore = opts.incomingStore;
				that.options.outgoingStore = opts.outgoingStore;
			} else {
				that.options.incomingStore = undefined;
				that.options.outgoingStore = undefined;
			}
			that._incomingStore = that.options.incomingStore || new Store();
			that._outgoingStore = that.options.outgoingStore || new Store();
			that._disconnecting = false;
			that._disconnected = false;
			that._deferredReconnect = null;
			that._reconnect();
		};

		if (this.disconnecting && !this.disconnected) {
			this._deferredReconnect = f;
		} else {
			f();
		}
		return this;
	}

	/**
	 * _reconnect - implement reconnection
	 * @api privateish
	 */
	private _reconnect() {
		this.emit('reconnect');
		this._setupStream();
	}

	/**
	 * _setupReconnect - setup reconnect timer
	 */
	private _setupReconnect() {
		var that = this;

		if (!that.disconnecting && !that._reconnectTimer && 
				((that.options.reconnectPeriod as number) > 0)
		) {
			if (!this.reconnecting) {
				this.emit('offline');
				this._reconnecting = true;
			}
			that._reconnectTimer = setInterval(function() {
				that._reconnect();
			}, that.options.reconnectPeriod);
		}
	}

	/**
	 * _clearReconnect - clear the reconnect timer
	 */
	private _clearReconnect() {
		if (this._reconnectTimer) {
			clearInterval(this._reconnectTimer);
			this._reconnectTimer = null;
		}
	}

	/**
	 * _cleanUp - clean up on connection end
	 * @api private
	 */
	private _cleanUp(forced?: boolean, done?: ()=>void) {
		if (done) {
			(this._stream as net.Socket).on('close', done);
		}

		if (forced) {
			if ((this.options.reconnectPeriod === 0) && this.options.clean) {
				this._flush();
			}
			this._stream?.destroy();
		} else {
			this._sendPacket({ cmd: 'disconnect' }, e=>{
				setImmediate(e=>this._stream?.end());
			});
		}

		if (!this.disconnecting) {
			this._clearReconnect();
			this._setupReconnect();
		}

		if (this._pingTimer !== null) {
			this._pingTimer?.clear();
			this._pingTimer = null;
		}

		if (done && !this.connected) {
			this._stream?.removeListener('close', done);
			done();
		}
	}

	/**
	 * _sendPacket - send or queue a packet
	 * @param {String} type - packet type (see `protocol`)
	 * @param {Object} packet - packet options
	 * @param {Function} cb - callback when the packet is sent
	 * @api private
	 */
	private _sendPacket(packet: Packet, cb?: Callback) {

		if (!this.connected) {
			var qos = packet.qos;
			if ((qos === 0 && this._queueQoSZero) || packet.cmd !== 'publish') {
				this._queue.push({ packet: packet, cb: cb });
			} else if (qos as number > 0) {
				cb = this._outgoing.get(packet.messageId as number);
				this._outgoingStore.put(packet, function (err) {
					if (err) {
						return cb && cb(err);
					}
				});
			} else if (cb) {
				cb(new Error('No connection to broker'));
			}
			return;
		}

		// When sending a packet, reschedule the ping timer
		this._shiftPingInterval();

		switch (packet.cmd) {
			case 'publish':
				break;
			case 'pubrel':
				this._storeAndSend(packet, cb);
				return;
			default:
				this.__sendPacket(packet, cb);
				return;
		}

		switch (packet.qos) {
			case 2:
			case 1:
				this._storeAndSend(packet, cb);
				break;
			/**
			 * no need of case here since it will be caught by default
			 * and jshint comply that before default it must be a break
			 * anyway it will result in -1 evaluation
			 */
			case 0:
				/* falls through */
			default:
				this.__sendPacket(packet, cb);
				break;
		}
	}

	/**
	 * _setupPingTimer - setup the ping timer
	 *
	 * @api private
	 */
	private _setupPingTimer() {
		var that = this;
		if (!this._pingTimer && this.options.keepalive) {
			this._pingResp = true;
			this._pingTimer = reInterval(function() {
				that._checkPing();
			}, this.options.keepalive * 1000);
		}
	}

	/**
	 * _shiftPingInterval - reschedule the ping interval
	 *
	 * @api private
	 */
	private _shiftPingInterval() {
		if (this._pingTimer && this.options.keepalive && 
			this.options.reschedulePings) {
			this._pingTimer.reschedule(this.options.keepalive * 1000);
		}
	}

	/**
	 * _checkPing - check if a pingresp has come back, and ping the server again
	 *
	 * @api private
	 */
	private _checkPing() {
		if (this._pingResp) {
			this._pingResp = false;
			this._sendPacket({ cmd: 'pingreq' });
		} else {
			// do a forced cleanup since socket will be in bad shape
			this._cleanUp(true);
		}
	}

	/**
	 * _handlePingresp - handle a pingresp
	 *
	 * @api private
	 */
	private _handlePingresp() {
		this._pingResp = true;
	}

	/**
	 * _handleConnack
	 *
	 * @param {Object} packet
	 * @api private
	 */
	private _handleConnack(packet: Packet) {
		var rc = packet.returnCode as number;
		var errors = [
			'',
			'Unacceptable protocol version',
			'Identifier rejected',
			'Server unavailable',
			'Bad username or password',
			'Not authorized',
		];

		clearTimeout(this._connackTimer);

		if (rc === 0) {
			this._reconnecting = false;
			this.emit('connect', packet);
		} else if (rc > 0) {
			var err = new Error('Connection refused: ' + errors[rc]);
			err.code = rc;
			err.errno = rc;
			this.emit('error', err);
		}
	}

	/**
	 * _handlePublish
	 *
	 * @param {Object} packet
	 * @api private
	 */
	/*
	those late 2 case should be rewrite to comply with coding style:

	case 1:
	case 0:
		// do not wait sending a puback
		// no callback passed
		if (1 === qos) {
			this._sendPacket({
				cmd: 'puback',
				messageId: mid
			});
		}
		// emit the message event for both qos 1 and 0
		this.emit('message', topic, message, packet);
		this.handleMessage(packet, done);
		break;
	default:
		// do nothing but every switch mus have a default
		// log or throw an error about unknown qos
		break;

	for now i just suppressed the warnings
	*/
	private _handlePublish(packet: Packet, done: Callback = nop) {
		var topic = packet.topic?.toString();
		var message = packet.payload;
		var qos = packet.qos;
		var mid = packet.messageId;
		var that = this;

		switch (qos) {
			case 2:
				this._incomingStore.put(packet, function (err) {
					if (err) {
						return done(err);
					}
					that._sendPacket({cmd: 'pubrec', messageId: mid}, done);
				});
				break;
			case 1:
				// emit the message event
				this.emit('message', topic, message, packet);
				this.handleMessage(packet, function (err) {
					if (err) {
						return done(err);
					}
					// send 'puback' if the above 'handleMessage' method executed
					// successfully.
					that._sendPacket({cmd: 'puback', messageId: mid}, done);
				});
				break;
			case 0:
				// emit the message event
				this.emit('message', topic, message, packet);
				this.handleMessage(packet, done);
				break;
			default:
				// do nothing
				// log or throw an error about unknown qos
				break;
		}
	}

	/**
	 * Handle messages with backpressure support, one at a time.
	 * Override at will.
	 *
	 * @param Packet packet the packet
	 * @param Function callback call when finished
	 * @api public
	 */
	handleMessage(packet: Packet, callback?: Callback) {
		callback && callback();
	}

	/**
	 * _handleAck
	 *
	 * @param {Object} packet
	 * @api private
	 */
	private _handleAck(packet: Packet) {
		/* eslint no-fallthrough: "off" */
		var mid = packet.messageId as number;
		var cb = this._outgoing.get(mid);

		if (!cb) {
			// Server sent an ack in error, ignore it.
			return;
		}

		// Process
		switch (packet.cmd) {
			case 'pubcomp':
				// same thing as puback for QoS 2
			case 'puback':
				// Callback - we're done
				this._outgoing.delete(mid);
				this._outgoingStore.del(packet, cb);
				break;
			case 'pubrec':
				this._sendPacket({ cmd: 'pubrel', qos: 2, messageId: mid });
				break;
			case 'suback':
				this._outgoing.delete(mid);
				if (packet.granted?.length === 1 && (packet.granted[0] & 0x80) !== 0) {
					// suback with Failure status
					var topics = this._messageIdToTopic[mid];
					if (topics) {
						topics.forEach(topic=>delete this._resubscribeTopics[topic]);
					}
				}
				cb(undefined, packet);
				break;
			case 'unsuback':
				this._outgoing.delete(mid);
				cb(undefined);
				break;
			default:
				this.emit('error', new Error('unrecognized packet type'));
		}

		if (this.disconnecting && Object.keys(this._outgoing).length === 0) {
			this.emit('outgoingEmpty');
		}
	}

	/**
	 * _handlePubrel
	 *
	 * @param {Object} packet
	 * @api private
	 */
	private _handlePubrel(packet: Packet, callback: Callback) {
		callback = typeof callback !== 'undefined' ? callback : nop;
		var mid = packet.messageId;
		var that = this;

		var comp = {cmd: 'pubcomp', messageId: mid};

		that._incomingStore.get(packet, function (err, pub) {
			if (!err && pub.cmd !== 'pubrel') {
				that.emit('message', pub.topic, pub.payload, pub);
				that._incomingStore.put(packet, function (err) {
					if (err) {
						return callback(err);
					}
					that.handleMessage(pub, function (err?: Error) {
						if (err) {
							return callback(err);
						}
						that._sendPacket(comp, callback);
					});
				});
			} else {
				that._sendPacket(comp, callback);
			}
		});
	}

	/**
	 * _nextId
	 * @return unsigned int
	 */
	private __nextId() {
		// id becomes current state of this.nextId and increments afterwards
		var id = this._nextId++;
		// Ensure 16 bit unsigned int (max 65535, nextId got one higher)
		if (this.nextId === 65536) {
			this._nextId = 1;
		}
		return id;
	}

	/**
	 * getLastMessageId
	 * @return unsigned int
	 */
	getLastMessageId() {
		return (this.nextId === 1) ? 65535 : (this.nextId - 1);
	}

}
