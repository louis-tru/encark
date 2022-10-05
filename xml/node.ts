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

import utils from '../util';
import * as doc from './document';
import * as el from './element';
import * as nnm from './named_node_map';

const html_tag = /^(br|hr|input|frame|img|area|link|col|meta|area|base|basefont|param)$/i;
const html = /^html$/i;

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

function xmlEncoder(c: string) {
	return c == '<' && '&lt;' || c == '&' && '&amp;' || 
				 c == '"' && '&quot;' || '&#' + c.charCodeAt(0) + ';';
}

function findNSMap(self: Node): Dict<string> {
	var e = self;
	while (e && e.nodeType !== NODE_TYPE.ELEMENT_NODE) {
		if (e.nodeType === NODE_TYPE.ATTRIBUTE_NODE) {
			e = <Node>(<Attribute>e).ownerElement;
		} else {
			e = <Node>e.parentNode;
		}
	}
	return e ? ((<el.Element>e).namespaceMap || {}): {};
}

function serializeToString(node: Node, buf: string[]) {
	switch (node.nodeType) {
		case NODE_TYPE.ELEMENT_NODE:
			var e = (<el.Element>node);
			var attrs = e.attributes;
			var len = attrs.length;
			var child = node.firstChild;
			var nodeName = e.tagName;
			buf.push('<', nodeName);
			for (var i = 0; i < len; i++) {
				serializeToString(<Node>attrs.item(i), buf);
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
				if (doctype && html.test((<DocumentType>doctype).name)) {
					if (html_tag.test(nodeName))
						buf.push(' />');
					else
						buf.push('></', nodeName, '>');
				}
				else
					buf.push(' />');
			}
			return;
		case NODE_TYPE.DOCUMENT_NODE:
		case NODE_TYPE.DOCUMENT_FRAGMENT_NODE:
			var child = node.firstChild;
			while (child) {
				serializeToString(child, buf);
				child = child.nextSibling;
			}
			return;
		case NODE_TYPE.ATTRIBUTE_NODE:
			return buf.push(' ', (<Attribute>node).name, '="', (<Attribute>node).value.replace(/[<&"]/g, xmlEncoder), '"');
		case NODE_TYPE.TEXT_NODE:
			return buf.push((<Text>node).data.replace(/[<&]/g, xmlEncoder)); //(?!#?[\w\d]+;)
		case NODE_TYPE.CDATA_SECTION_NODE:
			return buf.push('<![CDATA[', (<CDATASection>node).data, ']]>');
		case NODE_TYPE.COMMENT_NODE:
			return buf.push("<!--", (<Comment>node).data, "-->");
		case NODE_TYPE.DOCUMENT_TYPE_NODE:
			var pubid = (<DocumentType>node).publicId;
			var sysid = (<DocumentType>node).systemId;

			buf.push('<!DOCTYPE ', (<DocumentType>node).name);
			if (pubid) {
				buf.push(' PUBLIC "', pubid);
				if (sysid && sysid != '.') {
					buf.push('" "', sysid);
				}
				buf.push('">');
			} else if (sysid && sysid != '.') {
				buf.push(' SYSTEM "', sysid, '">');
			} else {
				var sub = (<DocumentType>node).internalSubset;
				if (sub) {
					buf.push(" [", sub, "]");
				}
				buf.push(">");
			}
			return;
		case NODE_TYPE.PROCESSING_INSTRUCTION_NODE:
			// readonly target: string;
			// readonly data: string;
			return buf.push("<?", (<ProcessingInstruction>node).nodeName, " ", (<ProcessingInstruction>node).data, "?>");
		case NODE_TYPE.ENTITY_REFERENCE_NODE:
			return buf.push('&', (<EntityReference>node).nodeName, ';');
			//case ENTITY_NODE:
			//case NOTATION_NODE:
		default:
			buf.push('??', node.nodeName || '?');
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
function update(self: Node, e: Node, attr?: Attribute) {
	var doc = self.ownerDocument || self;
	doc._inc++;
	if (attr) {
		if (attr.namespaceURI == 'http://www.w3.org/2000/xmlns/') {
			//update namespace
		}
	} else { //node
		//update childNodes
		var cs = e.childNodes;
		if (cs) {
			var child = e.firstChild;
			var i = 0;
			while (child) {
				(<any>cs)[i++] = child;
				child = child.nextSibling;
			}
			(<any>cs)._length = i; // TODO private visit
		}
	}
}

export class Node {
	readonly ownerDocument: doc.Document;
	readonly nodeType?: NODE_TYPE;
	readonly childNodes?: NodeList;
	readonly attributes?: nnm.NamedNodeMap;
	get nodeName(): string | undefined { return };
	get nodeValue(): string | undefined { return };
	firstChild?: Node;
	lastChild?: Node;
	previousSibling?: Node;
	nextSibling?: Node;
	parentNode?: Node;
	namespaceURI?: string;
	localName?: string;
	prefix?: string;

	constructor(ownerDocument: doc.Document) {
		this.ownerDocument = ownerDocument;
	}

	// Modified in DOM Level 2:
	insertBefore(newChild: Node, refChild: Node | null) {//raises
		utils.assert(newChild.ownerDocument == this.ownerDocument, 'OwnerDocument mismatch');
		utils.assert(this.childNodes, 'Cannot add child node');

		var parentNode = this;

		var cp = newChild.parentNode;
		if (cp) {
			cp.removeChild(newChild); //remove and update
		}
		var newLast: Node, newFirst: Node;
		if (newChild.nodeType === NODE_TYPE.DOCUMENT_FRAGMENT_NODE) {
			utils.assert(newChild.firstChild, 'DOCUMENT_FRAGMENT_NODE cannot be empty');
			newFirst = <Node>newChild.firstChild;
			newLast = <Node>newChild.lastChild;
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
		while (newFirst !== newLast && (newFirst = <Node>newFirst.nextSibling))

		update(this, parentNode);
	}

	replaceChild(newChild: Node, oldChild: Node) {//raises
		this.insertBefore(newChild, oldChild);
		if (oldChild) {
			this.removeChild(oldChild);
		}
	}

	removeAllChild() {
		var ns = <NodeList>this.childNodes;
		if (ns) {
			for (var i = 0, l = ns.length; i < l; i++) {
				(<Node> ns.item(i)).parentNode = undefined;
				delete (<any>ns)[i];
			}
			(<any>ns)._length = 0; // TODO private visit
			this.firstChild = undefined;
			this.lastChild = undefined;
			update(this, this);
		}
	}

	removeChild(oldChild: Node) {
		var parentNode = this;
		var previous;
		var child = this.firstChild;

		while (child) {
			var next = child.nextSibling;
			if (child === oldChild) {
				oldChild.parentNode = undefined; //remove it as a flag of not in document
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
		return null;
	}

	appendChild(newChild: Node) {
		return this.insertBefore(newChild, null);
	}

	hasChildNodes() {
		return this.firstChild != null;
	}

	cloneNode(deep: boolean = false) {
		// TODO Unrealized
		return null;
	}

	// Modified in DOM Level 2:
	normalize() {
		var child = this.firstChild;
		while (child) {
			var next = child.nextSibling;
			if (next && next.nodeType == NODE_TYPE.TEXT_NODE && child.nodeType == NODE_TYPE.TEXT_NODE) {
				this.removeChild(next);
				(<Text>child).appendData((<Text>next).data);
			} else {
				child.normalize();
				child = next;
			}
		}
	}

	// Introduced in DOM Level 2:
	isSupported(feature: string, version: string) {
		// TODO Unrealized
		// return this.ownerDocument.implementation.hasFeature(feature, version);
		return false;
	}

	// Introduced in DOM Level 2:
	hasAttributes() {
		if (this.attributes)
			return this.attributes.length > 0;
		return false;
	}

	lookupPrefix(namespaceURI: string) {
		var map = findNSMap(this)
		if (namespaceURI in map) {
			return <string>map[namespaceURI];
		}
		return null;
	}

	// Introduced in DOM Level 3:
	isDefaultNamespace(namespaceURI: string) {
		var prefix = this.lookupPrefix(namespaceURI);
		return prefix == null;
	}

	// Introduced in DOM Level 3:
	lookupNamespaceURI(prefix: string) {
		var map = findNSMap(this)
		for (var n in map) {
			if (map[n] == prefix)
				return n;
		}
		return null;
	}

	toString() {
		var buf: string[] = [];
		serializeToString(this, buf);
		return buf.join('');
	}

}

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

export class LiveNodeList extends NodeList {

	private _node: Node;
	private _refresh: (n: Node)=>Node[];
	private _inc: any;

	private _updateLiveNodeList() {
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
		this._updateLiveNodeList();
		return this._length;
	}
	
	constructor(node: Node, refresh: (n: Node)=>Node[]) {
		super();
		this._node = node;
		this._refresh = refresh;
	}

	item(index: number): Node | null {
		this._updateLiveNodeList();
		return (<any>this)[index] || null;
	}
}

class CharacterData extends Node {
	data = '';
	length = 0;

	get nodeValue() {
		return this.data;
	}

	substringData(offset: number, count: number) {
		return this.data.substring(offset, offset + count);
	}

	appendData(text: string) {
		text = this.data + text;
		this.data = text;
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
		this.data = text;
		this.length = text.length;
	}
}

export class Attribute extends CharacterData {
	readonly nodeType = NODE_TYPE.ATTRIBUTE_NODE;
	ownerElement: el.Element | null = null;
	readonly name: string;
	readonly specified: boolean;
	value: string;

	get nodeValue() {
		return this.value;
	}

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
	get nodeName() { return "#cdata-section" };
}

export class Comment extends CharacterData {
	readonly nodeType = NODE_TYPE.COMMENT_NODE;
	get nodeName() { return "#comment" };
}

export class DocumentFragment extends Node {
	get nodeName() { return '#document-fragment' }
	readonly childNodes = new NodeList();
}

export class DocumentType extends Node {
	get nodeName() { return this.name }
	readonly nodeType = NODE_TYPE.DOCUMENT_TYPE_NODE;
	readonly name: string;
	readonly publicId: string;
	readonly systemId: string;
	// Introduced in DOM Level 2:
	readonly internalSubset?: string;
	//  readonly attribute NamedNodeMap     entities;
	//  readonly attribute NamedNodeMap     notations;

	/**
		* constructor function
		* @constructor
		* @param {String}              qualifiedName
		* @param {String}              publicId
		* @param {String}              systemId
		*/
	constructor(doc: doc.Document, qualifiedName: string, publicId: string, systemId: string, internalSubset?: string) {
		// raises:INVALID_CHARACTER_ERR,NAMESPACE_ERR
		super(doc);
		this.name = qualifiedName;
		this.publicId = publicId;
		this.systemId = systemId;
		this.internalSubset = internalSubset;
	}
}

export class Entity extends Node {
	readonly nodeType = NODE_TYPE.ENTITY_NODE;
	get nodeName() { return '#entity' }
}

export class EntityReference extends Node {
	readonly nodeType = NODE_TYPE.ENTITY_REFERENCE_NODE;
	private readonly _nodeName: string;
	private readonly _nodeValue?: string;
	get nodeName() { return this._nodeName }
	get nodeValue() { return this._nodeValue }
	get text() { return this.nodeValue }
	constructor(doc: doc.Document, nodeName: string, nodeValue?: string) {
		super(doc);
		this._nodeName = nodeName;
		this._nodeValue = nodeValue;
	}
}

export class Notation extends Node {
	readonly nodeType = NODE_TYPE.NOTATION_NODE;
	get nodeName() { return "#notation" }
}

export class ProcessingInstruction extends Node {
	readonly nodeType = NODE_TYPE.PROCESSING_INSTRUCTION_NODE;
	readonly name: string;
	readonly data: string;
	get nodeName() { return this.name }
	constructor(doc: doc.Document, name: string, data: string) {
		super(doc);
		this.name = name;
		this.data = data;
	}
}

export class Text extends CharacterData {
	get nodeName() { return "#text" }
	readonly nodeType = NODE_TYPE.TEXT_NODE;

	splitText(offset: number) {
		var text = this.data;
		var newText = text.substring(offset);
		text = text.substring(0, offset);
		this.data = text;
		this.length = text.length;
		var newNode = this.ownerDocument.createTextNode(newText);
		if (this.parentNode) {
			this.parentNode.insertBefore(newNode, this.nextSibling || null);
		}
		return newNode;
	}
}
