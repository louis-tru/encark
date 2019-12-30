
import server from '../server';
import * as fmt from '.';

var s = new server.Server({port: 8094, printLog: true});
s.start(); // start server

new fmt.FastMessageTransferCenter(s, [ 'fnode://127.0.0.1:8091/' ], 'fnode://127.0.0.1:8094/');
