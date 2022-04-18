#!/bin/sh

const fs = require('fs');

var pkg = JSON.parse(
	fs.readFileSync(`${__dirname}/package.json`, 'utf8')
);

const _buffer = `${__dirname}/out/${pkg.name}/_buffer.js`;

fs.writeFileSync(
	_buffer,
	fs.readFileSync(_buffer, 'utf8').replace(/Promise\.resolve\(\)\.then\(\(\)\s?=>\s?require\(\s*(['"][^'"]+['"])\s*\)\)/, `import($1)`)
);

delete pkg.scripts.prepare;

fs.writeFileSync(
	`${__dirname}/out/${pkg.name}/package.json`, JSON.stringify(pkg, null, 2),
);
