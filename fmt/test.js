
var server = require('../server');
var fmt = require('.');

var error = console.error;

console.error = function(...args) {
	error(...args);
}

var server_1 = 8091;
var server_2 = 8092;
var server_3 = 8093;

var s_1 = new server.Server({port: server_1, printLog: true});
s_1.start(); // start server

var s_2 = new server.Server({port: server_2, printLog: true});
s_2.start(); // start server

var s_3 = new server.Server({port: server_3, printLog: true});
s_3.start(); // start server

new fmt.FastMessageTransferCenter(s_1, [ 'fnode://127.0.0.1:8092/', 'fnode://127.0.0.1:8093/' ], 'fnode://127.0.0.1:8091/');
new fmt.FastMessageTransferCenter(s_2, [ 'fnode://127.0.0.1:8091/', 'fnode://127.0.0.1:8093/' ], 'fnode://127.0.0.1:8092/');
new fmt.FastMessageTransferCenter(s_3, [ 'fnode://127.0.0.1:8091/', 'fnode://127.0.0.1:8092/' ], 'fnode://127.0.0.1:8093/');
