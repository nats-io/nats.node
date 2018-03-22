/*
 * Copyright 2013-2018 The NATS Authors
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/* jslint node: true */
'use strict';

import url = require('url');
import events = require('events');
import util = require('util');
import net = require('net');
import tls = require('tls');
import nuid = require('nuid');
import _ = require('lodash');
import {ConnectionOptions, SecureContextOptions, TlsOptions, TLSSocket} from "tls";
import {isNumber} from "util";
import Timer = NodeJS.Timer;

export const VERSION = '0.8.6';

export const BAD_AUTHENTICATION = 'BAD_AUTHENTICATION';
export const BAD_JSON = 'BAD_JSON';
export const BAD_MSG = 'BAD_MSG';
export const BAD_REPLY = 'BAD_REPLY';
export const BAD_SUBJECT = 'BAD_SUBJECT';
export const CLIENT_CERT_REQ = 'CLIENT_CERT_REQ';
export const CONN_CLOSED = 'CONN_CLOSED';
export const CONN_ERR = 'CONN_ERR';
export const INVALID_ENCODING = 'INVALID_ENCODING';
export const NATS_PROTOCOL_ERR = 'NATS_PROTOCOL_ERR';
export const NON_SECURE_CONN_REQ = 'NON_SECURE_CONN_REQ';
export const PERMISSIONS_ERR = "permissions violation";
export const REQ_TIMEOUT = 'REQ_TIMEOUT';
export const SECURE_CONN_REQ = 'SECURE_CONN_REQ';
export const STALE_CONNECTION_ERR = "stale connection";


/**
 * Constants
 */
const DEFAULT_PORT = 4222,
    DEFAULT_PRE = 'nats://localhost:',
    DEFAULT_URI = DEFAULT_PRE + DEFAULT_PORT,

    MAX_CONTROL_LINE_SIZE = 512,

    // Reconnect Parameters, 2 sec wait, 10 tries
    DEFAULT_RECONNECT_TIME_WAIT = 2 * 1000,
    DEFAULT_MAX_RECONNECT_ATTEMPTS = 10,

    // Ping interval
    DEFAULT_PING_INTERVAL = 2 * 60 * 1000, // 2 minutes
    DEFAULT_MAX_PING_OUT = 2,

    // Protocol
    //CONTROL_LINE = /^(.*)\r\n/, // TODO: remove / never used

    MSG = /^MSG\s+([^\s\r\n]+)\s+([^\s\r\n]+)\s+(([^\s\r\n]+)[^\S\r\n]+)?(\d+)\r\n/i,
    OK = /^\+OK\s*\r\n/i,
    ERR = /^-ERR\s+('.+')?\r\n/i,
    PING = /^PING\r\n/i,
    PONG = /^PONG\r\n/i,
    INFO = /^INFO\s+([^\r\n]+)\r\n/i,
    SUBRE = /^SUB\s+([^\r\n]+)\r\n/i,

    CR_LF = '\r\n',
    CR_LF_LEN = CR_LF.length,
    EMPTY = '',
    SPC = ' ',

    // Protocol
    //PUB     = 'PUB', // TODO: remove / never used
    SUB = 'SUB',
    UNSUB = 'UNSUB',
    CONNECT = 'CONNECT',

    // Responses
    PING_REQUEST = 'PING' + CR_LF,
    PONG_RESPONSE = 'PONG' + CR_LF,

    // Errors
    BAD_AUTHENTICATION_MSG = 'User and Token can not both be provided',
    BAD_JSON_MSG = 'Message should be a JSON object',
    BAD_MSG_MSG = 'Message can\'t be a function',
    BAD_REPLY_MSG = 'Reply can\'t be a function',
    BAD_SUBJECT_MSG = 'Subject must be supplied',
    CLIENT_CERT_REQ_MSG = 'Server requires a client certificate.',
    CONN_CLOSED_MSG = 'Connection closed',
    CONN_ERR_MSG_PREFIX = 'Could not connect to server: ',
    INVALID_ENCODING_MSG_PREFIX = 'Invalid Encoding:',
    NON_SECURE_CONN_REQ_MSG = 'Server does not support a secure connection.',
    REQ_TIMEOUT_MSG_PREFIX = 'The request timed out for subscription id: ',
    SECURE_CONN_REQ_MSG = 'Server requires a secure connection.',

    // Pedantic Mode support
    //Q_SUB = /^([^\.\*>\s]+|>$|\*)(\.([^\.\*>\s]+|>$|\*))*$/, // TODO: remove / never used
    //Q_SUB_NO_WC = /^([^\.\*>\s]+)(\.([^\.\*>\s]+))*$/, // TODO: remove / never used

    FLUSH_THRESHOLD = 65536;

// Parser state
enum ParserState {
    CLOSED = -1,
    AWAITING_CONTROL = 0,
    AWAITING_MSG_PAYLOAD = 1
}

export class NatsError implements Error {
    name: string;
    message: string;
    code: string;
    chainedError?: Error;

    /**
     * @param {String} message
     * @param {String} code
     * @param {Error} [chainedError]
     * @constructor
     *
     * @api private
     */
    constructor(message: string, code: string, chainedError?: Error) {
        Error.captureStackTrace(this, this.constructor);
        this.name = "NatsError";
        this.message = message;
        this.code = code;
        this.chainedError = chainedError;

        util.inherits(NatsError, Error);
    }
}

interface ServerInfo {
    tls_required: boolean;
    tls_verify: boolean;
    connect_urls?: string[];
}

class Server {
    url: url.Url;
    didConnect: boolean;
    reconnects: number;
    implicit: boolean;

    constructor(u: string, implicit = false) {
        this.url = url.parse(u);
        this.didConnect = false;
        this.reconnects = 0;
        this.implicit = implicit;
    }

    toString(): string {
        return this.url.href || "";
    }

    getCredentials(): string[] | undefined {
        if ('auth' in this.url && !!this.url.auth) {
            return this.url.auth.split(':');
        }
        return undefined;
    }
}

class Servers {
    servers: Server[];
    currentServer: Server;

    constructor(randomize: boolean, urls: string[], firstServer?: string) {
        this.servers = [] as Server[];
        if(urls) {
            urls.forEach(element => {
                this.servers.push(new Server(element));
            });
            if(randomize) {
                shuffle(this.servers);
            }
        }

        if(firstServer) {
            let index = urls.indexOf(firstServer);
            if(index === -1) {
                this.addServer(firstServer, false);
            } else {
                let fs = this.servers[index];
                this.servers.splice(index, 1);
                this.servers.unshift(fs);
            }
        } else {
            if(this.servers.length === 0) {
                this.addServer(DEFAULT_URI, false);
            }
        }
        this.currentServer = this.servers[0];
    }

