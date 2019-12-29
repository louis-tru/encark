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

import {EventNoticer} from './event';
import * as fs from 'fs';
import * as Path from 'path';
import {StringDecoder} from 'string_decoder';
import {WriteStream} from 'fs';
import * as querystring from 'querystring';
import * as crypto from 'crypto';
import {parseJSON} from './request';
import Document from './xml';
import {StaticService} from './static_service';
import * as http from 'http';

export enum STATUS {
	PARSER_UNINITIALIZED = 0,
	START,
	START_BOUNDARY,
	HEADER_FIELD_START,
	HEADER_FIELD,
	HEADER_VALUE_START,
	HEADER_VALUE,
	HEADER_VALUE_ALMOST_DONE,
	HEADERS_ALMOST_DONE,
	PART_DATA_START,
	PART_DATA,
	PART_END,
	END,
};

const S = STATUS;

var f = 1;
enum F {
	PART_BOUNDARY = f,
	LAST_BOUNDARY = f *= 2
}

const LF = 10,
			CR = 13,
			SPACE = 32,
			HYPHEN = 45,
			COLON = 58,
			A = 97,
			Z = 122,
lower = function (c: number) {
	return c | 0x20;
};

interface Parser {
	write(buffer: Buffer): number;
	end(): Error | undefined;
}

// This is a buffering parser, not quite as nice as the multipart one.
// If I find time I'll rewrite this to be fully streaming as well
class QuerystringParser implements Parser {

	private type: string;
	private buffers: Buffer[] = [];

	onField: (field: string, value: any)=>void = ()=>{};
	onEnd: (data: Any)=>void = ()=>{};

	/**
	 * constructor function
	 * @constructor
	 */
	constructor(type: string) {
		this.type = type;
	}

	write(buffer: Buffer): number {
		this.buffers.push(buffer);
		return buffer.length;
	}

	end() {
		var buffer = Buffer.concat(this.buffers).toString('utf8');
		if (this.type == 'json') {
			var data = {};
			buffer = buffer.trim();
			if (buffer) {
				try {
					data = parseJSON(buffer);
				} catch(err) {
					console.error(buffer, err);
				}
			}
			this.onEnd(data);
		} else if (this.type == 'xml') {
			var doc = new Document();
			var r = doc.load(buffer+'');
			this.onEnd({ body: doc });
		} else {
			var fields = querystring.parse(buffer);
			for (var field in fields) {
				this.onField(field, fields[field]);
			}
			this.onEnd(fields);
		}
		return undefined;
	}

	// @end
}

export class File {
	private _writeStream: fs.WriteStream | null = null;
	private _path = '';
	private _name = '';
	private _type: string;
	private _size = 0;
	private _lastModifiedDate = 0;

	get size() {
		return this._size;
	}

	// @todo Next release: Show error messages when accessing these
	get length() {
		return this.size;
	}

	get filename() {
		return this._name;
	}

	get pathname() {
		return this._path;
	}
	
	get mime() {
		return this._type;
	}

	get lastModifiedDate() {
		return this._lastModifiedDate;
	}

	readonly onProgress = new EventNoticer<number>('Progress', this);
	readonly onEnd = new EventNoticer('End', this);

	constructor(path: string, name: string, type: string) {
		this._path = path;
		this._name = name;
		this._type = type;
	}

	private _open() {
		this._writeStream = new WriteStream();
	}

	write(buffer: Buffer, cb: any) {
		var self = this;
		if (!self._writeStream) 
			self._open();
		(<WriteStream>self._writeStream).write(buffer, function() {
			self._lastModifiedDate = Date.now();
			self._size += buffer.length;
			self.onProgress.trigger(self.size);
			cb();
		});
	}

	end(cb: any) {
		if (this._writeStream) {
			this._writeStream.end(()=>{
				this.onEnd.trigger({});
				cb();
			});
		} else {
			this._path = '';
			this.onEnd.trigger({});
			cb();
		}
	}
	// @end
}

class MultipartParser implements Parser {

	private boundary: Buffer;
	private lookbehind: Buffer;
	private boundaryChars: Any = {};
	private state: number = S.PARSER_UNINITIALIZED;
	private flags: number = 0;
	private index = 0;
	private _mark: Any<number> = {};

