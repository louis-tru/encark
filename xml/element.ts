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

import {Node, NodeList, NODE_TYPE, LiveNodeList, Attribute} from './node';
import * as doc from './document';
import * as parser from './parser';
import {NamedNodeMap} from './named_node_map';

// NamedNodeMap

export function visitNode(node: Node, callback: (node: Node)=>boolean): boolean {
	if (!callback(node))
		return false;

	var next = node.firstChild;
	if (next) {
		if (!visitNode(next, callback))
			return false;
	}
	if (next = node.nextSibling)
		return visitNode(next, callback);
	return true;
}

export class Element extends Node {

	readonly nodeType = NODE_TYPE.ELEMENT_NODE;
	readonly childNodes = new NodeList();
	readonly tagName: string;
	readonly attributes: NamedNodeMap;

	get nodeName() {
		return this.tagName;
	}

	constructor(doc: doc.Document, tagName: string) {
		super(doc);
		this.attributes = new NamedNodeMap(this);
		this.tagName = tagName;
	}

	hasAttribute(name: string) {
		return this.getAttributeNode(name) != null;
	}
	
	getAttribute(name: string) {
		var attr = this.getAttributeNode(name);
		return attr && attr.value || '';
	}

	setAttribute(name: string, value: string) {
		var attr = this.ownerDocument.createAttribute(name);
		attr.value = attr.nodeValue = value + '';
		this.setAttributeNode(attr);
	}

	getAttributeNode(name: string) {
		return this.attributes.getNamedItem(name);
	}

	setAttributeNode(newAttr: Attribute) {
		this.attributes.setNamedItem(newAttr);
	}

	removeAttributeNode(oldAttr: string) {
		this.attributes._removeItem(oldAttr);
	}

	removeAttribute(name: string) {
		var attr = this.getAttributeNode(name);
		attr && this.removeAttributeNode(attr);
	}

	hasAttributeNS(namespaceURI: string, localName: string) {
		return this.getAttributeNodeNS(namespaceURI, localName) != null;
	}

	getAttributeNS(namespaceURI: string, localName: string) {
		var attr = this.getAttributeNodeNS(namespaceURI, localName);
		return attr && attr.value || '';
	}

	setAttributeNS(namespaceURI: string, qualifiedName: string, value: string) {
		var attr = this.ownerDocument.createAttributeNS(namespaceURI, qualifiedName);
		attr.value = attr.nodeValue = value + '';
		this.setAttributeNode(attr);
	}

	getAttributeNodeNS(namespaceURI: string, localName: string) {
		return this.attributes.getNamedItemNS(namespaceURI, localName);
	}

	setAttributeNodeNS(newAttr: string) {
		this.attributes.setNamedItemNS(newAttr);
	}

	removeAttributeNS(namespaceURI: string, localName: string) {
		var attr = this.getAttributeNodeNS(namespaceURI, localName);
		attr && this.removeAttributeNode(attr);
	}

	getElementsByTagName(name: string) {
		return new LiveNodeList(this, function (node: Node) {
			var ls: Element[] = [];
			visitNode(node, function (node) {
				if (node.nodeType == NODE_TYPE.ELEMENT_NODE && (<Element>node).tagName == name)
					ls.push(<Element>node);
				return true;
			});
			return ls;
		});
	}

	getElementsByTagNameNS(namespaceURI: string, localName: string) {
		return new LiveNodeList(this, function (node: Node) {
			var ls: Element[] = [];
			visitNode(node, function (node) {
				if (node.nodeType == NODE_TYPE.ELEMENT_NODE && 
				node.namespaceURI == namespaceURI && 
				node.localName == localName)
					ls.push(<Element>node);
				return true;
			});
			return ls;
		});
	}

	get innerXml () {
		return Array.toArray(this.childNodes).join('');
	}

	set innerXml (xml) {
		this.removeAllChild();
		if(xml){
			new parser.Parser().fragment(this.ownerDocument, this, xml);
		}
	}

}
