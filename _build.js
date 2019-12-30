#!/bin/sh

const fs = require('fs');

var pkg = JSON.parse(
	fs.readFileSync(__dirname + '/package.json', 'utf8')
);

pkg.types = 'util.d.ts';

fs.writeFileSync(
	__dirname + '/out/nxkit/package.json',
	JSON.stringify(pkg, null, 2)
);