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

import utils from './util';
import * as fs from './fs';
export * from './fs';

type PathLike = fs.PathLike;

export function readdir(dir: PathLike) {
	return new Promise<string[]>((resolve, reject)=>{
		fs.readdir(dir, (err, ls)=>err? reject(err): resolve(ls));
	});
}

export function rename(source: PathLike, target: PathLike) {
	return new Promise<void>(function(resolve, reject) {
		fs.rename(source, target, (err)=>err ? reject(err): resolve());
	});
}

export function remove(path: PathLike): Promise<void> {
	return new Promise(function(resolve, reject) {
		fs.unlink(path, (err)=>err? reject(err): resolve());
	})
}

export interface RemoverResult extends Promise<void> {
	cancel(): void;
}

export function remover(path: string) {
	return utils.promise(function(resolve, reject, promise) {
		(promise as RemoverResult).cancel = fs.remover(path, (err)=>err ? reject(err): resolve()).cancel;
	}) as RemoverResult;
}

export function exists(path: PathLike) {
	return new Promise<boolean>((resolve)=>fs.exists(path, resolve));
}

export function readFile(path: PathLike | number, options?: { flag?: string; } | null) {
	return new Promise<Buffer>(function(resolve, reject) {
		fs.readFile(path, options, (e,b)=>e ? reject(e): resolve(b));
	});
}

export function writeFile(path: PathLike | number, data: any, options?: fs.WriteFileOptions) {
	return new Promise<void>(function(resolve, reject) {
		fs.writeFile(path, data, options || {}, e=>e ? reject(e): resolve());
	});
}

export function mkdirp(path: string, mode?: fs.MkdirOptopns) {
	return new Promise<void>(function(resolve, reject) {
		fs.mkdirp(path, mode, (err)=>err ? reject(err): resolve());
	});
}

export function stat(path: PathLike): Promise<fs.Stats> {
	return new Promise(function(resolve, reject) {
		fs.stat(path, (err, stat)=>(err ? reject(err): resolve(stat)));
	});
}