    addServer(u: string, implicit = false) {
        this.servers.push(new Server(u, implicit));
    }

    selectServer(): Server | undefined {
        let t = this.servers.shift();
        if(t) {
            this.servers.push(this.currentServer);
            this.currentServer = t;
        }
        return t;
    }

    removeCurrentServer() {
        this.removeServer(this.currentServer);
    }

    removeServer(server: Server | undefined) {
        if(server) {
            let index = this.servers.indexOf(server);
            this.servers.splice(index, 1);
        }
    }

    length():number {
        return this.servers.length;
    }

    next() : Server | undefined {
        return this.servers.length ? this.servers[0] : undefined;
    }

    getServers(): Server[] {
        return this.servers;
    }


    processServerUpdate(info: ServerInfo): string[] {
        let newURLs = [];

        if(info.connect_urls && info.connect_urls.length > 0) {
            let discovered : {[key: string]: Server} = {};

            info.connect_urls.forEach(server => {
                let u = 'nats://' + server;
                let s = new Server(u, true);
                discovered[s.toString()] = s;
            });

            // remove implicit servers that are no longer reported
            let toDelete: number[] = [];
            this.servers.forEach((s, index) => {
                let u = s.toString();
                if(s.implicit && this.currentServer.url.href !== u && discovered[u] === undefined) {
                    // server was removed
                    toDelete.push(index);
                }
                // remove this entry from reported
                delete discovered[u];
            });

            // perform the deletion
            toDelete.reverse();
            toDelete.forEach(index => {
                this.servers.splice(index, 1);
            });

            // remaining servers are new
            for(let k in discovered) {
                if(discovered.hasOwnProperty(k)) {
                    this.servers.push(discovered[k]);
                    newURLs.push(k);
                }
            }
        }
        return newURLs;
    }
}

export interface NatsConnectionOptions {
    url: string;
    encoding?: BufferEncoding;
    json?: boolean;
    maxPingOut: number;
    maxReconnectAttempts: number;
    name?: string;
    noRandomize: boolean;
    pass?: string;
    pedantic?: boolean;
    pingInterval?: number;
    port?: number;
    preserveBuffers?: boolean;
    reconnect?: boolean;
    reconnectTimeWait?: number;
    servers?: Array<string>;
    tls?: boolean | tls.TlsOptions;
    token?: string;
    useOldRequestStyle?: boolean;
    user?: string;
    verbose?: boolean;
    waitOnFirstConnect?: boolean;
    yieldTime?: number;
}

function parseOptions(args?: string | number | NatsConnectionOptions | void): NatsConnectionOptions {
    if(args === undefined || args === null) {
        args = {url: DEFAULT_URI} as NatsConnectionOptions;
    }

    if(typeof args === 'number') {
        args = {url: DEFAULT_PRE + args} as NatsConnectionOptions;
    } else if(typeof args === 'string') {
        args = {url: args.toString()} as NatsConnectionOptions;
    } else if(typeof args === 'object') {
        if(args.port !== undefined) {
            args.url = DEFAULT_PRE + args.port;
        }
    }
    // override defaults with provided options.
    // non-standard aliases are not handled
    // FIXME: may need to add uri and pass
    // uri, password, urls, NoRandomize, dontRandomize, secure, client
    return _.extend(Client.defaultOptions(), args);
}

interface Payload {
    subj: string;
    sid: number;
    reply?:string;
    size: number;
    psize: number;
    chunks?: Buffer[];
    msg?:string|Buffer;
}

class Client extends events.EventEmitter {
    closed?: boolean;
    connected: boolean = false;
    currentServer!: Server;
    encoding?: BufferEncoding;
    inbound!: Buffer | null;
    info: ServerInfo = {} as ServerInfo;
    infoReceived: boolean = false;
    options: NatsConnectionOptions;
    pass?: string;
    payload?: Payload | null;
    pBufs: boolean = false;
    pending: any[] | null = [];
    pingTimer?: number;
    pongs: any[] | null = [];
    pout:number = 0;
    pSize: number = 0;
    pstate: ParserState = ParserState.CLOSED;
    reconnecting: boolean = false;
    reconnects: number = 0;
    servers: Servers;
    ssid: number = 1;
    stream!: net.Socket | TLSSocket | null;
    subs: {[key: number]: any} | null = {};
    token?: string;
    url!: url.UrlObject;
    user?: string;
    wasConnected: boolean = false;
    respmux?:RespMux;
    

    constructor(arg?: string | number | NatsConnectionOptions | void) {
        super();
        events.EventEmitter.call(this);

        this.options = parseOptions(arg);

        // Set user/pass/token as needed if in options.
        this.user = this.options.user;
        this.pass = this.options.pass;
        this.token = this.options.token;

        // Authentication - make sure authentication is valid.
        if (this.user && this.token) {
            throw (new NatsError(BAD_AUTHENTICATION_MSG, BAD_AUTHENTICATION));
        }

        // Encoding - make sure its valid.
        let bufEncoding = this.options.encoding as BufferEncoding;
        if (Buffer.isEncoding(bufEncoding)) {
            this.encoding = bufEncoding;
        } else {
            throw new NatsError(INVALID_ENCODING_MSG_PREFIX + this.options.encoding, INVALID_ENCODING);
        }

        this.servers = new Servers(!this.options.noRandomize, this.options.servers || [], this.options.url);
        this.initState();
        this.createConnection();
    }

    static defaultOptions() : ConnectionOptions {
        return {
            encoding: "utf8",
            maxPingOut: DEFAULT_MAX_PING_OUT,
            maxReconnectAttempts: DEFAULT_MAX_RECONNECT_ATTEMPTS,
            noRandomize: false,
            pedantic: false,
            pingInterval: DEFAULT_PING_INTERVAL,
            reconnect: true,
            reconnectTimeWait: DEFAULT_RECONNECT_TIME_WAIT,
            tls: false,
            useOldRequestStyle: false,
            verbose: false,
            waitOnFirstConnect: false
        } as ConnectionOptions
    }
}

interface Subscription {
    subject: string;
    callback: Function;
    received: number;
}

interface RequestConfiguration {
    token: string
    callback: Function;
    inbox: string;
    id: number;
    received: number;
    expected?: number;
    timeout?: Timer;
}

