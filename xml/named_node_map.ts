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
	* Objects implementing the NamedNodeMap interface are used to 
	* represent collections of nodes that can be accessed by name. 
	* Note that NamedNodeMap does not inherit from NodeList; 
	* NamedNodeMaps are not maintained in any particular order. 
	* Objects contained in an object implementing NamedNodeMap 
	* may also be accessed by an ordinal index, but this is simply to 
	* allow convenient enumeration of the contents of a NamedNodeMap, 
	* and does not imply that the DOM specifies an order to these Nodes.
	* NamedNodeMap objects in the DOM are live.
	* used for attributes or DocumentType entities
	*
	*/

import exception, { Exception } from './exception';
import {NodeList, Attribute} from './node';
import * as el from './element';

export class NamedNodeMap extends NodeList {
	readonly ownerElement: el.Element;

	constructor(owner: el.Element) {
		super();
		this.ownerElement = owner;
	}

	getNamedItem(key: string) {
		var i = this.length;
		while (i--) {
			var node = <Attribute>((<any>this)[i]);
			if (node.nodeName == key)
				return node;
		}
		return null;
	}
	
	setNamedItem(node: Attribute) {
		var old = this.getNamedItem(node.nodeName);
		return this._add(node, old);
	}

	/* returns Node */
	setNamedItemNS(node: Attribute) {
		// raises: WRONG_DOCUMENT_ERR,NO_MODIFICATION_ALLOWED_ERR,INUSE_ATTRIBUTE_ERR
		var old = this.getNamedItemNS(node.namespaceURI || '', node.localName || '');
		return this._add(node, old);
	}

	private _findNodeIndex(node: Attribute): number {
		var i = this.length;
		while (i--) {
			if ((<any>this)[i] === node) return i;
		}
		return -1;
	}
	
	private _add(node: Attribute, old: Attribute | null) {
		var self = this;
		if (old) {
			(<any>self)[this._findNodeIndex(old)] = node;
		} else {
			(<any>self)[(<any>self)._length++] = node;
		}
		var el = self.ownerElement;
		var doc = el && el.ownerDocument;
		if (doc)
			node.ownerElement = el;
	
		return old || null;
	}
	
	removeItem(node: Attribute) {
		var i = this.length;
		var lastIndex = i - 1;
		while (i--) {
			var c = (<any>this)[i];
			if (node === c) {
				var old = c;
				while (i < lastIndex) {
					(<any>this)[i] = (<any>this)[++i];
				}
				this._length = lastIndex;
				node.ownerElement = null;
				return old;
			}
		}
	}

	/* returns Node */
	removeNamedItem(key: string) {
		var node = this.getNamedItem(key);
		if (node) {
			this.removeItem(node);
		} else {
			throw new Exception(exception.NOT_FOUND_ERR);
		}
	} // raises: NOT_FOUND_ERR,NO_MODIFICATION_ALLOWED_ERR

	//for level2
	getNamedItemNS(namespaceURI: string, localName: string) {
		var i = this.length;
		while (i--) {
			var node: Attribute = (<any>this)[i];
			if (node.localName == localName && node.namespaceURI == namespaceURI) {
				return node;
			}
		}
		return null;
	}

	removeNamedItemNS(namespaceURI: string, localName: string) {
		var node = this.getNamedItemNS(namespaceURI, localName);
		if (node) {
			this.removeItem(node);
		} else {
			throw new Exception(exception.NOT_FOUND_ERR);
		}
	}
}