	constructor(boundary: string) {
		this.state = S.PARSER_UNINITIALIZED;

		this.boundary = Buffer.alloc(boundary.length + 4);
		this.boundary.write('\r\n--', 0, 'ascii');
		this.boundary.write(boundary, 4, 'ascii');
		this.lookbehind = Buffer.alloc(this.boundary.length + 8);
		this.state = S.START;

		this.boundaryChars = {};
		for (var i = 0; i < this.boundary.length; i++) {
			this.boundaryChars[this.boundary[i]] = true;
		}
	}
	
	write(buffer: Buffer) {
		var self = this,
			i = 0,
			len = buffer.length,
			prevIndex = this.index,
			index = this.index,
			state = this.state,
			flags = this.flags,
			lookbehind = this.lookbehind,
			boundary = this.boundary,
			boundaryChars = this.boundaryChars,
			boundaryLength = this.boundary.length,
			boundaryEnd = boundaryLength - 1,
			bufferLength = buffer.length,
			c,
			cl, _mark = this._mark,

			mark = function (name: string) {
				_mark[name + 'Mark'] = i;
			},
			clear = function (name: string) {
				delete _mark[name + 'Mark'];
			},
			callback = function(name: string, buffer?: Buffer, start?: number, end?: number) {
				if (start !== undefined && start === end) {
					return;
				}
				var callbackSymbol = 'on' + name.substr(0, 1).toUpperCase() + name.substr(1);
				if (callbackSymbol in self) {
					(<any>self)[callbackSymbol](buffer, start, end);
				}
			},
			dataCallback = function (name: string, clear?: boolean) {
				var markSymbol = name + 'Mark';
				if (!(markSymbol in _mark)) {
					return;
				}
				if (clear) {
					callback(name, buffer, _mark[markSymbol], i);
					delete _mark[markSymbol];
				} else {
					callback(name, buffer, _mark[markSymbol], buffer.length);
					_mark[markSymbol] = 0;
				}
			};

		for (i = 0; i < len; i++) {
			c = buffer[i];
			switch (state) {
				case S.PARSER_UNINITIALIZED:
					return i;
				case S.START:
					index = 0;
					state = S.START_BOUNDARY;
				case S.START_BOUNDARY:
					if (index == boundary.length - 2) {
						if (c != CR) {
							return i;
						}
						index++;
						break;
					} else if (index - 1 == boundary.length - 2) {
						if (c != LF) {
							return i;
						}
						index = 0;
						callback('partBegin');
						state = S.HEADER_FIELD_START;
						break;
					}

					if (c != boundary[index + 2]) {
						return i;
					}
					index++;
					break;
				case S.HEADER_FIELD_START:
					state = S.HEADER_FIELD;
					mark('headerField');
					index = 0;
				case S.HEADER_FIELD:
					if (c == CR) {
						clear('headerField');
						state = S.HEADERS_ALMOST_DONE;
						break;
					}

					index++;
					if (c == HYPHEN) {
						break;
					}

					if (c == COLON) {
						if (index == 1) {
							// empty header field
							return i;
						}
						dataCallback('headerField', true);
						state = S.HEADER_VALUE_START;
						break;
					}

					cl = lower(c);
					if (cl < A || cl > Z) {
						return i;
					}
					break;
				case S.HEADER_VALUE_START:
					if (c == SPACE) {
						break;
					}

					mark('headerValue');
					state = S.HEADER_VALUE;
				case S.HEADER_VALUE:
					if (c == CR) {
						dataCallback('headerValue', true);
						callback('headerEnd');
						state = S.HEADER_VALUE_ALMOST_DONE;
					}
					break;
				case S.HEADER_VALUE_ALMOST_DONE:
					if (c != LF) {
						return i;
					}
					state = S.HEADER_FIELD_START;
					break;
				case S.HEADERS_ALMOST_DONE:
					if (c != LF) {
						return i;
					}

					callback('headersEnd');
					state = S.PART_DATA_START;
					break;
				case S.PART_DATA_START:
					state = S.PART_DATA
					mark('partData');
				case S.PART_DATA:
					prevIndex = index;

					if (index == 0) {
						// boyer-moore derrived algorithm to safely skip non-boundary data
						i += boundaryEnd;
						while (i < bufferLength && !(buffer[i] in boundaryChars)) {
							i += boundaryLength;
						}
						i -= boundaryEnd;
						c = buffer[i];
					}

					if (index < boundary.length) {
						if (boundary[index] == c) {
							if (index == 0) {
								dataCallback('partData', true);
							}
							index++;
						} else {
							index = 0;
						}
					} else if (index == boundary.length) {
						index++;
						if (c == CR) {
							// CR = part boundary
							flags |= F.PART_BOUNDARY;
						} else if (c == HYPHEN) {
							// HYPHEN = end boundary
							flags |= F.LAST_BOUNDARY;
						} else {
							index = 0;
						}
					} else if (index - 1 == boundary.length) {
						if (flags & F.PART_BOUNDARY) {
							index = 0;
							if (c == LF) {
								// unset the PART_BOUNDARY flag
								flags &= ~F.PART_BOUNDARY;
								callback('partEnd');
								callback('partBegin');
								state = S.HEADER_FIELD_START;
								break;
							}
						} else if (flags & F.LAST_BOUNDARY) {
							if (c == HYPHEN) {
								callback('partEnd');
								callback('end');
								state = S.END;
							} else {
								index = 0;
							}
						} else {
							index = 0;
						}
					}

					if (index > 0) {
						// when matching a possible boundary, keep a lookbehind reference
						// in case it turns out to be a false lead
						lookbehind[index - 1] = c;
					} else if (prevIndex > 0) {
						// if our boundary turned out to be rubbish, the captured lookbehind
						// belongs to partData
						callback('partData', lookbehind, 0, prevIndex);
						prevIndex = 0;
						mark('partData');

						// reconsider the current character even so it interrupted the sequence
						// it could be the beginning of a new sequence
						i--;
					}

					break;
				case S.END:
					break;
				default:
					return i;
			}
		}

		dataCallback('headerField');
		dataCallback('headerValue');
		dataCallback('partData');

		this.index = index;
		this.state = state;
		this.flags = flags;

		return len;
	}