export interface SubscribeOptions {
    queue?: string;
    max?: number;
}

export interface RequestOptions {
    max?: number;
    timeout?: number;
}

class RespMux {
    client: Client;
    inbox: string;
    inboxPrefixLen: number;
    subscriptionID: number;
    requestMap: {[key: string]:RequestConfiguration} = {};
    nextID: number = -1;

    constructor(client: Client) {
        this.client = client;
        this.inbox = client.createInbox();
        this.inboxPrefixLen = this.inbox.length + 1;
        let ginbox = this.inbox + ".*";
        this.subscriptionID = client.subscribe(ginbox, (msg?: string | Buffer | object, reply: string, subject: string) => {
            let token = this.extractToken(subject);
            let conf = this.getMuxRequestConfig(token);
            if(conf) {
                if(conf.hasOwnProperty('expected')) {
                    conf.received++;
                    if (conf.expected !== undefined && conf.received >= conf.expected) {
                        this.cancelMuxRequest(token);
                    }
                }
                if(conf.callback) {
                    conf.callback(msg, reply);
                }
            }
        });
    }

    /**
     * Returns the mux request configuration
     * @param token
     * @returns Object
     */
    getMuxRequestConfig(token: string | number):RequestConfiguration {
        // if the token is a number, we have a fake sid, find the request
        if (typeof token === 'number') {
            let entry = null;
            for (let p in this.requestMap) {
                if (this.requestMap.hasOwnProperty(p)) {
                    let v = this.requestMap[p];
                    if (v.id === token) {
                        entry = v;
                        break;
                    }
                }
            }
            if (entry) {
                token = entry.token;
            }
        }
        return this.requestMap[token];
    }

    /**
     * Stores the request callback and other details
     *
     * @api private
     */
    initMuxRequestDetails(callback?: Function, expected?: number): RequestConfiguration {
        if(arguments.length === 1) {
            if(typeof callback === 'number') {
                expected = callback;
                callback = undefined;
            }
        }
        let token = nuid.next();
        let inbox = this.inbox + '.' + token;

        let conf = {token: token,
            callback: callback,
            inbox: inbox,
            id: this.nextID--,
            received: 0
        } as RequestConfiguration;
        if(expected !== undefined && expected > 0) {
            conf.expected = expected;
        }

        this.requestMap[token] = conf;
        return conf;
    };

    /**
     * Cancels the mux request
     *
     * @api private
     */
    cancelMuxRequest(token: string | number) {
        var conf = this.getMuxRequestConfig(token);
        if (conf) {
            if(conf.timeout) {
                clearTimeout(conf.timeout);
            }
            // the token could be sid, so use the one in the conf
            delete this.requestMap[conf.token];
        }
        return conf;
    };

    /**
     * Strips the prefix of the request reply to derive the token.
     * This is internal and only used by the new requestOne.
     *
     * @api private
     */
    extractToken(subject: string) {
        return subject.substr(this.inboxPrefixLen);
    }
}

interface ClientInternal {
    checkTLSMismatch() : boolean
    closeStream() : void
    connectCB() : void
    createConnection() : void
    createInbox() : string
    flushPending() : void
    initState() : void
    processErr(err: string) : void
    processInbound() : void
    processMsg(): void
    scheduleHeartbeat() : void
    scheduleReconnect() : void
    selectServer() : void
    sendCommand(cmd : string | Buffer) : void
    sendConnect() : void
    sendSubscriptions(): void
    setupHandlers() : void
    stripPendingSubs() : void
    initMuxRequestDetails(callback: Function, expected: number): void
    createResponseMux():void
}

interface Client extends ClientInternal {
    close() : void

    flush(opt_callback?: Function) : void

    publish(callback: Function):void;
    publish(subject: string, callback: Function):void;
    publish(subject: string, msg: string | Buffer | object, callback: Function):void;
    publish(subject: string, msg?: string | Buffer | object, reply?: string, callback?: Function):void;

    subscribe(subject: string, callback: Function): number;
    subscribe(subject: string, opts?: SubscribeOptions, callback: Function): number;

    unsubscribe(sid: number, max?: number):void;

    timeout(sid: number, timeout: number, expected: number, callback: Function):void

    request(subject: string, opt_msg?: string |Buffer  |object, opt_options?: RequestOptions, callback?: Function): void
}

/**
 * Create a properly formatted inbox subject.
 *
 * @api public
 */
var createInbox = exports.createInbox = function() {
    return ("_INBOX." + nuid.next());
};

/**
 * Connect to a nats-server and return the client.
 * Argument can be a url, or an object with a 'url'
 * property and additional options.
 *
 * @params {Mixed} [opts]
 *
 * @api public
 */
exports.connect = function(opts?: NatsConnectionOptions) {
    return new Client(opts);
};


/**
 * Allow createInbox to be called on a client.
 *
 * @api public
 */
Client.prototype.createInbox = createInbox;


function shuffle(array: object[]) {
    for (let i = array.length - 1; i > 0; i--) {
        let j = Math.floor(Math.random() * (i + 1));
        let temp = array[i];
        array[i] = array[j];
        array[j] = temp;
    }
    return array;
}


/**
 * Properly select the next server.
 * We rotate the server list as we go,
 * we also pull auth from urls as needed, or
 * if they were set in options use that as override.
 *
 * @api private
 */
Client.prototype.selectServer = function() {
    let server = this.servers.selectServer();
    if(server === undefined) {
        return;
    }

    // Place in client context.
    this.currentServer = server;
    this.url = server.url;
    let auth = server.getCredentials();
    if(auth) {
        if (auth.length !== 1) {
            if (this.options.user === undefined) {
                this.user = auth[0];
            }
            if (this.options.pass === undefined) {
                this.pass = auth[1];
            }
        } else if (this.options.token === undefined) {
            this.token = auth[0];
        }
    }
};

/**
 * Check for TLS configuration mismatch.
 *
 * @api private
 */
Client.prototype.checkTLSMismatch = function() {
    if (this.info.tls_required === true &&
        this.options.tls === false) {
        this.emit('error', new NatsError(SECURE_CONN_REQ_MSG, SECURE_CONN_REQ));
        this.closeStream();
        return true;
    }

    if (this.info.tls_required === false &&
        this.options.tls !== false) {
        this.emit('error', new NatsError(NON_SECURE_CONN_REQ_MSG, NON_SECURE_CONN_REQ));
        this.closeStream();
        return true;
    }


    let cert = false;
    if(this.options.tls && typeof this.options.tls === 'object') {
        cert = this.options.tls.cert != null;
    }
    if (this.info.tls_verify === true && !cert) {
        this.emit('error', new NatsError(CLIENT_CERT_REQ_MSG, CLIENT_CERT_REQ));
        this.closeStream();
        return true;
    }
    return false;
};

