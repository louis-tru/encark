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

// import util from '../util';
import * as doc from './document';
import {DocumentType,Node} from './node';
import {Element} from './element';

const ENTITY_MAP: Dict<string> = { 'lt': '<', 'gt': '>', 'amp': '&', 'quot': '"', 'apos': "'", 'nbsp': '\u00a0' };

interface Attribute { 
	prefix: string | null, 
	qName: string, 
	localName: string,
	offset: number,
	value: string,
	uri: string,
}

class Attributes {
	length = 0;
	getLocalName(i: number) { return (<any>this)[i].localName }
	getOffset(i: number) { return (<any>this)[i].offset }
	getQName(i: number) { return (<any>this)[i].qName }
	getURI(i: number) { return (<any>this)[i].uri }
	getValue(i: number) { return (<any>this)[i].value }
}

function split(source: string) {
	var match;
	var buf: RegExpExecArray[] = [];
	var reg = /'[^']+'|"[^"]+"|[^\s<>\/=]+(?:\s*=\s*)?|(\/?\s*>|<)/g;
	reg.lastIndex = 0;
	reg.exec(source); //skip <
	while (match = reg.exec(source)) {
		buf.push(match);
		if (match[1])
			return buf;
	}
	throw 'Err';
}

class XMLReader {
	_stack: any[];
	contentHandler: DOMHandler;
	lexicalHandler: DOMHandler;
	errorHandler: DOMHandler;

	private _entityReplacer(a: string) {
		var k = a.slice(1, -1);
		if (k.charAt(0) == '#')
			return String.fromCharCode(parseInt(k.substr(1).replace('x', '0x')));
		else if (k in ENTITY_MAP)
			return ENTITY_MAP[k];
		else {
			this.errorHandler && this.errorHandler.error('entity not found:' + a);
			return a;
		}
	}
	
	private _parse(source: string) {
		while (true) {
			var i = source.indexOf('<');
			var next = source.charAt(i + 1);
			if (i < 0) {
				this._appendText(source, source.length);
				return;
			}
			if (i > 0) {
				this._appendText(source, i);
				source = source.substring(i);
			}
	
			switch (next) {
				case '/':
					var end = source.indexOf('>', 3);
					var qName = source.substring(2, end);
					var config = this._stack.pop();
					source = source.substring(end + 1);
					this.contentHandler.endElement(config.uri, config.localName, qName);
					for (qName in config.nsMap) {
						this.contentHandler.endPrefixMapping(qName); //reuse qName as prefix
					}
					// end elment
					break;
				case '?': // <?...?>
					source = this._parseInstruction(source);
					break;
				case '!': // <!doctype,<![CDATA,<!--
					source = this._parseDCC(source);
					break;
				default:
					source = this._parseElementStart(source);
					break;
			}
		}
	}
	
