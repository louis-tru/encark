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

export enum Constants {
// Connections Flags
// Manually extracted from mysql-5.5.23/include/mysql_com.h
	CLIENT_LONG_PASSWORD     = 1, /* new more secure passwords */
	CLIENT_FOUND_ROWS        = 2, /* Found instead of affected rows */
	CLIENT_LONG_FLAG         = 4, /* Get all column flags */
	CLIENT_CONNECT_WITH_DB   = 8, /* One can specify db on connect */
	CLIENT_NO_SCHEMA         = 16, /* Don't allow database.table.column */
	CLIENT_COMPRESS          = 32, /* Can use compression protocol */
	CLIENT_ODBC              = 64, /* Odbc client */
	CLIENT_LOCAL_FILES       = 128, /* Can use LOAD DATA LOCAL */
	CLIENT_IGNORE_SPACE      = 256, /* Ignore spaces before '(' */
	CLIENT_PROTOCOL_41       = 512, /* New 4.1 protocol */
	CLIENT_INTERACTIVE       = 1024, /* This is an interactive client */
	CLIENT_SSL               = 2048, /* Switch to SSL after handshake */
	CLIENT_IGNORE_SIGPIPE    = 4096,    /* IGNORE sigpipes */
	CLIENT_TRANSACTIONS      = 8192, /* Client knows about transactions */
	CLIENT_RESERVED          = 16384,   /* Old flag for 4.1 protocol  */
	CLIENT_SECURE_CONNECTION = 32768,  /* New 4.1 authentication */

	CLIENT_MULTI_STATEMENTS = 65536, /* Enable/disable multi-stmt support */
	CLIENT_MULTI_RESULTS    = 131072, /* Enable/disable multi-results */
	CLIENT_PS_MULTI_RESULTS = 262144, /* Multi-results in PS-protocol */

	CLIENT_PLUGIN_AUTH = 524288, /* Client supports plugin authentication */

	CLIENT_SSL_VERIFY_SERVER_CERT = 1073741824,
	CLIENT_REMEMBER_OPTIONS       = 2147483648,

	// Commands
	COM_SLEEP = 0x00,
	COM_QUIT = 0x01,
	COM_INIT_DB = 0x02,
	COM_QUERY = 0x03,
	COM_FIELD_LIST = 0x04,
	COM_CREATE_DB = 0x05,
	COM_DROP_DB = 0x06,
	COM_REFRESH = 0x07,
	COM_SHUTDOWN = 0x08,
	COM_STATISTICS = 0x09,
	COM_PROCESS_INFO = 0x0a,
	COM_CONNECT = 0x0b,
	COM_PROCESS_KILL = 0x0c,
	COM_DEBUG = 0x0d,
	COM_PING = 0x0e,
	COM_TIME = 0x0f,
	COM_DELAYED_INSERT = 0x10,
	COM_CHANGE_USER = 0x11,
	COM_BINLOG_DUMP = 0x12,
	COM_TABLE_DUMP = 0x13,
	COM_CONNECT_OUT = 0x14,
	COM_REGISTER_SLAVE = 0x15,
	COM_STMT_PREPARE = 0x16,
	COM_STMT_EXECUTE = 0x17,
	COM_STMT_SEND_LONG_DATA = 0x18,
	COM_STMT_CLOSE = 0x19,
	COM_STMT_RESET = 0x1a,
	COM_SET_OPTION = 0x1b,
	COM_STMT_FETCH = 0x1c,
}

export default Constants;