/**
 * Callback for first flush/connect.
 *
 * @api private
 */
Client.prototype.connectCB = function() {
    var event = this.reconnecting ? 'reconnect' : 'connect';
    this.reconnecting = false;
    this.reconnects = 0;
    this.wasConnected = true;
    if(this.currentServer) {
        this.currentServer.didConnect = true;
    }
    this.emit(event, this);
    this.flushPending();
};


Client.prototype.scheduleHeartbeat = function() {
    this.pingTimer = setTimeout(function(client: Client) {
        client.emit('pingtimer');
        if (client.closed) {
            return;
        }
        // we could be waiting on the socket to connect
        if (client.stream && !client.stream.connecting) {
            client.emit('pingcount', client.pout);
            client.pout++;
            if (client.pout > client.options.maxPingOut) {
                // processErr will scheduleReconnect
                client.processErr(STALE_CONNECTION_ERR);
                // don't reschedule, new connection initiated
                return;
            } else {
                // send the ping
                client.sendCommand(PING_REQUEST);
                if (client.pongs) {
                    // no callback
                    client.pongs.push(undefined);
                }

            }
        }
        // reschedule
        client.scheduleHeartbeat();
    }, this.options.pingInterval, this);
};

/**
 * Properly setup a stream event handlers.
 *
 * @api private
 */
Client.prototype.setupHandlers = function() {
    var client = this;
    var stream = client.stream;

    if (stream === null) {
        return;
    }

    stream.on('connect', function() {
        if (client.pingTimer) {
            clearTimeout(client.pingTimer);
            delete client.pingTimer;
        }
        client.connected = true;
        client.scheduleHeartbeat();
    });

    stream.on('close', function(hadError) {
        client.closeStream();
        client.emit('disconnect');
        if (client.closed === true ||
            client.options.reconnect === false ||
            ((client.reconnects >= client.options.maxReconnectAttempts) && client.options.maxReconnectAttempts !== -1)) {
            client.emit('close');
        } else {
            client.scheduleReconnect();
        }
    });

    stream.on('error', function(exception) {
        // If we were connected just return, close event will process
        if (client.wasConnected === true && client.currentServer.didConnect === true) {
            return;
        }

        // if the current server did not connect at all, and we in
        // general have not connected to any server, remove it from
        // this list. Unless overidden
        if (client.wasConnected === false && client.currentServer.didConnect === false) {
            // We can override this behavior with waitOnFirstConnect, which will
            // treat it like a reconnect scenario.
            if (client.options.waitOnFirstConnect) {
                // Pretend to move us into a reconnect state.
                client.currentServer.didConnect = true;
            } else {
                client.servers.removeCurrentServer();
            }
        }

        // Only bubble up error if we never had connected
        // to the server and we only have one.
        if (client.wasConnected === false && client.servers.length() === 0) {
            client.emit('error', new NatsError(CONN_ERR_MSG_PREFIX + exception, CONN_ERR, exception));
        }
        client.closeStream();
    });

    stream.on('data', function(data) {
        // If inbound exists, concat them together. We try to avoid this for split
        // messages, so this should only really happen for a split control line.
        // Long term answer is hand rolled parser and not regexp.
        if (client.inbound) {
            client.inbound = Buffer.concat([client.inbound, data]);
        } else {
            client.inbound = data;
        }

        // Process the inbound queue.
        client.processInbound();
    });
};

/**
 * Send the connect command. This needs to happen after receiving the first
 * INFO message and after TLS is established if necessary.
 *
 * @api private
 */
Client.prototype.sendConnect = function() {
    // Queue the connect command.
    let cs : {[key: string]: any} = {
        'lang': 'node',
        'version': VERSION,
        'verbose': this.options.verbose,
        'pedantic': this.options.pedantic,
        'protocol': 1
    };
    if (this.user !== undefined) {
        cs.user = this.user;
        cs.pass = this.pass;
    }
    if (this.token !== undefined) {
        cs.auth_token = this.token;
    }
    if (this.options.name !== undefined) {
        cs.name = this.options.name;
    }
    // If we enqueued requests before we received INFO from the server, or we
    // reconnected, there be other data pending, write this immediately instead
    // of adding it to the queue.
    if(this.stream !== null) {
        this.stream.write(CONNECT + SPC + JSON.stringify(cs) + CR_LF);
    }
};

/**
 * Properly setup a stream connection with proper events.
 *
 * @api private
 */
Client.prototype.createConnection = function() {
    // Commands may have been queued during reconnect. Discard everything except:
    // 1) ping requests with a pong callback
    // 2) publish requests
    //
    // Rationale: CONNECT and SUBs are written directly upon connecting, any PONG
    // response is no longer relevant, and any UNSUB will be accounted for when we
    // sync our SUBs. Without this, users of the client may miss state transitions
    // via callbacks, would have to track the client's internal connection state,
    // and may have to double buffer messages (which we are already doing) if they
    // wanted to ensure their messages reach the server.
    let pong = [] as string[];
    let pend = [] as (string & Buffer)[];
    let pSize = 0;
    let client = this;
    if (client.pending !== null) {
        let pongIndex = 0;
        client.pending.forEach(cmd => {
            let cmdLen = Buffer.isBuffer(cmd) ? cmd.length : Buffer.byteLength(cmd);
            if (cmd === PING_REQUEST && client.pongs !== null && pongIndex < client.pongs.length) {
                // filter out any useless ping requests (no pong callback, nop flush)
                let p = client.pongs[pongIndex++];
                if (p !== undefined) {
                    pend.push(cmd);
                    pSize += cmdLen;
                    pong.push(p);
                }
            } else if (cmd.length > 3 && cmd[0] === 'P' && cmd[1] === 'U' && cmd[2] === 'B') {
                pend.push(cmd);
                pSize += cmdLen;
            }
        });
    }
    this.pongs = pong;
    this.pending = pend;
    this.pSize = pSize;

    this.pstate = ParserState.AWAITING_CONTROL;

    // Clear info processing.
    this.info = {} as ServerInfo;
    this.infoReceived = false;

    // Select a server to connect to.
    this.selectServer();
    // See #45 if we have a stream release the listeners
    // otherwise in addition to the leak events will fire fire
    if (this.stream) {
        this.stream.removeAllListeners();
        this.stream.end();
    }
    // Create the stream
    if(this.url && this.url.hostname && this.url.port) {
        // ts compiler requires this to be a number
        let port = isNumber(this.url.port) ? this.url.port : parseInt(this.url.port, 10);
        this.stream = net.createConnection(port, this.url.hostname);
        // Setup the proper handlers.
        this.setupHandlers();
    }
};

