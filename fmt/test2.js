
var server = require('../server');
var fmt = require('.');

var s = new server.Server({port: 8092, printLog: true});
s.start(); // start server

new fmt.FastMessageTransferCenter(s, [ ], 'fnode://127.0.0.1:8092/');
