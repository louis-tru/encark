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

var charsets = require('./charsets');
var errors = require('./errors');

// Connections Flags
// Manually extracted from mysql-5.5.23/include/mysql_com.h
exports.CLIENT_LONG_PASSWORD     = 1; /* new more secure passwords */
exports.CLIENT_FOUND_ROWS        = 2; /* Found instead of affected rows */
exports.CLIENT_LONG_FLAG         = 4; /* Get all column flags */
exports.CLIENT_CONNECT_WITH_DB   = 8; /* One can specify db on connect */
exports.CLIENT_NO_SCHEMA         = 16; /* Don't allow database.table.column */
exports.CLIENT_COMPRESS          = 32; /* Can use compression protocol */
exports.CLIENT_ODBC              = 64; /* Odbc client */
exports.CLIENT_LOCAL_FILES       = 128; /* Can use LOAD DATA LOCAL */
exports.CLIENT_IGNORE_SPACE      = 256; /* Ignore spaces before '(' */
exports.CLIENT_PROTOCOL_41       = 512; /* New 4.1 protocol */
exports.CLIENT_INTERACTIVE       = 1024; /* This is an interactive client */
exports.CLIENT_SSL               = 2048; /* Switch to SSL after handshake */
exports.CLIENT_IGNORE_SIGPIPE    = 4096;    /* IGNORE sigpipes */
exports.CLIENT_TRANSACTIONS      = 8192; /* Client knows about transactions */
exports.CLIENT_RESERVED          = 16384;   /* Old flag for 4.1 protocol  */
exports.CLIENT_SECURE_CONNECTION = 32768;  /* New 4.1 authentication */

exports.CLIENT_MULTI_STATEMENTS = 65536; /* Enable/disable multi-stmt support */
exports.CLIENT_MULTI_RESULTS    = 131072; /* Enable/disable multi-results */
exports.CLIENT_PS_MULTI_RESULTS = 262144; /* Multi-results in PS-protocol */

exports.CLIENT_PLUGIN_AUTH = 524288; /* Client supports plugin authentication */

exports.CLIENT_SSL_VERIFY_SERVER_CERT = 1073741824;
exports.CLIENT_REMEMBER_OPTIONS       = 2147483648;

// Commands
exports.COM_SLEEP = 0x00;
exports.COM_QUIT = 0x01;
exports.COM_INIT_DB = 0x02;
exports.COM_QUERY = 0x03;
exports.COM_FIELD_LIST = 0x04;
exports.COM_CREATE_DB = 0x05;
exports.COM_DROP_DB = 0x06;
exports.COM_REFRESH = 0x07;
exports.COM_SHUTDOWN = 0x08;
exports.COM_STATISTICS = 0x09;
exports.COM_PROCESS_INFO = 0x0a;
exports.COM_CONNECT = 0x0b;
exports.COM_PROCESS_KILL = 0x0c;
exports.COM_DEBUG = 0x0d;
exports.COM_PING = 0x0e;
exports.COM_TIME = 0x0f;
exports.COM_DELAYED_INSERT = 0x10;
exports.COM_CHANGE_USER = 0x11;
exports.COM_BINLOG_DUMP = 0x12;
exports.COM_TABLE_DUMP = 0x13;
exports.COM_CONNECT_OUT = 0x14;
exports.COM_REGISTER_SLAVE = 0x15;
exports.COM_STMT_PREPARE = 0x16;
exports.COM_STMT_EXECUTE = 0x17;
exports.COM_STMT_SEND_LONG_DATA = 0x18;
exports.COM_STMT_CLOSE = 0x19;
exports.COM_STMT_RESET = 0x1a;
exports.COM_SET_OPTION = 0x1b;
exports.COM_STMT_FETCH = 0x1c;

Object.assign(exports, charsets, errors);
