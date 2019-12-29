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

/**
 * Validate a topic to see if it's valid or not.
 * A topic is valid if it follow below rules:
 * - Rule #1: If any part of the topic is not `+` or `#`, then it must not contain `+` and '#'
 * - Rule #2: Part `#` must be located at the end of the mailbox
 *
 * @param {String} topic - A topic
 * @returns {Boolean} If the topic is valid, returns true. Otherwise, returns false.
 */
function validateTopic (topic: string) {
	var parts = topic.split('/')

	for (var i = 0; i < parts.length; i++) {
		if (parts[i] === '+') {
			continue
		}

		if (parts[i] === '#') {
			// for Rule #2
			return i === parts.length - 1
		}

		if (parts[i].indexOf('+') !== -1 || parts[i].indexOf('#') !== -1) {
			return false
		}
	}

	return true
}

/**
 * Validate an array of topics to see if any of them is valid or not
	* @param {Array} topics - Array of topics
 * @returns {String} If the topics is valid, returns null. Otherwise, returns the invalid one
 */
function validateTopics (topics: string[]) {
	if (topics.length === 0) {
		return 'empty_topic_list';
	}
	for (var [topic] of topics) {
		if (!validateTopic(topic)) {
			return topic;
		}
	}
}

export default {
	validateTopics: validateTopics
}