/**
 * Initialize client state.
 *
 * @api private
 */
Client.prototype.initState = function() {
    this.pending = [];
    this.pout = 0;
};

/**
 * Close the connection to the server.
 *
 * @api public
 */
Client.prototype.close = function() {
    if(this.pingTimer) {
        clearTimeout(this.pingTimer);
        delete this.pingTimer;
    }
    this.closed = true;
    this.removeAllListeners();
    this.closeStream();
    this.ssid = -1;
    this.subs = null;
    this.pstate = ParserState.CLOSED;
    this.pongs = null;
    this.pending = null;
    this.pSize = 0;
};

/**
 * Close down the stream and clear state.
 *
 * @api private
 */
Client.prototype.closeStream = function() {
    if (this.stream !== null) {
        this.stream.end();
        this.stream.destroy();
        this.stream = null;
    }
    if (this.connected === true || this.closed === true) {
        this.pongs = null;
        this.pout = 0;
        this.pending = null;
        this.pSize = 0;
        this.connected = false;
    }
    this.inbound = null;
};

/**
 * Flush all pending data to the server.
 *
 * @api private
 */
Client.prototype.flushPending = function():void {
    if (this.connected === false ||
        this.pending === null ||
        this.pending.length === 0 ||
        this.infoReceived !== true ||
        this.stream === null) {
        return;
    }

    let client = this;
    let write = function(data: string | Buffer):void {
        if(! client.stream) {
            return;
        }
        client.pending = [];
        client.pSize = 0;
        client.stream.write(data);
    };

    if (!this.pBufs) {
        // All strings, fastest for now.
            write(this.pending.join(EMPTY));
            return
    } else {
        if(this.pending) {
            // We have some or all Buffers. Figure out if we can optimize.
            let allBuffs = true;
            for (let i = 0; i < this.pending.length; i++) {
                if (!Buffer.isBuffer(this.pending[i])) {
                    allBuffs = false;
                    break;
                }
            }

            // If all buffers, concat together and write once.
            if (allBuffs) {
                return write(Buffer.concat(this.pending, this.pSize));
            } else {
                // We have a mix, so write each one individually.
                let pending = this.pending;
                this.pending = [];
                this.pSize = 0;
                for (let i = 0; i < pending.length; i++) {
                    this.stream.write(pending[i]);
                }
                return;
            }
        }
    }
};

/**
 * Strips all SUBS commands from pending during initial connection completed since
 * we send the subscriptions as a separate operation.
 *
 * @api private
 */
Client.prototype.stripPendingSubs = function() {
    if(!this.pending) {
        return;
    }
    var pending = this.pending;
    this.pending = [];
    this.pSize = 0;
    for (var i = 0; i < pending.length; i++) {
        if (!SUBRE.test(pending[i])) {
            // Re-queue the command.
            this.sendCommand(pending[i]);
        }
    }
};

/**
 * Send commands to the server or queue them up if connection pending.
 *
 * @api private
 */
Client.prototype.sendCommand = function(cmd) {
    // Buffer to cut down on system calls, increase throughput.
    // When receive gets faster, should make this Buffer based..

    if (this.closed || this.pending === null) {
        return;
    }

    this.pending.push(cmd);
    if (!Buffer.isBuffer(cmd)) {
        this.pSize += Buffer.byteLength(cmd);
    } else {
        this.pSize += cmd.length;
        this.pBufs = true;
    }

    if (this.connected === true) {
        // First one let's setup flush..
        if (this.pending.length === 1) {
            var self = this;
            setImmediate(function() {
                self.flushPending();
            });
        } else if (this.pSize > FLUSH_THRESHOLD) {
            // Flush in place when threshold reached..
            this.flushPending();
        }
    }
};

/**
 * Sends existing subscriptions to new server after reconnect.
 *
 * @api private
 */
Client.prototype.sendSubscriptions = function():void {
    if(!this.subs || !this.stream) {
        return;
    }

    let protocols = "";
    for (let sid in this.subs) {
        if (this.subs.hasOwnProperty(sid)) {
            let sub = this.subs[sid];
            if (sub.qgroup) {
                protocols += [SUB, sub.subject, sub.qgroup, sid + CR_LF].join(SPC);
            } else {
                protocols += [SUB, sub.subject, sid + CR_LF].join(SPC);
            }
        }
    }
    if (protocols.length > 0) {
        this.stream.write(protocols);
    }
};

/**
 * Process the inbound data queue.
 *
 * @api private
 */
