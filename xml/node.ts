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

import utils from '../util';
import * as doc from './document';
import * as el from './element';
import * as nnm from './named_node_map';

const html_tag = /^(br|hr|input|frame|img|area|link|col|meta|area|base|basefont|param)$/i;
const html = /^html$/i;

function xmlEncoder(c: string) {
	return c == '<' && '&lt;' || c == '&' && '&amp;' || 
				 c == '"' && '&quot;' || '&#' + c.charCodeAt(0) + ';';
}

function findNSMap(self: Node) {
	var el = self;

	while (el.nodeType !== exports.ELEMENT_NODE) {
		if (el.nodeType === exports.ATTRIBUTE_NODE) {
			el = el.ownerElement;
		} else {
			el = el.parentNode;
		}
	}
	return el._namespaceMap;
}

function serializeToString(node: Node, buf: string[]) {
	switch (node.nodeType) {
		case exports.ELEMENT_NODE:
			var attrs = node.attributes;
			var len = attrs.length;
			var child = node.firstChild;
			var nodeName = node.tagName;
			buf.push('<', nodeName);
			for (var i = 0; i < len; i++) {
				serializeToString(attrs.item(i), buf);
			}
			if (child) {
				buf.push('>');
				while (child) {
					serializeToString(child, buf);
					child = child.nextSibling;
				}
				buf.push('</', nodeName, '>');
			} else {

				var doc = node.ownerDocument;
				var doctype = doc.doctype;
				if (doctype && html.test(doctype.name)) {

					if (html_tag.test(nodeName))
						buf.push(' />');
					else
						buf.push('></', nodeName, '>');
				}
				else
					buf.push(' />');
			}
			return;
		case exports.DOCUMENT_NODE:
		case exports.DOCUMENT_FRAGMENT_NODE:
			var child = node.firstChild;
			while (child) {
				serializeToString(child, buf);
				child = child.nextSibling;
			}
			return;
		case exports.ATTRIBUTE_NODE:
			return buf.push(' ', node.name, '="', node.value.replace(/[<&"]/g, xmlEncoder), '"');
		case exports.TEXT_NODE:
			return buf.push(node.data.replace(/[<&]/g, xmlEncoder)); //(?!#?[\w\d]+;)
		case exports.CDATA_SECTION_NODE:
			return buf.push('<![CDATA[', node.data, ']]>');
		case exports.COMMENT_NODE:
			return buf.push("<!--", node.data, "-->");
		case exports.DOCUMENT_TYPE_NODE:

			var pubid = node.publicId;
			var sysid = node.systemId;

			buf.push('<!DOCTYPE ', node.name);
			if (pubid) {
				buf.push(' PUBLIC "', pubid);
				if (sysid && sysid != '.') {
					buf.push('" "', sysid);
				}
				buf.push('">');
			} else if (sysid && sysid != '.') {
				buf.push(' SYSTEM "', sysid, '">');
			} else {
				var sub = node.internalSubset;
				if (sub) {
					buf.push(" [", sub, "]");
				}
				buf.push(">");
			}
			return;
		case exports.PROCESSING_INSTRUCTION_NODE:
			return buf.push("<?", node.nodeName, " ", node.data, "?>");
		case exports.ENTITY_REFERENCE_NODE:
			return buf.push('&', node.nodeName, ';');
			//case ENTITY_NODE:
			//case NOTATION_NODE:
		default:
			buf.push('??', node.nodeName);
	}
}

/*
* attributes;
* children;
*
* writeable properties:
* nodeValue,Attr:value,CharacterData:data
* prefix
*/
function update(self: Node, el: Node, attr) {

	var doc = self.ownerDocument || self;
	doc._inc++;
	if (attr) {
		if (attr.namespaceURI == 'http://www.w3.org/2000/xmlns/') {
			//update namespace
		}
	} else {//node
		//update childNodes
		var cs = el.childNodes;
		var child = el.firstChild;
		var i = 0;

		while (child) {
			cs[i++] = child;
			child = child.nextSibling;
		}
		cs.length = i;
	}
}

function cloneNode(doc: Node, node: Node, deep: boolean) {
	var node2 = new node.constructor();
	for (var n in node) {
		var v = node[n];
		if (typeof v != 'object') {
			if (v != node2[n]) {
				node2[n] = v;
			}
		}
	}
	if (node.childNodes) {
		node2.childNodes = new NodeList();
	}
	node2.ownerDocument = doc;
	switch (node2.nodeType) {
		case exports.ELEMENT_NODE:
			var attrs = node.attributes;
			var attrs2 = node2.attributes = new NamedNodeMap();
			var len = attrs.length
			attrs2._ownerElement = node2;
			for (var i = 0; i < len; i++) {
				attrs2.setNamedItem(cloneNode(doc, attrs.item(i), true));
			}
			break; ;
		case exports.ATTRIBUTE_NODE:
			deep = true;
	}
	if (deep) {
		var child = node.firstChild;
		while (child) {
			node2.appendChild(cloneNode(doc, child, deep));
			child = child.nextSibling;
		}
	}
	return node2;
}

export enum NODE_TYPE {
	NODE_NODE = 1,
	ELEMENT_NODE = 1,
	ATTRIBUTE_NODE = 2,
	TEXT_NODE = 3,
	CDATA_SECTION_NODE = 4,
	ENTITY_REFERENCE_NODE = 5,
	ENTITY_NODE = 6,
	PROCESSING_INSTRUCTION_NODE = 7,
	COMMENT_NODE = 8,
	DOCUMENT_NODE = 9,
	DOCUMENT_TYPE_NODE = 10,
	DOCUMENT_FRAGMENT_NODE = 11,
	NOTATION_NODE = 12,
};

export class Node {
	readonly ownerDocument: doc.Document;
	readonly nodeType?: NODE_TYPE;
	readonly childNodes?: NodeList;
	readonly attributes?: nnm.NamedNodeMap;
	firstChild?: Node;
	lastChild?: Node;
	previousSibling?: Node;
	nextSibling?: Node;
	parentNode?: Node;
	nodeValue?: string;
	namespaceURI?: string;
	prefix?: string;
	localName?: string;

	constructor(ownerDocument: doc.Document) {
		this.ownerDocument = ownerDocument;
	}

	// Modified in DOM Level 2:
	insertBefore(newChild: Node, refChild: Node | null) {//raises
		utils.assert(newChild.ownerDocument == this.ownerDocument);

		var parentNode = this;

		var cp = newChild.parentNode;
		if (cp) {
			cp.removeChild(newChild); //remove and update
		}
		if (newChild.nodeType === NODE_TYPE.DOCUMENT_FRAGMENT_NODE) {
			var newFirst = newChild.firstChild;
			var newLast = newChild.lastChild;
		}
		else
			newFirst = newLast = newChild;

		if (!refChild) {
			var pre = parentNode.lastChild;
			parentNode.lastChild = newLast;
		} else {
			var pre = refChild.previousSibling;
			newLast.nextSibling = refChild;;
			refChild.previousSibling = newLast;
		}
		if (pre)
			pre.nextSibling = newFirst;
		else
			parentNode.firstChild = newFirst;

		newFirst.previousSibling = pre;
		do
			newFirst.parentNode = parentNode;
		while (newFirst !== newLast && (newFirst = newFirst.nextSibling))

		update(this, parentNode);
	}

	replaceChild(newChild: Node, oldChild: Node) {//raises
		this.insertBefore(newChild, oldChild);
		if (oldChild) {
			this.removeChild(oldChild);
		}
	}

	removeAllChild() {
		var ns = this.childNodes;
		for (var i = 0, l = ns.length; i < l; i++) {
			ns[i].parentNode = null;
			delete ns[i];
		}
		this.firstChild = null;
		this.lastChild = null;

		update(this, this);
	}

	removeChild(oldChild: Node) {
		var parentNode = this;
		var previous = null;
		var child = this.firstChild;

		while (child) {
			var next = child.nextSibling;
			if (child === oldChild) {
				oldChild.parentNode = null; //remove it as a flag of not in document
				if (previous)
					previous.nextSibling = next;
				else
					parentNode.firstChild = next;

				if (next)
					next.previousSibling = previous;
				else
					parentNode.lastChild = previous;
				update(this, parentNode);
				return child;
			}
			previous = child;
			child = next;
		}
	}

	appendChild(newChild: Node) {
		return this.insertBefore(newChild, null);
	}
	hasChildNodes() {
		return this.firstChild != null;
	}
	cloneNode(deep: boolean) {
		return cloneNode(this.ownerDocument || this, this, deep);
	}
	// Modified in DOM Level 2:
	normalize() {
		var child = this.firstChild;
		while (child) {
			var next = child.nextSibling;
			if (next && next.nodeType == exports.TEXT_NODE && child.nodeType == exports.TEXT_NODE) {
				this.removeChild(next);
				child.appendData(next.data);
			} else {
				child.normalize();
				child = next;
			}
		}
	}
	// Introduced in DOM Level 2:
	isSupported(feature, version) {
		return this.ownerDocument.implementation.hasFeature(feature, version);
	}
	// Introduced in DOM Level 2:
	hasAttributes() {
		return this.attributes.length > 0;
	}
	lookupPrefix(namespaceURI) {
		var map = findNSMap(this)
		if (namespaceURI in map) {
			return map[namespaceURI]
		}
		return null;
	}
	// Introduced in DOM Level 3:
	isDefaultNamespace(namespaceURI) {
		var prefix = this.lookupPrefix(namespaceURI);
		return prefix == null;
	}
	// Introduced in DOM Level 3:
	lookupNamespaceURI(prefix) {
		var map = findNSMap(this)
		for (var n in map) {
			if (map[n] == prefix) {
				return n;
			}
		}
		return null;
	}

	toString() {
		var buf = [];
		serializeToString(this, buf);
		return buf.join('');
	}

}

// util.assign(Node.prototype, NODE_TYPE);
// util.assign(exports, NODE_TYPE);

/**
	* @see http://www.w3.org/TR/2000/REC-DOM-Level-2-Core-20001113/core.html#ID-536297177
	* The NodeList interface provides the abstraction of an ordered collection of nodes, without defining or constraining how this collection is implemented. NodeList objects in the DOM are live.
	* The items in the NodeList are accessible via an integral index, starting from 0.
	*/

export class NodeList {

	/**
		* The number of nodes in the list. The range of valid child node indices is 0 to length-1 inclusive.
		* @standard level1
		*/
	protected _length = 0

	get length() {
		return this._length;
	}

	/**
		* Returns the indexth item in the collection. If index is greater than or equal to the number of nodes in the list, this returns null.
		* @standard level1
		* @param index  unsigned long
		*   Index into the collection.
		* @return Node
		* 	The node at the indexth position in the NodeList, or null if that is not a valid index.
		*/
	item(index: number): Node | null {
		return (<any>this)[index] || null;
	}
}

const Zero_childNodes = new NodeList();

export class LiveNodeList extends NodeList {

	private _node: Node;
	private _refresh: (n: Node)=>Node[];
	private _inc: any;

	private _update_live_node_list() {
		var self = this;
		var inc = (<any>self)._node.ownerDocument._inc;
		if (self._inc != inc) {
			var ls = self._refresh(self._node);
			var l = ls.length;
	
			self._length = l;

			for(var i = 0; i < l; i++)
				(<any>self)[i] = ls[i];
			self._inc = inc;
		}
	}

	get length() {
		this._update_live_node_list();
		return this._length;
	}
	
	constructor(node: Node, refresh: (n: Node)=>Node[]) {
		super();
		this._node = node;
		this._refresh = refresh;
	}

	item(index: number): Node | null {
		this._update_live_node_list();
		return (<any>this)[index] || null;
	}
}

class CharacterData extends Node {
	data = '';
	length = 0;

	substringData(offset: number, count: number) {
		return this.data.substring(offset, offset + count);
	}

	appendData(text: string) {
		text = this.data + text;
		this.nodeValue = this.data = text;
		this.length = text.length;
	}
	
	insertData(offset: number, text: string) {
		this.replaceData(offset, 0, text);
	}
	
	deleteData(offset: number, count: number) {
		this.replaceData(offset, count, '');
	}
	
	replaceData(offset: number, count: number, text: string) {
		var start = this.data.substring(0, offset);
		var end = this.data.substring(offset + count);
		text = start + text + end;
		this.nodeValue = this.data = text;
		this.length = text.length;
	}
}

export class Attribute extends CharacterData {
	readonly nodeType = NODE_TYPE.ATTRIBUTE_NODE;
	ownerElement: el.Element | null = null;
	readonly name: string;
	readonly specified: boolean;
	value: string;

	get nodeName() {
		return this.name;
	}

	constructor(doc: doc.Document, name: string, value: string, specified: boolean = false) {
		super(doc);
		// this.ownerElement = ownerElement;
		this.name = name;
		this.value = value;
		this.specified = specified;
	}
}

export class CDATASection extends CharacterData {
	readonly nodeType = NODE_TYPE.CDATA_SECTION_NODE;
	readonly nodeName = "#cdata-section";
}

export class Comment extends CharacterData {
	readonly nodeType = NODE_TYPE.COMMENT_NODE;
	readonly nodeName = "#comment";
}

export class DocumentFragment extends Node {
	readonly nodeName = '#document-fragment';
	readonly childNodes = new NodeList();
}

export class DocumentType extends Node {
	readonly nodeName: string;
	readonly nodeType = NODE_TYPE.DOCUMENT_TYPE_NODE;
	readonly name: string;
	readonly publicId: string;
	readonly systemId: string;

	// Introduced in DOM Level 2:
	/**
		* constructor function
		* @constructor
		* @param {String}              qualifiedName
		* @param {String}              publicId
		* @param {String}              systemId
		*/
	constructor(doc: doc.Document, qualifiedName: string, publicId: string, systemId: string) {
		// raises:INVALID_CHARACTER_ERR,NAMESPACE_ERR
		super(doc);
		this.name = qualifiedName;
		this.nodeName = qualifiedName;
		this.publicId = publicId;
		this.systemId = systemId;
		// Introduced in DOM Level 2:
		//readonly attribute DOMString        internalSubset;
		//TODO:..
		//  readonly attribute NamedNodeMap     entities;
		//  readonly attribute NamedNodeMap     notations;
	}
}

export class Entity extends Node {
	readonly nodeType = NODE_TYPE.ENTITY_NODE;
}

export class EntityReference extends Node {
	readonly nodeType = NODE_TYPE.ENTITY_REFERENCE_NODE;
	nodeName = '';
}

export class Notation extends Node {
	readonly nodeType = NODE_TYPE.NOTATION_NODE;
}

export class ProcessingInstruction extends Node {
	readonly nodeType = NODE_TYPE.PROCESSING_INSTRUCTION_NODE;
	readonly target: string;
	readonly data: string;
	constructor(doc: doc.Document, target: string, data: string) {
		super(doc);
		this.target = target;
		this.data = data;
	}
}

export class Text extends CharacterData {
	readonly nodeName = "#text";
	readonly nodeType = NODE_TYPE.TEXT_NODE;

	splitText(offset: number) {
		var text = this.data;
		var newText = text.substring(offset);
		text = text.substring(0, offset);
		this.data = this.nodeValue = text;
		this.length = text.length;
		var newNode = this.ownerDocument.createTextNode(newText);
		if (this.parentNode) {
			this.parentNode.insertBefore(newNode, this.nextSibling);
		}
		return newNode;
	}
}