	end() {
		if (this.state != S.END) {
			return new Error('MultipartParser.end(): stream ended unexpectedly: ' + this.explain());
		}
	}

	explain() {
		return 'state = ' + stateToString(this.state);
	}

}

class Part {
	headers: Any<string> = {}
	name = ''
	filename = ''
	mime = ''
	headerField = ''
	headerValue = ''
	readonly onData = new EventNoticer<Buffer>('Data', this);
	readonly onEnd = new EventNoticer('End', this);
}

// ----------------------- IncomingForm -----------------------

var temp_dir = '';
var dirs = ['/tmp', process.cwd()];

if (process.env.TMP) {
	dirs.unshift(process.env.TMP);
}

for (var dir of dirs) {
	var isDirectory = false;
	try {
		isDirectory = fs.statSync(dir).isDirectory();
	} catch (e) {}
	if (isDirectory) {
		temp_dir = dir;
		break;
	}
}

export interface ProgressData {
	bytesReceived: number;
	bytesExpected: number;
}

export interface FieldData {
	name: string;
	value: string;
}

export interface FileData {
	name: string;
	file: File;
}

export class IncomingForm {
	
	private _parser: Parser | null = null;
	private _flushing = 0;
	private _fields_size = 0;
	private _service: StaticService;

	private _error: Error | null = null;
	private _ended = false;
	readonly hash: crypto.Hash;

	get ended() {
		return this._ended;
	}

	/**
	 * default size 2MB
	 * @type {Number}
	 */
	readonly maxFieldsSize = 5 * 1024 * 1024;
	
	/**
	 * default size 5MB
	 * @type {Number}
	 */
	readonly maxFilesSize = 5 * 1024 * 1024;
	
	/**
	 * verifyFileMime 'js|jpg|jpeg|png' default as '*' ...
	 * @type {String}
	 */
	readonly verifyFileMime = '*';

	/**
	 * is use file upload, default not upload
	 * @type {Boolean}
	 */
	isUpload = false;

	readonly fields: Any = {};
	readonly files: Any<File[]> = {};
	
	keepExtensions = false;
	uploadDir = '';
	encoding = 'utf-8';
	headers: http.IncomingHttpHeaders = {};
	type: string = '';

	private bytesReceived: number = 0;
	private bytesExpected: number = 0;

	readonly onAborted = new EventNoticer('Aborted', this);
	readonly onProgress = new EventNoticer<ProgressData>('Progress', this);
	readonly onField = new EventNoticer<FieldData>('Field', this);
	readonly onFileBegin = new EventNoticer<FileData>('FileBegin', this);
	readonly onFile = new EventNoticer<FileData>('File', this);
	readonly onError = new EventNoticer<Error>('Error', this);
	readonly onEnd = new EventNoticer('End', this);

