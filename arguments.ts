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

import util from './util';

export var options: Dict = {};
export var helpInfo: string[] = [];

export function defOpts(name: string | string[], defaultValue: any, info: string) {
	var id: string = name as string;
	var relation: string[] = [];
	if ( Array.isArray(name) ) {
		relation = name.splice(1);
		id = name[0];
	}

	id = id.replace(/\-/mg, '_');

	relation.forEach(function(i) {
		i = i.replace(/\-/mg, '_');
		if ( i in options ) {
			options[id] = options[i];
		}
	});

	if ( ! (id in options) ) {
		options[id] = defaultValue;
	}
	
	var default_val = options[id] === 0 ? 'no' : options[id] === 1 ? 'yes' : options[id];
	helpInfo.push(format_string(info, default_val));
}

function read_argv() {
	var argv = util.argv;

	for (var i = 0; i < argv.length; i++) {
		var item = argv[i];
		var key = null, value: any = 1;

		if (item.substr(0, 2) == '--') {
			var ls = item.substr(2).split('=');
			key = ls[0].replace(/\-/mg, '_');
			value = ls[1] || 1;
		}
		else if (item.substr(0, 1) == '-') {
			key = item.substr(1).replace(/\-/mg, '_');
			if ( i + 1 < argv.length ) {
				value = argv[i+1];
				if ( value[0] != '-' ) {
					i++;
				} else {
					value = 1;
				}
			}
		}

		if ( key ) {
			if (value == 'true' || value == 'yes') {
				value = 1;
			} else if (value == 'false' || value == 'no') {
				value = 0;
			} else if (/^[0-9]+$/.test(value)) {
				value = parseInt(value);
			} else {
				value = value;
			}
			if (key in options) {
				if (Array.isArray(options[key])) {
					options[key].push(value);
				} else {
					options[key] = [options[key], value];
				}
			} else {
				options[key] = value;
			}
		}
		//
	}
}

function format_string(str: string, ...args: string[]) {
	return String.format(str, ...args)
}

read_argv();
