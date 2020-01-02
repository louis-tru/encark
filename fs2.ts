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

import * as fs from './fs';
export * from './fs';

type PathLike = fs.PathLike;

export function readdir(dir: PathLike) {
	return new Promise<string[]>((resolve, reject)=>{
		fs.readdir(dir, (err, ls)=>{
			if (err)
				reject(err);
			else 
				resolve(ls);
		});
	});
}

export function rename(source: PathLike, target: PathLike) {
	return new Promise((resolve, reject)=>{
		fs.rename(source, target, (err)=>err ? reject(err): resolve());
	});
}

export function remove(path: PathLike): Promise<void> {
	return new Promise(function(resolve, reject) {
		fs.unlink(path, function(err) {
			if (err)
				reject(err)
			else
				resolve();
		});
	})
}

export interface RemoverResult extends Promise<void> {
	cancel(): void;
}

export function remover(path: string): RemoverResult {
	var p = <RemoverResult>new Promise((resolve, reject)=>{
		p.cancel = fs.remover(path, (err)=>err ? reject(err): resolve()).cancel;
	});
	return p;
}

export function exists(path: PathLike) {
	return new Promise<boolean>((resolve)=>{
		fs.exists(path, (ok)=>resolve(ok));
	});
}

export function mkdirp(path: string, mode?: fs.MkdirOptopns) {
	return new Promise<void>((resolve, reject)=>{
		fs.mkdirp(path, mode, (err)=>err ? reject(err): resolve());
	});
}
