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

import {
	Node, NODE_TYPE, NodeList, 
	DocumentFragment, Text, Comment,
	Attribute, CDATASection, ProcessingInstruction,
	EntityReference,
} from './node';
import {Element, visitNode} from './element';
import * as parser from './parser';

var Node_insertBefore = Node.prototype.insertBefore;
var Node_removeChild = Node.prototype.removeChild;

export class Document extends Node {

	// readonly nodeName = '#document';
	get nodeName() { return "#document" }
	readonly nodeType = NODE_TYPE.DOCUMENT_NODE;
	readonly childNodes = new NodeList();
	readonly ownerDocument: Document;
	doctype: Node | null;
	_documentElement: Element | null = null;
	_inc = 1;

	get documentElement() {
		return this._documentElement;
	}

	// Introduced in DOM Level 2:
	/**
		* constructor function
		* @constructor
		* @param {String}              namespaceURI
		* @param {String}              qualifiedName
		* @param {tesla.xml.DocumentType} doctype
		*/
	constructor(namespaceURI?: string, qualifiedName?: string, doctype?: Node) {
		super(<any>null);
		this.ownerDocument = this;
		// raises:INVALID_CHARACTER_ERR,NAMESPACE_ERR,WRONG_DOCUMENT_ERR
		this.doctype = doctype || null;
		if (this.doctype) {
			this.appendChild(this.doctype);
		}
		if (qualifiedName) {
			var root = this.createElementNS(namespaceURI || '', qualifiedName);
			this.appendChild(root);
		}
	}

	load(text: string) {
		return new parser.Parser().fragment(this, text);
	}

	insertBefore(newChild: Node, refChild: Node) { //raises
		if (newChild.nodeType == NODE_TYPE.DOCUMENT_FRAGMENT_NODE) {
			var child = newChild.firstChild;
			while (child) {
				this.insertBefore(newChild, refChild);
				child = child.nextSibling;
			}
			return newChild;
		}
		if (this._documentElement === null && newChild.nodeType == NODE_TYPE.ELEMENT_NODE)
			this._documentElement = <Element>newChild;
		
		Node_insertBefore.call(this, newChild, refChild);
		return newChild;
	}

	removeChild(oldChild: Node) {
		if (this.documentElement == oldChild) {
			this._documentElement = null;
		}
		return Node_removeChild.call(this, oldChild);
	}

	// Introduced in DOM Level 2:
	importNode(importedNode: Node, deep?: boolean) {
		// TODO Unrealized
		return null;
	}

	// Introduced in DOM Level 2:
	getElementById(id: string) {
		var rtv = null;
		visitNode(<Node>this.documentElement, function (node: Node) {
			if (node.nodeType == NODE_TYPE.ELEMENT_NODE) {
				if ((<Element>node).getAttribute('id') == id) {
					rtv = node;
					return false;
				}
				return true;
			}
			return false;
		});
		return rtv;
	}

	getElementsByTagName(name: string): NodeList {
		var el = this.documentElement;
		return el ?
			el.getElementsByTagName(name): new NodeList();
	}

	getElementsByTagNameNS(namespaceURI: string, localName: string): NodeList {
		var el = this.documentElement;
		return el ? 
			el.getElementsByTagNameNS(namespaceURI, localName): new NodeList();
	}

	//document factory method:
	createElement(tagName: string) {
		return new Element(this, tagName);
	}

	createDocumentFragment() {
		return new DocumentFragment(this);
	}

	createTextNode(data: string) {
		var r = new Text(this);
		r.appendData(data);
		return r;
	}

	createComment(data: string) {
		var r = new Comment(this);
		r.appendData(data);
		return r;
	}

	createCDATASection(data: string) {
		var r = new CDATASection(this);
		r.appendData(data);
		return r;
	}

	createProcessingInstruction(target: string, data: string) {
		return new ProcessingInstruction(this, target, data);
	}

	createAttribute(name: string, value: string) {
		return new Attribute(this, name, value, true);
	}

	createEntityReference(name: string, value?: string) {
		return new EntityReference(this, name, value);
	}

	// Introduced in DOM Level 2:
	createElementNS(namespaceURI: string, qualifiedName: string) {
		var el = new Element(this, qualifiedName);
		var pl = qualifiedName.split(':');
		el.namespaceURI = namespaceURI;
		if (pl.length == 2) {
			el.prefix = pl[0];
			el.localName = pl[1];
		} else {
			el.localName = qualifiedName;
		}
		return el;
	}

	// Introduced in DOM Level 2:
	createAttributeNS(namespaceURI: string, qualifiedName: string, value: string) {
		var r = new Attribute(this, qualifiedName, value, true);
		var pl = qualifiedName.split(':');
		r.namespaceURI = namespaceURI;
		if (pl.length == 2) {
			r.prefix = pl[0];
			r.localName = pl[1];
		} else {
			r.localName = qualifiedName;
		}
		return r;
	}

	toJSON() {
		var first = this.firstChild;
		if (!first)
			return null;
		var result: Dict<string> = {};
		var ns = <NodeList>first.childNodes;
		if (!ns)
			return null
		for (var i = 0; i < ns.length; i++) {
			var node = <Node>ns.item(i);
			if (node.nodeType === NODE_TYPE.ELEMENT_NODE) {
				var el = <Element>node;
				if (node.lastChild) {
					if (node.lastChild.nodeType == NODE_TYPE.CDATA_SECTION_NODE) { // cdata
						result[el.tagName] = (<CDATASection>node.lastChild).data;
					} else {
						result[el.tagName] = el.innerXml;
					}
				} else {
					result[el.tagName] = '';
				}
			}
		}
		return result;
	}
}
