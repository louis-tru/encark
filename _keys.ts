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

interface Item {
	indent: number;
	content: string;
	key?: string;
	value?: any;
}

/**
 * 解析行缩进
 */
function parse_indent(self: Parser, code: string): Item {

	var indent = 0;
	var space = 0;

	for (var i = 0; i < code.length; i++) {
		var char = code[i];

		if (char == ' ') {
			space++;
		}
		else if (char == '\t') {
			indent++;
		}
		else {
			break;
		}
	}

	// 使用2空格缩进
	if (space % 2 !== 0) {
		throw error(self, 'Keys data indent error');
	}

	return { indent: indent + space / 2, content: code.substr(i) };
}

// 读取一行代码
function read_line_code(self: Parser): string | null {
	if (self.input.length > self.index) {
		var code = self.input[self.index];
		self.index++;
		return code;
	}
	return null;
}

// 解析接续多行值
function parse_continuous(self: Parser, str: string): string { // str,
	if (str[str.length - 1] == '\\'){ // 连续的
		var ls = [str.substr(0, str.length - 1)];

		while(true) {
			str = read_line_code(self) as string;
			if (str) {
				if (str[str.length - 1] == '\\') {
					ls.push(str.substr(0, str.length - 1));
				} else {
					ls.push(str);
					break;
				}
			} else {
				break;
			}
		}
		return ls.join('');
	}
	return str;
}

type Value = string | number | boolean | null;

function parse_string_to_values(str: string): Value[] {
	return str.split(/[\s\t]+/).map(function (value) {
		var mat = value.match(/^((-?\d+(\.\d+)?((e|E)\d+)?)|(true)|(false)|(null))$/);
		if (mat)
			return mat[2] ? parseFloat(value) : mat[6] ? true : mat[7] ? false : null;
		return value;
	});
}

// 分割普通值
function parse_and_split_value(value: string): Value[] {

	var ls: Value[] = []; // 结果
	var prev_end = 0;
	var index = 0;
	var c;

	// 处理字符串引号
	while (true) {
		var i;
		if ((i = value.indexOf("'", index)) != -1) {        // ' 查找字符串引号开始
			c = "'";
		} else if ((i = value.indexOf('"', index)) != -1) { // " 开始
			c = '"';
		} else { // 没找着字符串引号的开始
			break;
		}
		index = i;

		if (index === 0 ||
				value[index - 1] == ' ' ||
				value[index - 1] == '\t') { // 是否真的开始了

			if (prev_end != index) {
				var s = value.substring(prev_end, index).trim();
				if (s) {
					ls = ls.concat(parse_string_to_values(s));
				}
			}

			index++;

			var end = index;
			var str = [];

			// 查找结束
			while ((end = value.indexOf(c, end)) != -1) {
				if (value[end - 1] == '\\') { // 字符转义
					str.push(value.substring(index, end - 1) + c);
					end += 1; // 继续找
					index = end;
				} else {    // 不是转义,字符串引号结束
					ls.push(value.substring(index, end));
					index = prev_end = end + 1; // 设置上一个结束的位置
					break;
				}
			}

			if (end == -1) { // 没找着'|",结束
				ls.push(value.substr(index));
				prev_end = value.length;
				break;
			}
		} else {
			index++; // 在下一个位置继续查找
		}
	}

	if (prev_end === 0) {
		ls = parse_string_to_values(value);
	}
	else if (prev_end != value.length) {
		var s = value.substr(prev_end).trim();
		if (s) {
			ls = ls.concat( parse_string_to_values( s ) );
		}
	}

	return ls;
}

// 解析多行数组
function parse_multi_row_array(self: Parser, indent: number): Value[] {
	var ls: Value[] = [];
	var code = read_line_code(self);
	while(code !== null){
		if(/^[\s\t]*@end[\s\t]*$/.test(code)){ // 查询结束关键字
			// 开始缩进与结束缩进必需相同,否则异常
			if (parse_indent(self, code).indent == indent) {
				return ls;
			}
			else{
				throw error(self, '@end desc data indent error');
			}
		}
		ls.push(parse_continuous(self, code));
		code = read_line_code(self); // 继续查询end
	}
	return ls;
}

// 读取一对普通 key/value
function read_key_value_item(self: Parser) {
	var code;

	while (true) {
		code = read_line_code(self);
		if (code === null) {
			return null;
		}
		else if(code) {
			if(code.trim() !== ''){
				break;
			}
		}
	}

	var item = parse_indent(self, code);
	var content = item.content;
	var mat = content.match(/\@?[^\s\@,:]+|,/); // 查询key

	if (!mat) {
		throw error(self, 'Key Illegal characters');
	}

	var key = mat[0];
	var value: any = '';

	if (key.length < content.length) {
		var char = content[key.length]; //content.substr(key.length, 1);

		//console.log(`----------${char}`, key, key.length);

		switch (char) {
			case ':':
				// 多行描叙数组,所以这一行后面不能在出现非空格的字符
				// TODO : 后面可以随意写无需遵循缩进格式,直到文档结束或遇到@end
				if(/[^\s\t]/.test(content.substr(key.length + 1))){ // 查询非空格字符
					throw error(self, 'Parse multi row array Illegal characters');
				}
				value = parse_multi_row_array(self, item.indent); // 解析多行数组
				break;
			case ' ':
			case '\t':
				value = content.substr(key.length + 1).trim();
				if (value) {
					value = parse_and_split_value(
						parse_continuous(self, value) // 解析连续的字符
					); // 解析分割普通值
					if (value.length == 1) {
						value = value[0];
					}
				}
				break;
			default:
				throw error(self, 'Key Illegal characters');
		}
	}

	item.key = key;
	item.value = value;

	return item;
}

function error(self: Parser, message: string) {
	var err = new Error(message + ', row: ' + (self.index));
	err.row = self.index - 1;
	return err;
}

/**
 * push data
 */
function push_data(self: Parser, data: any, key: string, value: any): void {
	if (data instanceof Array) {
		data.push(value);
	} else {
		if ( data.hasOwnProperty(key) )
			throw error(self, 'Key repeated');
		data[key] = value;
	}
}

/**
 * keys 解析器
 * @class Parser
 */
class Parser {
	index: number;
	input: string[];

	constructor(str: string) {
		this.index = 0;
		this.input = 	str.replace(/\#.*$/mg, '') 		// 删除注释
									.split(/\r?\n/);					//
	}

	parse(): any {
		var item = read_key_value_item(this);
		if (!item)
			return { };
	
		var output = item.key == ',' ? [] : {}; // 数组或key/value
		var stack = [output];
	
		while (true) {
			var {indent, key, value} = item;
	
			var data = stack[indent];
			if (!data) {
				throw error(this, 'Keys data indent error'); // 缩进只能为两个空格或tab
			}
			stack.splice(indent + 1); // 出栈
	
			var next = read_key_value_item(this);
			if (next) {
				if(next.indent == stack.length){ // 子对像
	
					if (value === '') { // 如果有子对像,这个值必需为 ''
						value = next.key == ',' ? [ ] : { };
						stack.push(value); // 压栈
					} else {
						throw error(this, 'Keys data indent error');
					}
				}
				push_data(this, data, <string>key, value);
				item = next;
			} else {
				push_data(this, data, <string>key, value);
				break; // 已经没有更多key/value,结束
			}
		}
		return output;
	}
}

export default function(str: string): any {
	return new Parser(str).parse();
}