Client.prototype.processInbound = function() {
    let client = this;

    // Hold any regex matches.
    let m;

    // For optional yield
    let start;

    if (!client.stream) {
        // if we are here, the stream was reaped and errors raised
        // if we continue.
        return;
    }
    // unpause if needed.
    // FIXME(dlc) client.stream.isPaused() causes 0.10 to fail
    client.stream.resume();

    /* jshint -W083 */

    if (client.options.yieldTime !== undefined) {
        start = Date.now();
    }

    while (!client.closed && client.inbound && client.inbound.length > 0) {
        switch (client.pstate) {

            case ParserState.AWAITING_CONTROL:
                // Regex only works on strings, so convert once to be more efficient.
                // Long term answer is a hand rolled parser, not regex.
                var buf = client.inbound.toString('binary', 0, MAX_CONTROL_LINE_SIZE);
                if ((m = MSG.exec(buf)) !== null) {
                    client.payload = {
                        subj: m[1],
                        sid: parseInt(m[2], 10),
                        reply: m[4],
                        size: parseInt(m[5], 10)
                    } as Payload;
                    client.payload.psize = client.payload.size + CR_LF_LEN;
                    client.pstate = ParserState.AWAITING_MSG_PAYLOAD;
                } else if ((m = OK.exec(buf)) !== null) {
                    // Ignore for now..
                } else if ((m = ERR.exec(buf)) !== null) {
                    client.processErr(m[1]);
                    return;
                } else if ((m = PONG.exec(buf)) !== null) {
                    client.pout = 0;
                    var cb = client.pongs && client.pongs.shift();
                    if (cb) {
                        cb();
                    } // FIXME: Should we check for exceptions?
                } else if ((m = PING.exec(buf)) !== null) {
                    client.sendCommand(PONG_RESPONSE);
                } else if ((m = INFO.exec(buf)) !== null) {
                    client.info = JSON.parse(m[1]);
                    // Check on TLS mismatch.
                    if (client.checkTLSMismatch() === true) {
                        return;
                    }

                    // Always try to read the connect_urls from info
                    let newServers = client.servers.processServerUpdate(client.info);
                    if(newServers.length > 0) {
                        client.emit('serversDiscovered', newServers);
                    }

                    // Process first INFO
                    if (client.infoReceived === false) {
                        // Switch over to TLS as needed.

                        // are we a tls socket?
                        let encrypted = false;
                        if(client.stream instanceof TLSSocket) {
                            encrypted = client.stream.encrypted;
                        }

                        if (client.options.tls !== false && encrypted !== true) {
                            let tlsOpts;
                            if ('object' === typeof client.options.tls) {
                                tlsOpts = client.options.tls as ConnectionOptions
                            } else {
                                tlsOpts = {} as ConnectionOptions
                            }
                            tlsOpts.socket = client.stream;

                            // if we have a stream, this is from an old connection, reap it
                            if (client.stream) {
                                client.stream.removeAllListeners();
                                client.stream.end();
                            }
                            client.stream = tls.connect(tlsOpts, function() {
                                client.flushPending();
                            });
                            client.setupHandlers();
                        }

                        // Send the connect message and subscriptions immediately
                        client.sendConnect();
                        client.sendSubscriptions();

                        client.pongs = client.pongs || [];
                        client.pongs.unshift(function() {
                            client.connectCB();
                        });
                        client.stream.write(PING_REQUEST);

                        // Mark as received
                        client.infoReceived = true;
                        client.stripPendingSubs();
                        client.flushPending();
                    }
                } else {
                    // FIXME, check line length for something weird.
                    // Nothing here yet, return
                    return;
                }
                break;

            case ParserState.AWAITING_MSG_PAYLOAD:
                if(! client.payload) {
                    break;
                }

                // If we do not have the complete message, hold onto the chunks
                // and assemble when we have all we need. This optimizes for
                // when we parse a large buffer down to a small number of bytes,
                // then we receive a large chunk. This avoids a big copy with a
                // simple concat above.
                if (client.inbound.length < client.payload.psize) {
                    if (undefined === client.payload.chunks) {
                        client.payload.chunks = [];
                    }
                    client.payload.chunks.push(client.inbound);
                    client.payload.psize -= client.inbound.length;
                    client.inbound = null;
                    return;
                }

                // If we are here we have the complete message.
                // Check to see if we have existing chunks
                if (client.payload.chunks) {

                    client.payload.chunks.push(client.inbound.slice(0, client.payload.psize));
                    // don't append trailing control characters
                    var mbuf = Buffer.concat(client.payload.chunks, client.payload.size);

                    if (client.options.preserveBuffers) {
                        client.payload.msg = mbuf;
                    } else {
                        client.payload.msg = mbuf.toString(client.encoding);
                    }

                } else {

                    if (client.options.preserveBuffers) {
                        client.payload.msg = client.inbound.slice(0, client.payload.size);
                    } else {
                        client.payload.msg = client.inbound.toString(client.encoding, 0, client.payload.size);
                    }

                }

                // Eat the size of the inbound that represents the message.
                if (client.inbound.length === client.payload.psize) {
                    client.inbound = null;
                } else {
                    client.inbound = client.inbound.slice(client.payload.psize);
                }

                // process the message
                client.processMsg();

                // Reset
                client.pstate = ParserState.AWAITING_CONTROL;
                client.payload = null;

                // Check to see if we have an option to yield for other events after yieldTime.
                if (start !== undefined && client.options && client.options.yieldTime) {
                    if ((Date.now() - start) > client.options.yieldTime) {
                        client.stream.pause();
                        setImmediate(client.processInbound.bind(this));
                        return;
                    }
                }
                break;
        }

        // This is applicable for a regex match to eat the bytes we used from a control line.
        if (m && !this.closed && client.inbound) {
            // Chop inbound
            let psize = m[0].length;
            if (psize >= client.inbound.length) {
                client.inbound = null;
            } else {
                client.inbound = client.inbound.slice(psize);
            }
        }
        m = null;
    }
};


/**
 * Process a delivered message and deliver to appropriate subscriber.
 *
 * @api private
 */
Client.prototype.processMsg = function() {
    if(!this.subs || !this.payload) {
        return;
    }
    let sub = this.subs[this.payload.sid];
    if(!sub) {
        return;
    }
    sub.received += 1;
    // Check for a timeout, and cancel if received >= expected
    if (sub.timeout) {
        if (sub.received >= sub.expected) {
            clearTimeout(sub.timeout);
            sub.timeout = null;
        }
    }
    // Check for auto-unsubscribe
    if (sub.max !== undefined) {
        if (sub.received === sub.max) {
            delete this.subs[this.payload.sid];
            this.emit('unsubscribe', this.payload.sid, sub.subject);
        } else if (sub.received > sub.max) {
            this.unsubscribe(this.payload.sid);
            sub.callback = null;
        }
    }

    if (sub.callback) {
        let msg = this.payload.msg;
        if (this.options.json && msg) {
            if(msg instanceof Buffer) {
                msg = msg.toString(this.options.encoding);
            }
            try {
                msg = JSON.parse(msg);
            } catch (e) {
                msg = e;
            }
        }
        sub.callback(msg, this.payload.reply, this.payload.subj, this.payload.sid);
    }
};

/**
 * ProcessErr processes any error messages from the server
 *
 * @api private
 */
Client.prototype.processErr = function(s) {
    // current NATS clients, will raise an error and close on any errors
    // except stale connection and permission errors
    var m = s ? s.toLowerCase() : '';
    if (m.indexOf(STALE_CONNECTION_ERR) !== -1) {
        // closeStream() triggers a reconnect if allowed
        this.closeStream();
    } else if (m.indexOf(PERMISSIONS_ERR) !== -1) {
        this.emit('permission_error', new NatsError(s, NATS_PROTOCOL_ERR));
    } else {
        this.emit('error', new NatsError(s, NATS_PROTOCOL_ERR));
        this.closeStream();
    }
};


/**
 * Flush outbound queue to server and call optional callback when server has processed
 * all data.
 *
 * @param {Function} [opt_callback]
 * @api public
 */