	/**
	 * constructor function
	 * @param {HttpService}
	 * @constructor
	 */
	constructor(service: StaticService) {
		this.hash = crypto.createHash(service.server.formHash || 'md5');
		this.uploadDir = service.server.temp;
		this._service = service;
		this.maxFieldsSize = this._service.server.maxFormDataSize;
		this.maxFilesSize = this._service.server.maxUploadFileSize;
	}

	_canceled() {
		for (var files of Object.values(this.files)) {
			for (var file of files) {
				fs.unlink(file.pathname, e=>{});
			}
		}
	}

	/**
	 * parse
	 */
	parse() {

		var self = this;
		var req = this._service.request;

		req.on('error', function (err) {
			self._throwError(err);
		});
		req.on('aborted', function () {
			self._canceled();
			self.onAborted.trigger({});
		});
		req.on('data', function (buffer) {
			self.write(buffer);
		});
		req.on('end', function () {
			if (self._error)
				return;
			var err = (<Parser>self._parser).end();
			if (err) {
				self._throwError(err);
			}
		});

		this.headers = req.headers;
		this._parseContentLength();
		this._parseContentType();
	}

	write(buffer: Buffer) {
		if (!this._parser) {
			this._throwError(new Error('unintialized parser'));
			return;
		}

		this.hash.update(buffer);
		
		this.bytesReceived += buffer.length;
		this.onProgress.trigger({
			bytesReceived: this.bytesReceived,
			bytesExpected: this.bytesExpected,
		});

		var bytesParsed = this._parser.write(buffer);
		if (bytesParsed !== buffer.length) {
			this._throwError(
				new Error('parser error, ' + 
				bytesParsed + ' of ' + 
				buffer.length + ' bytes parsed')
			);
		}

		return bytesParsed;
	}

	pause() {
		try {
			this._service.request.pause();
		} catch (err) {
			// the stream was destroyed
			if (!this._ended) {
				// before it was completed, crash & burn
				this._throwError(err);
			}
			return false;
		}
		return true;
	}

	resume() {
		try {
			this._service.request.resume();
		} catch (err) {
			// the stream was destroyed
			if (!this._ended) {
				// before it was completed, crash & burn
				this._throwError(err);
			}
			return false;
		}

		return true;
	}

	onpart(part: Part) {
		// this method can be overwritten by the user
		this.handle_part(part);
	}

	handle_part(part: Part) {
		var self = this;

		if (part.filename === undefined) {
			var value = '';
			var decoder = new StringDecoder(this.encoding);

			part.onData.on(function (e) {
				var buffer = <Buffer>e.data;
				self._fields_size += buffer.length;
				if (self._fields_size > self.maxFieldsSize) {
					self._throwError(new Error('maxFieldsSize exceeded, received ' + self._fields_size + ' bytes of field data'));
					return;
				}
				value += decoder.write(buffer);
			});

			part.onEnd.on(function () {
				self._fields_size = 0;
				self.fields[part.name] = value;
				self.onField.trigger({ name: part.name, value: value });
			});
			return;
		}

		if (!this.isUpload) {
			return this._throwError(new Error('Does not allow file uploads'));
		}

		this._flushing++;

		var file = new File(this._uploadPath(part.filename), part.filename,  part.mime);

		if (this.verifyFileMime != '*' && !new RegExp('\.(' + this.verifyFileMime + ')$', 'i').test(part.filename)) {
			return this._throwError(new Error('File mime error'));
		}

		this.onFileBegin.trigger({ name: part.name, file: file });

		part.onData.on(function(e) {
			var buffer = <Buffer>e.data;
			self.pause();

			self._fields_size += buffer.length;
			if (self._fields_size > self.maxFilesSize) { // limit
				file.end(function () {
					self._throwError(new Error('maxFilesSize exceeded, received ' + self._fields_size + ' bytes of field data'));
				});
				return;
			}

			file.write(buffer, function () {
				self.resume();
			});
		});

		part.onEnd.on(function () {
			self._fields_size = 0;
			file.end(function () {
				self._flushing--;

				var files = self.files[part.name];
				if (!files)
					self.files[part.name] = files = [];
				files.push(file);

				self.onFile.trigger({ name: part.name, file: file });
				self._maybeEnd();
			});
		});
	}

