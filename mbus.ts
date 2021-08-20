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

import utils from './util';
import {MqttClient, CreateOptions} from './mqtt';
import {Notification} from './event';

/**
 * @class NotificationCenter
 */
export class NotificationCenter extends Notification {

	private m_topic: string;
	private m_mqtt: MqttClient;

	get topic() {
		return this.m_topic;
	}

	get mqtt() {
		return this.m_mqtt;
	}

	constructor(url = 'mqtt://127.0.0.1:1883', topic = 'default', options?: CreateOptions) {
		super();
		var msg = `${url}/${topic}`;
		var cli = new MqttClient({ url, ...options });

		cli.on('message', (topic, data)=>{
			if (topic.indexOf(this.m_topic) == 0) {
				try {
				var event = topic.substr(this.m_topic.length + 1);
					data = data.length ? JSON.parse(data.toString('utf8')): undefined;
					utils.nextTick(()=>this.afterNotificationHandle(event, data));
				} catch (err) {
					console.error('Bad NotificationCenter message', err);
				}
			}
		});
		cli.on('reconnect', e=>console.log(`MQTT, ${msg}, reconnect`));
		cli.on('connect', e=>console.log(`MQTT, ${msg}, connect`));
		cli.on('close', e=>console.log(`MQTT, ${msg}, close`));
		cli.on('offline', e=>console.log(`MQTT, ${msg}, offline`));
		cli.on('error', e=>console.error(`MQTT, ${msg}, ${e}`));

		this.m_topic = topic;
		this.m_mqtt = cli
	}

	afterNotificationHandle(event: string, data: any) {
		return this.getNoticer(event).trigger(data);
	}

	subscribeAll() {
		this.m_mqtt.subscribe(this.m_topic + '/#');
	}

	// @overwrite:
	getNoticer(name: string) {
		if (!this.hasNoticer(name)) {
			this.m_mqtt.subscribe(this.m_topic + '/' + name); // subscribe message
		}
		return super.getNoticer(name);
	}

	// @overwrite:
	trigger(event: string, data: any) {
		this.publish(event, data);
	}

	publish(event: string, data: any) {
		data = Buffer.from(JSON.stringify(data) || '');
		this.m_mqtt.publish(this.m_topic + '/' + event, data);
	}

}

// default application notification center
var default_notification_center: NotificationCenter | null = null;

export default {

	NotificationCenter,

	get defaultNotificationCenter() {
		if (!default_notification_center) {
			default_notification_center = new NotificationCenter();
		}
		return default_notification_center;
	},

	set defaultNotificationCenter(value: NotificationCenter) {
		utils.assert(!default_notification_center);
		utils.assert(value instanceof NotificationCenter);
		default_notification_center = value;
	},

};