Client.prototype.flush = function(opt_callback) {
    if (this.closed) {
        if (typeof opt_callback === 'function') {
            opt_callback(new NatsError(CONN_CLOSED_MSG, CONN_CLOSED));
            return;
        } else {
            throw (new NatsError(CONN_CLOSED_MSG, CONN_CLOSED));
        }
    }
    if (this.pongs) {
        this.pongs.push(opt_callback);
        this.sendCommand(PING_REQUEST);
        this.flushPending();
    }
};

/**
 * Publish a message to the given subject, with optional reply and callback.
 *
 * @param {String} subject
 * @param {String} [msg]
 * @param {String} [opt_reply]
 * @param {Function} [opt_callback]
 * @api public
 */
Client.prototype.publish = function(subject: string, msg: string|Buffer, opt_reply: string, opt_callback: Function):void {
    // They only supplied a callback function.
    if (typeof subject === 'function') {
        opt_callback = subject;
        subject = "";
    }
    if (!msg) {
        msg = EMPTY;
    }
    if (!subject) {
        if (opt_callback) {
            opt_callback(new NatsError(BAD_SUBJECT_MSG, BAD_SUBJECT));
        } else {
            throw (new NatsError(BAD_SUBJECT_MSG, BAD_SUBJECT));
        }
    }
    if (typeof msg === 'function') {
        if (opt_callback || opt_reply) {
            opt_callback(new NatsError(BAD_MSG_MSG, BAD_MSG));
            return;
        }
        opt_callback = msg;
        msg = EMPTY;
        opt_reply = "";
    }
    if (typeof opt_reply === 'function') {
        if (opt_callback) {
            opt_callback(new NatsError(BAD_REPLY_MSG, BAD_REPLY));
            return;
        }
        opt_callback = opt_reply;
        opt_reply = "";
    }

    // Hold PUB SUB [REPLY]
    let psub;
    if (opt_reply === undefined) {
        psub = 'PUB ' + subject + SPC;
    } else {
        psub = 'PUB ' + subject + SPC + opt_reply + SPC;
    }

    // Need to treat sending buffers different.
    if (!Buffer.isBuffer(msg)) {
        let str = msg;
        if (this.options.json) {
            if (typeof msg !== 'object') {
                throw (new NatsError(BAD_JSON_MSG, BAD_JSON));
            }
            try {
                str = JSON.stringify(msg);
            } catch (e) {
                throw (new NatsError(BAD_JSON_MSG, BAD_JSON));
            }
        }
        this.sendCommand(psub + Buffer.byteLength(str) + CR_LF + str + CR_LF);
    } else {
        let b = new Buffer(psub.length + msg.length + (2 * CR_LF_LEN) + msg.length.toString().length);
        let len = b.write(psub + msg.length + CR_LF);
        msg.copy(b, len);
        b.write(CR_LF, len + msg.length);
        this.sendCommand(b);
    }

    if (opt_callback !== undefined) {
        this.flush(opt_callback);
    } else if (this.closed) {
        throw (new NatsError(CONN_CLOSED_MSG, CONN_CLOSED));
    }
};

/**
 * Subscribe to a given subject, with optional options and callback. opts can be
 * ommitted, even with a callback. The Subscriber Id is returned.
 *
 * @param {String} subject
 * @param {Object} [opts]
 * @param {Function} callback
 * @return {Number}
 * @api public
 */
Client.prototype.subscribe = function(subject: string, opts: SubscribeOptions, callback: Function):number {
    if (this.closed) {
        throw (new NatsError(CONN_CLOSED_MSG, CONN_CLOSED));
    }
    let qgroup, max;
    if (typeof opts === 'function') {
        callback = opts;
        opts = {} as SubscribeOptions;
    } else if (opts && typeof opts === 'object') {
        // FIXME, check exists, error otherwise..
        qgroup = opts.queue;
        max = opts.max;
    }

    this.subs = this.subs || [];
    this.ssid += 1;
    this.subs[this.ssid] = {
        subject: subject,
        callback: callback,
        received: 0
    };

    let proto;
    if (typeof qgroup === 'string') {
        this.subs[this.ssid].qgroup = qgroup;
        proto = [SUB, subject, qgroup, this.ssid + CR_LF];
    } else {
        proto = [SUB, subject, this.ssid + CR_LF];
    }

    this.sendCommand(proto.join(SPC));
    this.emit('subscribe', this.ssid, subject, opts);

    if (max) {
        this.unsubscribe(this.ssid, max);
    }
    return this.ssid;
};

/**
 * Unsubscribe to a given Subscriber Id, with optional max parameter.
 * Unsubscribing to a subscription that already yielded the specified number of messages
 * will clear any pending timeout callbacks.
 *
 * @param {Number} sid
 * @param {Number} [opt_max]
 * @api public
 */
Client.prototype.unsubscribe = function(sid, opt_max) {
    if (!sid || this.closed) {
        return;
    }

    // in the case of new muxRequest, it is possible they want perform
    // an unsubscribe with the returned 'sid'. Intercept that and clear
    // the request configuration. Mux requests are always negative numbers
    if(sid < 0) {
        if(this.respmux) {
            this.respmux.cancelMuxRequest(sid);
        }
        return;
    }

    var proto;
    if (opt_max) {
        proto = [UNSUB, sid, opt_max + CR_LF];
    } else {
        proto = [UNSUB, sid + CR_LF];
    }
    this.sendCommand(proto.join(SPC));

    this.subs = this.subs || [];
    let sub = this.subs[sid];
    if (sub === undefined) {
        return;
    }
    sub.max = opt_max;
    if (sub.max === undefined || (sub.received >= sub.max)) {
        // remove any timeouts that may be pending
        if (sub.timeout) {
            clearTimeout(sub.timeout);
            sub.timeout = null;
        }
        delete this.subs[sid];
        this.emit('unsubscribe', sid, sub.subject);
    }
};

/**
 * Set a timeout on a subscription. The subscription is cancelled if the
 * expected number of messages is reached or the timeout is reached.
 * If this function is called with an SID from a multiplexed
 * request call, the original timeout handler associated with the multiplexed
 * request is replaced with the one provided to this function.
 *
 * @param {Number} sid
 * @param {Number} timeout
 * @param {Number} expected
 * @param {Function} callback
 * @api public
 */