	_parseContentType() {

		var type = <string>this.headers['content-type'];

		if (type && type.match(/multipart/i)) {
			var m;
			if (m = type.match(/boundary=(?:"([^"]+)"|([^;]+))/i)) {
				this._initMultipart(m[1] || m[2]);
			} else {
				this._throwError(new Error('bad content-type header, no multipart boundary'));
			}
		} else {
			this._initUrlencodedOrJsonOrXml(type);
		}
	}

	_throwError(err: Error) {
		if (this._error) {
			return;
		}
		this._canceled();

		this._error = err;
		this._service.request.socket.end(); //close socket connect
		this.onError.trigger(err);
	}

	_parseContentLength() {
		if (this.headers['content-length']) {
			this.bytesReceived = 0;
			this.bytesExpected = parseInt(this.headers['content-length'], 10);
		}
	}

	_fileName(headerValue: string) {
		var m = headerValue.match(/filename="(.*?)"($|; )/i)
		if (!m) return;

		var filename = m[1].substr(m[1].lastIndexOf('\\') + 1);
		filename = filename.replace(/%22/g, '"');
		filename = filename.replace(/&#([\d]{4});/g, function (m, code) {
			return String.fromCharCode(code);
		});
		return filename;
	}

	_initMultipart(boundary: string) {
		this.type = 'multipart';

		var parser = new MultipartParser(boundary);
		var self = this;
		var headerField = '';
		var headerValue = '';
		var part: Part;

		(<any>parser).onPartBegin = function() {
			part = new Part();
		};

		(<any>parser).onHeaderField = function (b: Buffer, start: number, end: number) {
			headerField += b.toString(self.encoding, start, end);
		};

		(<any>parser).onHeaderValue = function (b: Buffer, start: number, end: number) {
			headerValue += b.toString(self.encoding, start, end);
		};

		(<any>parser).onHeaderEnd = function () {

			headerField = headerField.toLowerCase();
			part.headers[headerField] = headerValue;

			var m;
			if (headerField == 'content-disposition') {
				if (m = headerValue.match(/name="([^"]+)"/i)) {
					part.name = m[1];
				}

				part.filename = self._fileName(headerValue) || '';
			} else if (headerField == 'content-type') {
				part.mime = headerValue;
			}

			headerField = '';
			headerValue = '';
		};

		(<any>parser).onHeadersEnd = function () {
			self.onpart(part);
		};

		(<any>parser).onPartData = function (b: Buffer, start: number, end: number) {
			part.onData.trigger(b.slice(start, end));
		};

		(<any>parser).onPartEnd = function () {
			part.onEnd.trigger({});
		};

		(<any>parser).onEnd = function () {
			self._ended = true;
			self._maybeEnd();
		};

		this._parser = parser;
	}

	private _initUrlencodedOrJsonOrXml(type: string) {

		if (type && type.indexOf('json') >= 0) {
			type = 'json';
		} else if (type && type.indexOf('xml') >= 0) {
			type = 'xml';
		} else {
			type = 'urlencoded';
		}
		
		this.type = type;
		var parser = new QuerystringParser(type)
		var self = this;

		if (type == 'json' || type == 'xml') {
			// parser.onField = function() {};
			parser.onEnd = function(data) {
				self._ended = true;
				Object.assign(self.fields, data);
				self._maybeEnd();
			};
		} else {
			parser.onField = function (name, value) {
				self.fields[name] = value;
				self.onField.trigger({ name: name, value: value });
			};
			parser.onEnd = function() {
				self._ended = true;
				self._maybeEnd();
			};
		}
		
		this._parser = parser;
	}

	private _uploadPath(filename: string) {
		var name = '';
		for (var i = 0; i < 32; i++) {
			name += Math.floor(Math.random() * 16).toString(16);
		}

		if (this.keepExtensions) {
			var ext = Path.extname(filename);
			ext = ext.replace(/(\.[a-z0-9]+).*/, '$1');

			name += ext;
		}

		return Path.join(this.uploadDir, 'temp_upload_' + name);
	}

	private _maybeEnd() {
		if (!this._ended || this._flushing)
			return;
		this.onEnd.trigger({});
	}

}

function stateToString(stateNumber: number): string {
	for (var state in S) {
		var number: number = (<any>S)[state];
		if (number === stateNumber)
			return state;
	}
	return '';
}

// 
export default {
	IncomingForm: IncomingForm,
	temp_dir: temp_dir,
	STATUS: STATUS,
	stateToString: stateToString,
};