	private _parseElementStart(source: string) {
		var tokens = split(source);
		var qName = tokens[0][0];
		var localName = qName.substr(qName.indexOf(':') + 1);
		var end = <RegExpExecArray>tokens.pop();
		var nsMap: Dict<string> | null = null;
		var uri: string | undefined;
		var attrs = new Attributes();
		var unsetURIs: Attribute[] = [];
		var len = tokens.length;
		var i = 1;
		var self = this;
		var attr;

		function replace(all: string, ...args: any[]) {
			return self._entityReplacer(all);
		}

		while (i < len) {
			var m = tokens[i++];
			var key = m[0]; // remove = on next expression
			var value = key.charAt(key.length - 1) == '=' ? key.slice(0, -1) : key;
			var nsp = value.indexOf(':');
			var prefix = nsp > 0 ? key.substr(0, nsp) : null;
			var localName = nsp > 0 ? value.substr(nsp + 1) : value;
			let attr: Attribute = (<any>attrs)[attrs.length++] = { 
				prefix: prefix, 
				qName: value, 
				localName,
				offset: 0,
				value: '',
				uri: '',
			};
	
			if (value == key) {//default value
				//TODO:check
			} else {
				//add key value
				m = tokens[i++];
				key = value;
				value = m[0];
				let nsp = value.charAt(0);
				if ((nsp == '"' || nsp == "'") && nsp == value.charAt(value.length - 1)) {
					value = value.slice(1, -1);
				}
	
				value = value.replace(/&#?\w+;/g, <any>replace);
				//TODO:encode value
			}

			if (prefix == 'xmlns' || key == 'xmlns') {
				attr.uri = 'http://www.w3.org/2000/xmlns/';
				if (!nsMap)
					nsMap = {};
				nsMap[prefix == 'xmlns' ? attr.localName : ''] = value;
			}
			else if (prefix) {
				if (prefix == 'xml')
					attr.uri = 'http://www.w3.org/XML/1998/namespace';
				else
					unsetURIs.push(attr);
			}
	
			attr.value = value;
			attr.offset = m.index;
		}

		var stack = self._stack;
		var top = stack[stack.length - 1];
		var config: Dict = { qName: qName };
		var nsStack = top.nsStack;

		//print(stack+'#'+nsStack)
		nsStack = config.nsStack = 
			(nsMap ? Object.assign({}, nsStack, nsMap) : nsStack);
		config.uri = nsStack[qName.slice(0, -localName.length)];

		while (attr = unsetURIs.pop())
			attr.uri = nsStack[<string>attr.prefix];

		if (nsMap) {
			for (prefix in nsMap)
				self.contentHandler.startPrefixMapping(prefix, nsMap[prefix]);
		}

		self.contentHandler.startElement(localName, qName, attrs, uri);
		if (end[0].charAt(0) == '/') {
			self.contentHandler.endElement(localName, qName, uri);
			if (nsMap) {
				for (prefix in nsMap)
					self.contentHandler.endPrefixMapping(prefix);
			}
		}
		else
			stack.push(config);

		return source.substr(end.index + end[0].length);
	}
	
	private _appendText(source: string, len: number) {
		source = source.substr(0, len);

		var contentHandler = this.contentHandler;
		var reg = /&(#?)(\w+);/g;
		var prevIndex = 0;
		var mat;

		while (mat = reg.exec(source)) {
			var index = mat.index;
			var text = mat[0];

			if (prevIndex != index)
				contentHandler.characters(source, prevIndex, index - prevIndex);
			if (mat[1]) {
				var value = this._entityReplacer(text);
				contentHandler.characters(value, 0, value.length);
			}
			else
				contentHandler.startEntityReference(mat[2]);
			prevIndex = index + text.length;
		}
		if (prevIndex != len)
			contentHandler.characters(source, prevIndex, len - prevIndex);
	}

	private _parseInstruction(source: string) {
		var match = source.match(/^<\?(\S*)\s*(.*)\?>/);
		if (match) {
			var len = match[0].length;
			this.contentHandler.processingInstruction(match[1], match[2]);
		}
		else //error
			this._appendText(source, len = 2);
		return source.substring(len);
	}

	private _parseDCC(source: string) {//sure start with '<!'
		var next = source.charAt(2)
		if (next == '-') {
			if (source.charAt(3) == '-') {
				var end = source.indexOf('-->');
				//append comment source.substring(4,end)//<!--
				var lex = this.lexicalHandler
				lex && lex.comment(source, 4, end - 4);
				return source.substring(end + 3)
			} else {
				//error
				this._appendText(source, 3)
				return source.substr(3);
			}
		} else {
			if (/^<!\[CDATA\[/.test(source)) {
				var end = source.indexOf(']]>');
				var lex = this.lexicalHandler;
				lex.startCDATA();
				// appendText(self, source.substring(9, end), 0, end - 9);
				this._appendText(source.substring(9, end), end - 9);
				lex.endCDATA()
				return source.substring(end + 3);
			}
			//<!DOCTYPE
			//startDTD(java.lang.String name, java.lang.String publicId, java.lang.String systemId)
			var matchs = split(source);
			var len = matchs.length;
			if (len > 1 && /!doctype/i.test(matchs[0][0])) {
	
				var name = matchs[1][0];
				var pubid = len > 3 && /^public$/i.test(matchs[2][0]) && matchs[3][0]
				var sysid = len > 4 && matchs[4][0];
				var lex = this.lexicalHandler;
				var reg = /^"?([^"]*)"?$/;
	
				lex.startDTD(name, 
					pubid ? ((<RegExpMatchArray>pubid.match(reg))[1]): '', 
					sysid ? ((<RegExpMatchArray>sysid.match(reg))[1]): '');
				lex.endDTD();
				let match = matchs[len - 1];
				return source.substr(match.index + match[0].length);
			} else {
				this._appendText(source, 2)
				return source.substr(2);
			}
		}
	}

	/**
	* constructor function
	* @constructor
	*/
	constructor(handler: DOMHandler, handler1: DOMHandler, handler2: DOMHandler) {
		this.contentHandler = handler;
		this.lexicalHandler = handler1;
		this.errorHandler = handler2;
		this._stack = [{ nsMap: {}, nsStack: {}}];
	}

	parse(source: string) {
		this.contentHandler.startDocument();
		this._parse(source);
		this.contentHandler.endDocument();
	}

	fragment(source: string) {
		this._parse(source);
	}
}

function noop() {
	return null;
}

class DOMHandler {

	document: doc.Document;
	currentElement?: Element;
	saxExceptions: Error[];
	cdata: boolean;
	locator?: any;

	/* Private static helpers treated below as private instance methods, 
	so don't need to add these to the public API; we might use a Relator 
	to also get rid of non-standard public properties */
	private _appendElement(node: Node) {
		if (this.currentElement)
			this.currentElement.appendChild(node);
		else
			(<doc.Document>this.document).appendChild(node);
	}

	/**
		* constructor function
		* @param {Document} doc (Optional)
		* @param {Element} el   (Optional)
		* @constructor
		*/
	constructor(d?: doc.Document, el?: Element) {
		this.saxExceptions = [];
		this.cdata = false;
		this.document = d || new doc.Document();
		this.currentElement = el;
	}

	startDocument() {
		// this.document = new doc.Document();
		// if (this.locator)
		// 	this.document.documentURI = this.locator.getSystemId();
	}

	endDocument() {
		this.document.normalize();
	}

	setDocumentLocator(locator: any) {
		this.locator = locator;
	}

	startElement(localName: string, qName: string, attrs: Attributes, namespaceURI?: string) {
		var doc = this.document;
		var el = namespaceURI ? 
			doc.createElementNS(namespaceURI, qName || localName): 
			doc.createElement(qName || localName);
		var len = attrs.length;
		this._appendElement(el);
		this.currentElement = el;
		for (var i = 0; i < len; i++) {
			let namespaceURI = attrs.getURI(i);
			let value = attrs.getValue(i);
			let qName = attrs.getQName(i);
			if (namespaceURI)
				this.currentElement.setAttributeNS(namespaceURI, qName, value);
			else 
				this.currentElement.setAttribute(qName, value);
		}
	}

	endElement(localName: string, qName: string, namespaceURI?: string) {
		var parent = <Element>(<Element>this.currentElement).parentNode;
		// if (parent && parent.tagName != qName){
		// 		var err = 'Xml format error "</' + qName + '>" no start tag';
		// 		throw err;
		// }
		this.currentElement = parent;
	}

	toString(chars: string | string[], start: number, length: number) {
		return typeof chars == 'string' ?
			chars.substr(start, length) :
			Array.toArray(chars).slice(start, start + length).join('');
	}	

	startPrefixMapping(prefix: string, uri: string) {}
	endPrefixMapping(prefix: string) {}
	processingInstruction(target: string, data: string) {
		var ins = (<doc.Document>this.document).createProcessingInstruction(target, data);
		this._appendElement(ins);
	}
	ignorableWhitespace(ch: string, start: number, length: number) {}
	characters(chars: string, start: number, length: number) {
		chars = this.toString(chars, start, length);
		if (this.currentElement && chars) {
			if (this.cdata) {
				var cdataNode = this.document.createCDATASection(chars);
				this.currentElement.appendChild(cdataNode);
			} else {
				var textNode = this.document.createTextNode(chars);
				this.currentElement.appendChild(textNode);
			}
		}
	}
	skippedEntity(name: string) {}
	//LexicalHandler
	comment(chars: string, start: number, length: number) {
		chars = this.toString(chars, start, length);
		var comment = this.document.createComment(chars);
		this._appendElement(comment);
	}
	startCDATA() {
		//used in characters() methods
		this.cdata = true;
	}
	endCDATA() {
		this.cdata = false;
	}
	startDTD(name: string, publicId: string, systemId: string) {
		var doc = this.document;
		var doctype = new DocumentType(doc, name, publicId, systemId);
		doc.doctype = doctype;
		doc.appendChild(doctype);
	}
	startEntityReference(name: string) {
		var v: string = ENTITY_MAP[name];
		var node = this.document.createEntityReference(name, v);
		(<Element>this.currentElement).appendChild(node);
	}
	warning(error: any) {
		this.saxExceptions.push(Error.new(error));
	}
	error(error: any) {
		this.saxExceptions.push(Error.new(error));
	}
	fatalError(error: Error) {
		console.warn('DOMHandler#fatalError', error);
		throw error;
	}
	endEntityReference = noop
	endDTD = noop;
	startEntity = noop;
	endEntity = noop;
	attributeDecl = noop;
	elementDecl = noop;
	externalEntityDecl = noop;
	internalEntityDecl = noop;
	resolveEntity = noop;
	getExternalSubset = noop;
	notationDecl = noop;
	unparsedEntityDecl = noop;
}

export class Parser {

	/**
		* constructor function
		* @param  {String}          source
		* @return {Document}
		* @constructor
		*/
	parser(source: string) {
		var handler = new DOMHandler();
		var sax = new XMLReader(handler, handler, handler);
		sax.parse(source);
		return handler.document;
	}

	/**
		* constructor function
		* @param  {Document} doc
		* @param  {Element}  el
		* @param  {String}          source
		* @return {Document}
		* @constructor
		*/
	fragment(doc: doc.Document, source: string, el?: Element) {
		var handler = new DOMHandler(doc, el);
		var sax = new XMLReader(handler, handler, handler);
		sax.fragment(source);
		return handler.document;
	}

}