Client.prototype.timeout = function(sid: number, timeout: number, expected: number, callback: Function):void {
    if (!sid) {
        return;
    }
    let sub = null;
    // check the sid is not a mux sid - which is always negative
    if(sid < 0) {
        if(this.respmux) {
            let conf = this.respmux.getMuxRequestConfig(sid);
            if (conf && conf.timeout) {
                // clear auto-set timeout
                clearTimeout(conf.timeout);
            }
            sub = conf;
        }
    } else if(this.subs) {
        sub = this.subs[sid];
    }

    if(sub) {
        sub.expected = expected;
        sub.timeout = setTimeout(()=> {
            callback(sid);
            // if callback fails unsubscribe will leak
            this.unsubscribe(sid);
        }, timeout);
    }
};


/**
 * Publish a message with an implicit inbox listener as the reply. Message is optional.
 * This should be treated as a subscription. You can optionally indicate how many
 * messages you only want to receive using opt_options = {max:N}. Otherwise you
 * will need to unsubscribe to stop the message stream.
 *
 * You can also optionally specify the number of milliseconds to wait for the messages
 * to receive using opt_options = {timeout: N}. When the number of messages specified
 * is received before a timeout, the subscription auto-cancels. If the number of messages
 * is not specified, it is the responsibility of the client to unsubscribe to prevent
 * a timeout.
 *
 * The Subscriber Id is returned.
 *
 * @param {String} subject
 * @param {String} [opt_msg]
 * @param {Object} [opt_options]
 * @param {Function} [callback]
 * @return {Number}
 * @api public
 */
Client.prototype.request = function(subject: string, opt_msg: string | Buffer | object, opt_options?: RequestOptions, callback?: Function): number {
    if(this.options.useOldRequestStyle) {
        return this.oldRequest(subject, opt_msg, opt_options, callback);
    }
    if (typeof opt_msg === 'function') {
        callback = opt_msg;
        opt_msg = EMPTY;
        opt_options = undefined;
    }
    if (typeof opt_options === 'function') {
        callback = opt_options;
        opt_options = undefined;
    }

    if(!this.respmux) {
        this.respmux = new RespMux(this);
    }

    opt_options = opt_options || {};
    let conf = this.respmux.initMuxRequestDetails(callback, opt_options.max);
    this.publish(subject, opt_msg, conf.inbox);

    if(opt_options.timeout) {
        conf.timeout = setTimeout(() => {
            if(conf.callback) {
                conf.callback(new NatsError(REQ_TIMEOUT_MSG_PREFIX + conf.id, REQ_TIMEOUT));
            }
            if(this.respmux) {
                this.respmux.cancelMuxRequest(conf.token);
            }
        }, opt_options.timeout);
    }

    return conf.id;
};


/**
 * @deprecated
 * @api private
 */
Client.prototype.oldRequest = function(subject: string, opt_msg?: string | Buffer | object, opt_options?: RequestOptions, callback: Function): number {
    if (typeof opt_msg === 'function') {
        callback = opt_msg;
        opt_msg = EMPTY;
        opt_options = undefined;
    }
    if (typeof opt_options === 'function') {
        callback = opt_options;
        opt_options = undefined;
    }
    var inbox = createInbox();
    var s = this.subscribe(inbox, opt_options, function(msg, reply) {
        callback(msg, reply);
    });
    this.publish(subject, opt_msg, inbox);
    return s;
};

/**
 * Publish a message with an implicit inbox listener as the reply. Message is optional.
 * This should be treated as a subscription. The subscription is auto-cancelled after the
 * first reply is received or the timeout in millisecond is reached.
 *
 * If a timeout is reached, the callback is invoked with a NatsError with it's code set to
 * `REQ_TIMEOUT` on the first argument of the callback function, and the subscription is
 * cancelled.
 *
 * The Subscriber Id is returned.
 *
 * @param {String} subject
 * @param {String} [opt_msg]
 * @param {Object} [opt_options]
 * @param {Number} timeout
 * @param {Function} callback - can be called with message or NatsError if the request timed out.
 * @return {Number}
 * @api public
 */
Client.prototype.requestOne = function(subject, opt_msg, opt_options, timeout, callback) {
    if(this.options.useOldRequestStyle) {
        return this.oldRequestOne(subject, opt_msg, opt_options, timeout, callback);
    }

    if (typeof opt_msg === 'number') {
        callback = opt_options;
        timeout = opt_msg;
        opt_options = null;
        opt_msg = EMPTY;
    }

    if (typeof opt_options === 'number') {
        callback = timeout;
        timeout = opt_options;
        opt_options = null;
    }

    opt_options = opt_options || {};
    opt_options.max = 1;
    opt_options.timeout = timeout;

    return this.request(subject, opt_msg, opt_options, callback);
};


/**
 * @api private
 */
Client.prototype.createResponseMux = function():string {
    if(!this.respmux) {
        this.respmux = new RespMux(this);
    }
    return this.respmux.inbox;
};


/**
 * @deprecated
 * @api private
 */
Client.prototype.oldRequestOne = function(subject, opt_msg, opt_options, timeout, callback) {
    if (typeof opt_msg === 'number') {
        callback = opt_options;
        timeout = opt_msg;
        opt_options = null;
        opt_msg = EMPTY;
    }

    if (typeof opt_options === 'number') {
        callback = timeout;
        timeout = opt_options;
        opt_options = null;
    }

    opt_options = opt_options || {};
    opt_options.max = 1;

    var sid = this.request(subject, opt_msg, opt_options, callback);
    this.timeout(sid, timeout, 1, function() {
        callback(new NatsError(REQ_TIMEOUT_MSG_PREFIX + sid, REQ_TIMEOUT));
    });
    return sid;
};

/**
 * Report number of outstanding subscriptions on this connection.
 *
 * @return {Number}
 * @api public
 */
Client.prototype.numSubscriptions = function() {
    return Object.keys(this.subs).length;
};

/**
 * Reconnect to the server.
 *
 * @api private
 */
Client.prototype.reconnect = function() {
    if (this.closed) {
        return;
    }
    this.reconnects += 1;
    this.createConnection();
    if (this.currentServer.didConnect === true) {
        this.emit('reconnecting');
    }
};

/**
 * Setup a timer event to attempt reconnect.
 *
 * @api private
 */
Client.prototype.scheduleReconnect = function() {
    var client = this;
    // Just return if no more servers
    if (client.servers.length() === 0) {
        return;
    }
    // Don't set reconnecting state if we are just trying
    // for the first time.
    if (client.wasConnected === true) {
        client.reconnecting = true;
    }
    // Only stall if we have connected before.
    var wait = 0;
    if (client.servers.next().didConnect === true) {
        wait = this.options.reconnectTimeWait;
    }
    setTimeout(function() {
        client.reconnect();
    }, wait);
};
