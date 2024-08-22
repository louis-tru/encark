#!/bin/sh

const fs = require('fs');

var pkg = JSON.parse(
	fs.readFileSync(`${__dirname}/package.json`, 'utf8')
);

const _buffer = `${__dirname}/out/${pkg.name}/_buffer.js`;
const _util = `${__dirname}/out/${pkg.name}/_util.d.ts`;

fs.writeFileSync(
	_buffer,
	fs.readFileSync(_buffer, 'utf8').replace(/Promise\.resolve\(\)\.then\(\(\)\s?=>\s?require\(\s*(['"][^'"]+['"])\s*\)\)/, `import($1)`)
);

fs.writeFileSync(
	_util,
	"import './_ext';\n" + fs.readFileSync(_util, 'utf8')
);

delete pkg.scripts.prepare;

fs.writeFileSync(
	`${__dirname}/out/${pkg.name}/package.json`, JSON.stringify(pkg, null, 2),
);
