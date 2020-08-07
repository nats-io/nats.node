/*
 * Copyright 2013-2020 The NATS Authors
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

/* eslint no-sync: 0 */

'use strict'

/**
 * Module Dependencies
 */
const net = require('net')
const tls = require('tls')
const util = require('util')
const events = require('events')
const nuid = require('nuid')
const nkeys = require('ts-nkeys')
const fs = require('fs')
const url = require('url')

/**
 * Constants
 */
const VERSION = require('../package.json').version

const DEFAULT_PORT = 4222
const DEFAULT_PRE = 'nats://localhost:'
const DEFAULT_URI = DEFAULT_PRE + DEFAULT_PORT

const MAX_CONTROL_LINE_SIZE = 4096

// Parser state
const AWAITING_CONTROL = 0
const AWAITING_MSG_PAYLOAD = 1

// Reconnect Parameters, 2 sec wait, 10 tries
const DEFAULT_RECONNECT_TIME_WAIT = 2 * 1000
const DEFAULT_MAX_RECONNECT_ATTEMPTS = 10
const DEFAULT_RECONNECT_JITTER = 100
const DEFAULT_RECONNECT_JITTER_TLS = 1000

// Ping interval
const DEFAULT_PING_INTERVAL = 2 * 60 * 1000 // 2 minutes
const DEFAULT_MAX_PING_OUT = 2

// Protocol
const MSG = /^MSG\s+([^\s\r\n]+)\s+([^\s\r\n]+)\s+(([^\s\r\n]+)[^\S\r\n]+)?(\d+)\r\n/i
const OK = /^\+OK\s*\r\n/i
const ERR = /^-ERR\s+('.+')?\r\n/i
const PING = /^PING\r\n/i
const PONG = /^PONG\r\n/i
const INFO = /^INFO\s+([^\r\n]+)\r\n/i
const SUBRE = /^SUB\s+([^\r\n]+)\r\n/i
const CREDS = /\s*(?:(?:[-]{3,}[^\n]*[-]{3,}\n)(.+)(?:\n\s*[-]{3,}[^\n]*[-]{3,}\n))/i

const CR_LF = '\r\n'
const CR_LF_LEN = CR_LF.length
const EMPTY = ''
const SPC = ' '

// Protocol
const SUB = 'SUB'
const UNSUB = 'UNSUB'
const CONNECT = 'CONNECT'

// Responses
const PING_REQUEST = 'PING' + CR_LF
const PONG_RESPONSE = 'PONG' + CR_LF

// Errors
const BAD_AUTHENTICATION = 'BAD_AUTHENTICATION'
const BAD_CALLBACK = 'BAD_CALLBACK'
const BAD_CREDS = 'BAD_CREDENTIALS'
const BAD_JSON = 'BAD_JSON'
const BAD_MSG = 'BAD_MSG'
const BAD_OPTIONS = 'BAD_OPTIONS'
const BAD_REPLY = 'BAD_REPLY'
const BAD_SUBJECT = 'BAD_SUBJECT'
const BAD_TIMEOUT = 'BAD_TIMEOUT'
const CLIENT_CERT_REQ = 'CLIENT_CERT_REQ'
const CONN_CLOSED = 'CONN_CLOSED'
const CONN_DRAINING = 'CONN_DRAINING'
const CONN_ERR = 'CONN_ERR'
const CONN_TIMEOUT = 'CONN_TIMEOUT'
const DISCONNECT_ERR = 'DISCONNECT'
const INVALID_ENCODING = 'INVALID_ENCODING'
const NATS_PROTOCOL_ERR = 'NATS_PROTOCOL_ERR'
const NKEY_OR_JWT_REQ = 'NKEY_OR_JWT_REQ'
const NO_ECHO_NOT_SUPPORTED = 'NO_ECHO_NOT_SUPPORTED'
const NO_SEED_IN_CREDS = 'NO_SEED_IN_CREDS'
const NO_USER_JWT_IN_CREDS = 'NO_USER_JWT_IN_CREDS'
const NON_SECURE_CONN_REQ = 'NON_SECURE_CONN_REQ'
const OPENSSL_ERR = 'OPENSSL_ERR'
const PERMISSIONS_ERR = 'permissions violation'
const REQ_TIMEOUT = 'REQ_TIMEOUT'
const SECURE_CONN_REQ = 'SECURE_CONN_REQ'
const SIGCB_NOTFUNC = 'SIG_NOT_FUNC'
const SIGNATURE_REQUIRED = 'SIG_REQ'
const STALE_CONNECTION_ERR = 'stale connection'
const SUB_DRAINING = 'SUB_DRAINING'

const BAD_AUTHENTICATION_MSG = 'User and Token can not both be provided'
const BAD_AUTHENTICATION_TH_FAILED_MSG_PREFIX = 'tokenHandler call failed: '
const BAD_AUTHENTICATION_TH_NOT_FUNC_MSG = 'tokenHandler must be a function returning a token'
const BAD_AUTHENTICATION_T_AND_TH_MSG = 'token and tokenHandler cannot both be provided'
const BAD_CALLBACK_MSG = 'Bad callback'
const BAD_CREDS_MSG = 'Bad user credentials'
const BAD_JSON_MSG = 'Message should be a non-circular JSON-serializable value'
const BAD_MSG_MSG = 'Message can\'t be a function'
const BAD_OPTIONS_MSG = 'Options should be an object.'
const BAD_REPLY_MSG = 'Reply can\'t be a function'
const BAD_SUBJECT_MSG = 'Subject must be supplied'
const BAD_TIMEOUT_MSG = 'Timeout should be a number'
const CLIENT_CERT_REQ_MSG = 'Server requires a client certificate.'
const CONN_CLOSED_MSG = 'Connection closed'
const CONN_DRAINING_MSG = 'Connection draining'
const CONN_ERR_MSG_PREFIX = 'Could not connect to server: '
const CONN_TIMEOUT_MSG = 'Connection timeout'
const DISCONNECT_MSG = 'Client disconnected, flush was reset'
const INVALID_ENCODING_MSG_PREFIX = 'Invalid Encoding:'
const NKEY_OR_JWT_REQ_MSG = 'An Nkey or User JWT callback needs to be defined.'
const NON_SECURE_CONN_REQ_MSG = 'Server does not support a secure connection.'
const NO_ECHO_NOT_SUPPORTED_MSG = 'echo is not supported'
const NO_SEED_IN_CREDS_MSG = 'Can not locate signing key in credentials'
const NO_USER_JWT_IN_CREDS_MSG = 'Can not locate user jwt in credentials.'
const OPENSSL_ERR_MSG_PREFIX = 'TLS credentials verification failed: '
const REQ_TIMEOUT_MSG_PREFIX = 'The request timed out for subscription id: '
const SECURE_CONN_REQ_MSG = 'Server requires a secure connection.'
const SIGCB_NOTFUNC_MSG = 'Signature callback is not a function.'
const SIGNATURE_REQUIRED_MSG = 'Server requires an Nkey signature.'
const SUB_DRAINING_MSG = 'Subscription draining'

const FLUSH_THRESHOLD = 65536

/**
 * @param {String} message
 * @param {String} code
 * @param {Error} [chainedError]
 * @constructor
 *
 * @api private
 */
function NatsError (message, code, chainedError) {
  Error.captureStackTrace(this, this.constructor)
  this.name = this.constructor.name
  this.message = message
  this.code = code
  // noinspection JSUnusedGlobalSymbols
  this.chainedError = chainedError
}

util.inherits(NatsError, Error)
exports.NatsError = NatsError

/**
 * Library Version
 */
exports.version = VERSION

/**
 * Error codes
 */
exports.BAD_AUTHENTICATION = BAD_AUTHENTICATION
exports.BAD_CALLBACK = BAD_CALLBACK
exports.BAD_CREDS = BAD_CREDS
exports.BAD_JSON = BAD_JSON
exports.BAD_MSG = BAD_MSG
exports.BAD_OPTIONS = BAD_OPTIONS
exports.BAD_REPLY = BAD_REPLY
exports.BAD_SUBJECT = BAD_SUBJECT
exports.BAD_TIMEOUT = BAD_TIMEOUT
exports.CLIENT_CERT_REQ = CLIENT_CERT_REQ
exports.CONN_CLOSED = CONN_CLOSED
exports.CONN_DRAINING = CONN_DRAINING
exports.CONN_ERR = CONN_ERR
exports.CONN_TIMEOUT = CONN_TIMEOUT
exports.INVALID_ENCODING = INVALID_ENCODING
exports.NATS_PROTOCOL_ERR = NATS_PROTOCOL_ERR
exports.NKEY_OR_JWT_REQ = NKEY_OR_JWT_REQ
exports.NON_SECURE_CONN_REQ = NON_SECURE_CONN_REQ
exports.NO_ECHO_NOT_SUPPORTED = NO_ECHO_NOT_SUPPORTED
exports.NO_SEED_IN_CREDS = NO_SEED_IN_CREDS
exports.NO_USER_JWT_IN_CREDS = NO_USER_JWT_IN_CREDS
exports.OPENSSL_ERR = OPENSSL_ERR
exports.PERMISSIONS_ERR = PERMISSIONS_ERR
exports.REQ_TIMEOUT = REQ_TIMEOUT
exports.SECURE_CONN_REQ = SECURE_CONN_REQ
exports.SIGCB_NOTFUNC = SIGCB_NOTFUNC
exports.SIGNATURE_REQUIRED = SIGNATURE_REQUIRED
exports.STALE_CONNECTION_ERR = STALE_CONNECTION_ERR
exports.SUB_DRAINING = SUB_DRAINING

/**
 * Create a properly formatted inbox subject.
 *
 * @api public
 */
const createInbox = exports.createInbox = function () {
  return ('_INBOX.' + nuid.next())
}

/**
 * Initialize a client with the appropriate options.
 *
 * @param {Object} [opts]
 * @api public
 */
function Client (opts) {
  events.EventEmitter.call(this)
  this.parseOptions(opts)
  this.initState()
  // Select a server to connect to.
  this.selectServer()
  this.createConnection()
}

/**
 * Connect to a nats-server and return the client.
 * Argument can be a url, or an object with a 'url'
 * property and additional options.
 *
 * @params {Mixed} [url] - Url, port, or options object
 * @params {Object} [opts] - Options
 * @api public
 */
exports.connect = function (url, opts) {
  // If we receive one parameter, parser will
  // figure out intent. If we provided opts, then
  // first parameter should be url, and second an
  // options object.
  if (opts !== undefined) {
    if (typeof opts !== 'object') {
      throw new NatsError(BAD_OPTIONS_MSG, BAD_OPTIONS)
    }
    opts.url = sanitizeUrl(url)
  } else {
    opts = url
  }
  return new Client(opts)
}

/**
 * Connected clients are event emitters.
 */
util.inherits(Client, events.EventEmitter)

/**
 * Allow createInbox to be called on a client.
 *
 * @api public
 */
Client.prototype.createInbox = createInbox

Client.prototype.assignOption = function (opts, prop, assign) {
  if (assign === undefined) {
    assign = prop
  }
  if (opts[prop] !== undefined) {
    this.options[assign] = opts[prop]
  }
}

function shuffle (array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const temp = array[i]
    array[i] = array[j]
    array[j] = temp
  }
  return array
}

/**
 * Parse the constructor/connect options.
 *
 * @param {Object} [opts]
 * @api private
 */
Client.prototype.parseOptions = function (opts) {
  const options = this.options = {
    encoding: 'utf8',
    maxPingOut: DEFAULT_MAX_PING_OUT,
    maxReconnectAttempts: DEFAULT_MAX_RECONNECT_ATTEMPTS,
    noEcho: false,
    pedantic: false,
    pingInterval: DEFAULT_PING_INTERVAL,
    reconnect: true,
    reconnectTimeWait: DEFAULT_RECONNECT_TIME_WAIT,
    reconnectJitter: DEFAULT_RECONNECT_JITTER,
    reconnectJitterTLS: DEFAULT_RECONNECT_JITTER_TLS,
    tls: false,
    useOldRequestStyle: false,
    verbose: false,
    waitOnFirstConnect: false
  }

  if (undefined === opts) {
    options.url = DEFAULT_URI
  } else if (typeof opts === 'number') {
    options.url = DEFAULT_PRE + opts
  } else if (typeof opts === 'string') {
    options.url = sanitizeUrl(opts)
  } else if (typeof opts === 'object') {
    if (opts.port !== undefined) {
      options.url = DEFAULT_PRE + opts.port
    }
    // Pull out various options here
    this.assignOption(opts, 'timeout')
    this.assignOption(opts, 'encoding')
    this.assignOption(opts, 'json')
    this.assignOption(opts, 'maxPingOut')
    this.assignOption(opts, 'maxReconnectAttempts')
    this.assignOption(opts, 'name')
    this.assignOption(opts, 'nkey')
    this.assignOption(opts, 'noEcho')
    this.assignOption(opts, 'noRandomize')
    this.assignOption(opts, 'nonceSigner')
    this.assignOption(opts, 'pass')
    this.assignOption(opts, 'pedantic')
    this.assignOption(opts, 'pingInterval')
    this.assignOption(opts, 'preserveBuffers')
    this.assignOption(opts, 'reconnect')
    this.assignOption(opts, 'reconnectJitter')
    this.assignOption(opts, 'reconnectJitterTLS')
    this.assignOption(opts, 'reconnectDelayHandler')
    this.assignOption(opts, 'reconnectTimeWait')
    this.assignOption(opts, 'servers')
    this.assignOption(opts, 'tls')
    this.assignOption(opts, 'token')
    this.assignOption(opts, 'tokenHandler')
    this.assignOption(opts, 'url')
    this.assignOption(opts, 'useOldRequestStyle')
    this.assignOption(opts, 'user')
    this.assignOption(opts, 'userCreds')
    this.assignOption(opts, 'userJWT')
    this.assignOption(opts, 'verbose')
    this.assignOption(opts, 'waitOnFirstConnect')
    this.assignOption(opts, 'yieldTime')

    // fixme: aliasing a configuration property name should be an error
    this.assignOption(opts, 'client', 'name')
    this.assignOption(opts, 'credentials', 'userCreds')
    this.assignOption(opts, 'dontRandomize', 'noRandomize')
    this.assignOption(opts, 'jwt', 'userJWT')
    this.assignOption(opts, 'JWT', 'userJWT')
    this.assignOption(opts, 'nkeys', 'nkey')
    this.assignOption(opts, 'NoRandomize', 'noRandomize')
    this.assignOption(opts, 'password', 'pass')
    this.assignOption(opts, 'secure', 'tls')
    this.assignOption(opts, 'sig', 'nonceSigner')
    this.assignOption(opts, 'sigCB', 'nonceSigner')
    this.assignOption(opts, 'sigCallback', 'nonceSigner')
    this.assignOption(opts, 'sigcb', 'nonceSigner')
    this.assignOption(opts, 'uri', 'url')
    this.assignOption(opts, 'urls', 'servers')
    this.assignOption(opts, 'usercreds', 'userCreds')
    this.assignOption(opts, 'userjwt', 'userJWT')
  }

  // Set user/pass as needed if in options.
  this.user = options.user
  this.pass = options.pass

  // Set token as needed if in options.
  this.token = options.token
  this.tokenHandler = options.tokenHandler

  // Authentication - make sure authentication is valid.
  if (this.user && this.token) {
    throw (new NatsError(BAD_AUTHENTICATION_MSG, BAD_AUTHENTICATION))
  }

  if (this.tokenHandler && typeof this.tokenHandler !== 'function') {
    throw (new NatsError(BAD_AUTHENTICATION_TH_NOT_FUNC_MSG, BAD_AUTHENTICATION))
  }

  if (this.tokenHandler && this.token) {
    throw (new NatsError(BAD_AUTHENTICATION_T_AND_TH_MSG, BAD_AUTHENTICATION))
  }

  if (options.reconnectDelayHandler && typeof options.reconnectDelayHandler !== 'function') {
    throw (new NatsError(BAD_OPTIONS, 'reconnectDelayHandler must be a function'))
  }

  if (!options.reconnectDelayHandler) {
    options.reconnectDelayHandler = jitter(options)
  }

  // Encoding - make sure its valid.
  if (Buffer.isEncoding(options.encoding)) {
    this.encoding = options.encoding
  } else {
    throw new NatsError(INVALID_ENCODING_MSG_PREFIX + options.encoding, INVALID_ENCODING)
  }
  // For cluster support
  this.servers = []

  if (Array.isArray(options.servers)) {
    options.servers.forEach((server) => {
      server = sanitizeUrl(server)
      this.servers.push(new Server(new url.URL(server)))
    })
    // Randomize if needed
    if (options.noRandomize !== true) {
      shuffle(this.servers)
    }

    // if they gave an URL we should add it if different
    if (options.url !== undefined && this.servers.indexOf(options.url) === -1) {
      // Make url first element so it is attempted first
      this.servers.unshift(new Server(new url.URL(options.url)))
    }
  } else {
    if (undefined === options.url) {
      options.url = DEFAULT_URI
    }
    this.servers.push(new Server(new url.URL(options.url)))
  }
  // If we are not setup for tls, but were handed a url with a tls:// prefix
  // then upgrade to tls.
  if (options.tls === false) {
    this.servers.forEach((server) => {
      if (server.url.protocol === 'tls' || server.url.protocol === 'tls:') {
        options.tls = true
      }
    })
  }

  if (options.timeout && typeof options.timeout !== 'number') {
    throw new NatsError('timeout should be a number', BAD_OPTIONS)
  }
}

function jitter (options) {
  return function () {
    let extra = options.tls ? options.reconnectJitterTLS : options.reconnectJitter
    if (extra) {
      extra++
      extra = Math.floor(Math.random() * extra)
    }
    return options.reconnectTimeWait + extra
  }
}

function sanitizeUrl (host) {
  if ((/^.*:\/\/.*/).exec(host) === null) {
    // Does not have a scheme.
    host = 'nats://' + host
  }
  const u = new url.URL(host)
  if (u.port === null || u.port === '') {
    host += ':' + DEFAULT_PORT
  }
  return host
}

/**
 * Create a new server.
 *
 * @api private
 */
function Server (url) {
  this.url = url
  this.didConnect = false
  this.reconnects = 0
  this.lastConnect = 0
}

/**
 * @api private
 */
Server.prototype.toString = function () {
  return this.url.href
}

/**
 * Properly select the next server.
 * We rotate the server list as we go,
 * we also pull auth from urls as needed, or
 * if they were set in options use that as override.
 *
 * @api private
 */
Client.prototype.selectServer = function () {
  const server = this.servers.shift()

  // Place in client context.
  this.currentServer = server
  this.url = server.url
  const un = server.url.username || ''
  const pw = server.url.password || ''
  let up = ''
  if (un !== '' && pw !== '') {
    up = un + ':' + pw
  } else if (un !== '') {
    up = un
  }
  if (up !== '') {
    const auth = up.split(':')
    if (auth.length !== 1) {
      if (this.options.user === undefined) {
        this.user = auth[0]
      }
      if (this.options.pass === undefined) {
        this.pass = auth[1]
      }
    } else {
      if (this.options.token === undefined) {
        this.token = auth[0]
      }
    }
  }
  this.servers.push(server)
  return server
}

Client.prototype.checkNoEchoMismatch = function () {
  if ((this.info.proto === undefined || this.info.proto < 1) && this.options.noEcho) {
    this.emit('error', new NatsError(NO_ECHO_NOT_SUPPORTED_MSG, NO_ECHO_NOT_SUPPORTED))
    this.closeStream()
    return true
  }
  return false
}

/**
 * Check for TLS configuration mismatch.
 *
 * @api private
 */
Client.prototype.checkTLSMismatch = function () {
  // Switch over to TLS as needed on the fly.
  if (this.info.tls_required === true ||
    (this.options.tls !== false && this.stream.encrypted !== true)) {
    if (undefined === this.options.tls || this.options.tls === false) {
      this.options.tls = true
    }
  }

  if (this.info.tls_required === true &&
    this.options.tls === false) {
    this.emit('error', new NatsError(SECURE_CONN_REQ_MSG, SECURE_CONN_REQ))
    this.closeStream()
    return true
  }

  if (!this.info.tls_required && this.options.tls !== false) {
    this.emit('error', new NatsError(NON_SECURE_CONN_REQ_MSG, NON_SECURE_CONN_REQ))
    this.closeStream()
    return true
  }

  if (this.info.tls_verify === true &&
    this.options.tls.cert === undefined) {
    this.emit('error', new NatsError(CLIENT_CERT_REQ_MSG, CLIENT_CERT_REQ))
    this.closeStream()
    return true
  }
  return false
}

/**
 * Load a user jwt from a chained credential file.
 * @return {String | undefined}
 * @emits NatsError if JWT couldn't be parsed
 * @api private
 */
Client.prototype.loadUserJWT = function () {
  const contents = fs.readFileSync(this.options.userCreds).toString()
  const m = CREDS.exec(contents) // jwt
  if (m === null) {
    this.emit('error', new NatsError(NO_USER_JWT_IN_CREDS_MSG, NO_USER_JWT_IN_CREDS))
    this.closeStream()
    return
  }
  return m[1]
}

/**
 * Load a user nkey seed from a chained credential file
 * and sign nonce.
 *
 * @api private
 */
Client.prototype.loadKeyAndSignNonce = function (nonce) {
  const contents = fs.readFileSync(this.options.userCreds).toString()
  const re = new RegExp(CREDS.source, 'g')
  re.exec(contents) // consume jwt
  const m = re.exec(contents) // seed
  if (m === null) {
    this.emit('error', new NatsError(NO_SEED_IN_CREDS_MSG, NO_SEED_IN_CREDS))
    this.closeStream()
    return
  }
  const sk = nkeys.fromSeed(Buffer.from(m[1]))
  return sk.sign(nonce)
}

/**
 * Helper that takes a user credentials file and
 * generates the proper opts object with proper handlers
 * filled in. e.g nats.connect(url, nats.creds("my_creds.ttx")
 *
 * @params {String} [filepath]
 *
 * @api public
 */
exports.creds = function (filepath) {
  if (undefined === filepath) {
    return undefined
  }
  return {
    userCreds: filepath
  }
}

/**
 * Check for Nkey mismatch.
 *
 * @api private
 */
Client.prototype.checkNkeyMismatch = function () {
  if (undefined === this.info.nonce) {
    return false
  }

  // If this has been specified make sure we can open the file and parse it.
  if (this.options.userCreds !== undefined) {
    // Treat this as a filename.
    // For now we will not capture an error on file not found etc.
    const contents = fs.readFileSync(this.options.userCreds).toString()
    if (CREDS.exec(contents) === null) {
      this.emit('error', new NatsError(BAD_CREDS_MSG, BAD_CREDS))
      this.closeStream()
      return true
    }
    // We have a valid file, set up callback handlers.
    const client = this
    this.options.nonceSigner = function (nonce) {
      return client.loadKeyAndSignNonce(nonce)
    }
    this.options.userJWT = function () {
      return client.loadUserJWT()
    }
    return false
  }

  if (undefined === this.options.nonceSigner) {
    this.emit('error', new NatsError(SIGNATURE_REQUIRED_MSG, SIGNATURE_REQUIRED))
    this.closeStream()
    return true
  }
  if (typeof (this.options.nonceSigner) !== 'function') {
    this.emit('error', new NatsError(SIGCB_NOTFUNC_MSG, SIGCB_NOTFUNC))
    this.closeStream()
    return true
  }
  if (undefined === this.options.nkey && undefined === this.options.userJWT) {
    this.emit('error', new NatsError(NKEY_OR_JWT_REQ_MSG, NKEY_OR_JWT_REQ))
    this.closeStream()
    return true
  }
  return false
}

/**
 * Callback for first flush/connect.
 *
 * @api private
 */
Client.prototype.connectCB = function () {
  const wasReconnecting = this.reconnecting
  const event = (wasReconnecting === true) ? 'reconnect' : 'connect'
  this.reconnecting = false
  this.reconnects = 0
  this.wasConnected = true
  this.currentServer.didConnect = true

  this.emit(event, this)

  this.flushPending()
}

/**
 * @api private
 */
Client.prototype.cancelHeartbeat = function () {
  if (this.pingTimer) {
    clearTimeout(this.pingTimer)
    delete this.pingTimer
  }
}

/**
 * @api private
 */
Client.prototype.scheduleHeartbeat = function () {
  this.pingTimer = setTimeout(function (client) {
    client.emit('pingtimer')
    if (client.closed) {
      return
    }
    // we could be waiting on the socket to connect
    if (client.stream && !client.stream.connecting) {
      client.emit('pingcount', client.pout)
      client.pout++
      if (client.pout > client.options.maxPingOut) {
        // processErr will scheduleReconnect
        client.processErr(STALE_CONNECTION_ERR)
        // don't reschedule, new connection initiated
        return
      } else {
        // send the ping
        client.sendCommand(PING_REQUEST)
        if (client.pongs) {
          // no callback
          client.pongs.push(undefined)
        }
      }
    }
    // reschedule
    client.scheduleHeartbeat()
  }, this.options.pingInterval, this)
}

/**
 * @api private
 */
Client.prototype.clearConnectionTimeoutHandler = function () {
  if (this.connectionTimeoutHandler) {
    clearTimeout(this.connectionTimeoutHandler)
    delete this.connectionTimeoutHandler
  }
}

/**
 * Properly setup a stream event handlers.
 *
 * @api private
 */
Client.prototype.setupHandlers = function () {
  const stream = this.stream

  if (undefined === stream) {
    return
  }

  // tls upgrade will re-bind the handlers here, so if we have a timer we are going to ignore it
  if (this.options.timeout && !this.connectionTimeoutHandler) {
    this.connectionTimeoutHandler = setTimeout(() => {
      if (this.stream) {
        // this fires on the current stream
        this.stream.destroy(new NatsError(CONN_TIMEOUT_MSG, CONN_TIMEOUT))
      }
    }, this.options.timeout)
  }

  stream.on('connect', () => {
    this.cancelHeartbeat()
    this.connected = true
    this.scheduleHeartbeat()
  })

  stream.on('close', () => {
    const done = (this.closed === true || this.options.reconnect === false || this.servers.length === 0)
    // if connected, it resets everything as partial buffers may have been sent
    // this will also reset the heartbeats, but not other timers on requests or subscriptions
    const pongs = this.pongs
    this.closeStream()
    if (stream.bytesRead > 0) {
      // if the client will reconnect, re-setup pongs/pending to sending commands
      if (!done) {
        this.pongs = []
        this.pending = []
        this.pSize = 0
      }
      // now we tell them that we bailed
      if (pongs) {
        pongs.forEach((cb) => {
          if (typeof cb === 'function') {
            try {
              cb(new NatsError(DISCONNECT_MSG, DISCONNECT_ERR))
            } catch (_) {
              // don't fail
            }
          }
        })
      }
      this.emit('disconnect')
    }
    if (done) {
      this.cleanupTimers()
      this.emit('close')
    } else {
      this.scheduleReconnect()
    }
  })

  stream.on('error', (exception) => {
    // If we were connected just return, close event will process
    if (this.wasConnected === true && this.currentServer.didConnect === true) {
      return
    }

    // if the current server did not connect at all, and we in
    // general have not connected to any server, remove it from
    // this list. Unless overridden
    if (this.wasConnected === false && this.currentServer.didConnect === false) {
      // We can override this behavior with waitOnFirstConnect, which will
      // treat it like a reconnect scenario.
      if (this.options.waitOnFirstConnect) {
        // Pretend to move us into a reconnect state.
        this.currentServer.didConnect = true
      } else {
        this.servers.splice(this.servers.length - 1, 1)
      }
    }

    // Only bubble up error if we never had connected
    // to the server and we only have one, and close
    if (this.wasConnected === false && this.servers.length === 0) {
      this.emit('error', new NatsError(CONN_ERR_MSG_PREFIX + exception, CONN_ERR, exception))
      this.close()
      return
    }
    // continue with reconnect
    this.closeStream()
  })

  stream.on('data', (data) => {
    // If inbound exists, concat them together. We try to avoid this for split
    // messages, so this should only really happen for a split control line.
    // Long term answer is hand rolled parser and not regexp.
    if (this.inbound) {
      this.inbound = Buffer.concat([this.inbound, data])
    } else {
      this.inbound = data
    }

    // Process the inbound queue.
    this.processInbound()
  })
}

/**
 * Send the connect command. This needs to happen after receiving the first
 * INFO message and after TLS is established if necessary.
 *
 * @api private
 */
Client.prototype.sendConnect = function () {
  // Queue the connect command.
  const cs = {
    lang: 'node',
    version: VERSION,
    verbose: this.options.verbose,
    pedantic: this.options.pedantic,
    protocol: 1
  }
  if (this.info.nonce !== undefined && this.options.nonceSigner !== undefined) {
    const sig = this.options.nonceSigner(Buffer.from(this.info.nonce))
    cs.sig = sig.toString('base64')
  }
  if (this.options.userJWT !== undefined) {
    if (typeof (this.options.userJWT) === 'function') {
      cs.jwt = this.options.userJWT()
    } else {
      cs.jwt = this.options.userJWT
    }
  }
  if (this.options.nkey !== undefined) {
    cs.nkey = this.options.nkey
  }
  if (this.user !== undefined) {
    cs.user = this.user
    cs.pass = this.pass
  }
  if (this.tokenHandler !== undefined) {
    let token
    try {
      token = this.tokenHandler()
    } catch (err) {
      this.emit('error', new NatsError(BAD_AUTHENTICATION_TH_FAILED_MSG_PREFIX + err, BAD_AUTHENTICATION, err))
    }
    cs.auth_token = token
  } else if (this.token !== undefined) {
    cs.auth_token = this.token
  }
  if (this.options.name !== undefined) {
    cs.name = this.options.name
  }
  if (this.options.nkey !== undefined) {
    cs.nkey = this.options.nkey
  }
  if (this.options.noEcho) {
    cs.echo = false
  }

  // If we enqueued requests before we received INFO from the server, or we
  // reconnected, there be other data pending, write this immediately instead
  // of adding it to the queue.
  this.stream.write(CONNECT + SPC + JSON.stringify(cs) + CR_LF)
}

/**
 * Properly setup a stream connection with proper events.
 *
 * @api private
 */
Client.prototype.createConnection = function () {
  this.pongs = this.pongs || []
  this.pending = this.pending || []
  this.pSize = this.pSize || 0
  this.pstate = AWAITING_CONTROL

  // Clear info processing.
  this.info = null
  this.infoReceived = false

  // See #45 if we have a stream release the listeners otherwise in addition
  // to the leaking of events, the old events will still fire.
  if (this.stream) {
    this.stream.removeAllListeners()
    this.stream.destroy()
  }
  // Create the stream
  this.stream = net.createConnection(this.url.port, this.url.hostname)
  // this change makes it a bit faster on Linux, slightly worse on OS X
  this.stream.setNoDelay(true)
  // Setup the proper handlers.
  this.setupHandlers()
}

/**
 * Initialize client state.
 *
 * @api private
 */
Client.prototype.initState = function () {
  this.ssid = 0
  this.subs = {}
  this.reconnects = 0
  this.connected = false
  this.wasConnected = false
  this.reconnecting = false
  this.pending = []
  this.pout = 0
}

/**
 * Close the connection to the server.
 *
 * @api public
 */
Client.prototype.close = function () {
  this.cleanupTimers()
  this.closed = true
  this.removeAllListeners()
  this.closeStream()
  this.ssid = -1
  this.subs = null
  this.pstate = -1
  this.pongs = null
  this.pending = null
  this.pSize = 0
}

/**
 * Cancels all the timers, ping, subs, requests.
 * Should only be called on a close.
 * @api private
 */
Client.prototype.cleanupTimers = function () {
  this.cancelHeartbeat()

  if (this.respmux && this.respmux.requestMap) {
    for (const p in this.respmux.requestMap) {
      if (Object.hasOwnProperty.call(this.respmux.requestMap, p)) {
        this.cancelMuxRequest(p)
      }
    }
  }
  if (this.subs) {
    for (const p in this.subs) {
      if (Object.hasOwnProperty.call(this.subs, p)) {
        const sub = this.subs[p]
        if (sub.timeout) {
          clearTimeout(sub.timeout)
          delete sub.timeout
        }
      }
    }
  }
}

/**
 * Close down the stream and clear state.
 *
 * @api private
 */
Client.prototype.closeStream = function () {
  if (this.stream !== null) {
    this.stream.destroy()
    this.clearConnectionTimeoutHandler()
    this.stream = null
  }
  if (this.connected === true || this.closed === true) {
    this.pongs = null
    this.pout = 0
    this.pending = []
    this.pSize = 0
    this.connected = false
  }
  this.inbound = null
  // if we are not connected, let's not queue up heartbeats
  this.cancelHeartbeat()
}

/**
 * Flush all pending data to the server.
 *
 * @api private
 */
Client.prototype.flushPending = function () {
  if (this.connected === false ||
    this.pending === null ||
    this.pending.length === 0 ||
    this.infoReceived !== true) {
    return
  }

  const write = (data) => {
    this.pending = []
    this.pSize = 0
    return this.stream.write(data)
  }
  if (!this.pBufs) {
    // All strings, fastest for now.
    return write(this.pending.join(EMPTY))
  } else {
    // We have some or all Buffers. Figure out if we can optimize.
    let allBufs = true
    for (let i = 0; i < this.pending.length; i++) {
      if (!Buffer.isBuffer(this.pending[i])) {
        allBufs = false
        break
      }
    }
    // If all buffers, concat together and write once.
    if (allBufs) {
      return write(Buffer.concat(this.pending, this.pSize))
    } else {
      // We have a mix, so write each one individually.
      const pending = this.pending
      this.pending = []
      this.pSize = 0
      let result = true
      for (let i = 0; i < pending.length; i++) {
        result = this.stream.write(pending[i]) && result
      }
      return result
    }
  }
}

/**
 * Strips all SUBS commands from pending during initial connection completed since
 * we send the subscriptions as a separate operation.
 *
 * @api private
 */
Client.prototype.stripPendingSubs = function () {
  const pending = this.pending
  this.pending = []
  this.pSize = 0
  for (let i = 0; i < pending.length; i++) {
    if (!SUBRE.test(pending[i])) {
      // Re-queue the command.
      this.sendCommand(pending[i])
    }
  }
}

/**
 * Send commands to the server or queue them up if connection pending.
 *
 * @api private
 */
Client.prototype.sendCommand = function (cmd) {
  // Buffer to cut down on system calls, increase throughput.
  // When receive gets faster, should make this Buffer based..

  if (this.closed) {
    return
  }

  this.pending.push(cmd)
  if (!Buffer.isBuffer(cmd)) {
    this.pSize += Buffer.byteLength(cmd)
  } else {
    this.pSize += cmd.length
    this.pBufs = true
  }

  if (this.connected === true) {
    // First one let's setup flush..
    if (this.pending.length === 1) {
      const self = this
      setImmediate(function () {
        self.flushPending()
      })
    } else if (this.pSize > FLUSH_THRESHOLD) {
      // Flush in place when threshold reached..
      this.flushPending()
    }
  }
}

/**
 * Sends existing subscriptions to new server after reconnect.
 *
 * @api private
 */
Client.prototype.sendSubscriptions = function () {
  let protos = ''
  for (const sid in this.subs) {
    if (Object.hasOwnProperty.call(this.subs, sid)) {
      const sub = this.subs[sid]
      let proto
      if (sub.qgroup) {
        proto = [SUB, sub.subject, sub.qgroup, sid + CR_LF]
      } else {
        proto = [SUB, sub.subject, sid + CR_LF]
      }
      protos += proto.join(SPC)

      if (sub.max) {
        const max = sub.max - sub.received
        if (max > 0) {
          proto = [UNSUB, sid, max + CR_LF]
        } else {
          proto = [UNSUB, sid + CR_LF]
        }
        protos += proto.join(SPC)
      }
    }
  }
  if (protos.length > 0) {
    this.stream.write(protos)
  }
}

/**
 * Process the inbound data queue.
 *
 * @api private
 */
Client.prototype.processInbound = function () {
  // Hold any regex matches.
  let m

  // For optional yield
  let start

  if (!this.stream) {
    // if we are here, the stream was reaped and errors raised
    // if we continue.
    return
  }
  // unpause if needed.
  // FIXME(dlc) client.stream.isPaused() causes 0.10 to fail
  this.stream.resume()

  /* jshint -W083 */

  if (this.options.yieldTime !== undefined) {
    start = Date.now()
  }

  while (!this.closed && this.inbound && this.inbound.length > 0) {
    switch (this.pstate) {
      case AWAITING_CONTROL: {
        // Regex only works on strings, so convert once to be more efficient.
        // Long term answer is a hand rolled parser, not regex.
        const buf = this.inbound.toString('binary', 0, MAX_CONTROL_LINE_SIZE)
        if ((m = MSG.exec(buf)) !== null) {
          this.payload = {
            subj: m[1],
            sid: parseInt(m[2], 10),
            reply: m[4],
            size: parseInt(m[5], 10)
          }
          this.payload.psize = this.payload.size + CR_LF_LEN
          this.pstate = AWAITING_MSG_PAYLOAD
        } else if ((m = OK.exec(buf)) !== null) {
          // Ignore for now..
        } else if ((m = ERR.exec(buf)) !== null) {
          if (this.processErr(m[1])) {
            return
          }
        } else if ((m = PONG.exec(buf)) !== null) {
          this.pout = 0
          const cb = this.pongs && this.pongs.shift()
          if (cb) {
            cb()
          } // FIXME: Should we check for exceptions?
        } else if ((m = PING.exec(buf)) !== null) {
          this.sendCommand(PONG_RESPONSE)
        } else if ((m = INFO.exec(buf)) !== null) {
          this.info = JSON.parse(m[1])
          // Always try to read the connect_urls from info
          this.processServerUpdate()

          // Process first INFO
          if (this.infoReceived === false) {
            // Check on TLS mismatch.
            if (this.checkTLSMismatch() === true) {
              return
            }
            if (this.checkNoEchoMismatch() === true) {
              return
            }
            if (this.checkNkeyMismatch() === true) {
              return
            }

            // Switch over to TLS as needed.
            if (this.info.tls_required === true) {
              const tlsOpts = {
                socket: this.stream
              }
              if (typeof this.options.tls === 'object') {
                for (const key in this.options.tls) {
                  // noinspection JSUnfilteredForInLoop
                  tlsOpts[key] = this.options.tls[key]
                }
              }
              // if we have a stream, this is from an old connection, reap it
              if (this.stream) {
                this.stream.removeAllListeners()
              }
              try {
                // Refer to issue #310
                this.stream = tls.connect(tlsOpts)
              } catch (error) {
                this.emit('error', new NatsError(OPENSSL_ERR_MSG_PREFIX + error, OPENSSL_ERR, error))
                return
              }
              this.setupHandlers()
            }

            // Send the connect message and subscriptions immediately
            this.sendConnect()
            // add the first callback to a ping
            this.pongs.unshift((err) => {
              if (err) {
                // failed the connection
                return
              }
              // this gets called when the first pong is received by the connection
              // if we have a connection timeout timer, remove it
              this.clearConnectionTimeoutHandler()
              // send any subscriptions, and strip pending
              this.sendSubscriptions()
              this.stripPendingSubs()
              // reset the reconnects for this server
              this.currentServer.reconnects = 0
              // invoke the callback
              this.connectCB()
            })
            // send that ping out now
            this.stream.write(PING_REQUEST)
            this.flushPending()
            // Mark as received
            this.infoReceived = true
          }
        } else {
          // FIXME, check line length for something weird.
          // Nothing here yet, return
          return
        }
        break
      }

      case AWAITING_MSG_PAYLOAD: {
        // If we do not have the complete message, hold onto the chunks
        // and assemble when we have all we need. This optimizes for
        // when we parse a large buffer down to a small number of bytes,
        // then we receive a large chunk. This avoids a big copy with a
        // simple concat above.
        if (this.inbound.length < this.payload.psize) {
          if (undefined === this.payload.chunks) {
            this.payload.chunks = []
          }
          this.payload.chunks.push(this.inbound)
          this.payload.psize -= this.inbound.length
          this.inbound = null
          return
        }

        // If we are here we have the complete message.
        // Check to see if we have existing chunks
        if (this.payload.chunks) {
          this.payload.chunks.push(this.inbound.slice(0, this.payload.psize))
          // don't append trailing control characters
          const mbuf = Buffer.concat(this.payload.chunks, this.payload.size)

          if (this.options.preserveBuffers) {
            this.payload.msg = mbuf
          } else {
            this.payload.msg = mbuf.toString(this.encoding)
          }
        } else {
          if (this.options.preserveBuffers) {
            this.payload.msg = this.inbound.slice(0, this.payload.size)
          } else {
            this.payload.msg = this.inbound.toString(this.encoding, 0, this.payload.size)
          }
        }

        // Eat the size of the inbound that represents the message.
        if (this.inbound.length === this.payload.psize) {
          this.inbound = null
        } else {
          this.inbound = this.inbound.slice(this.payload.psize)
        }

        // process the message
        this.processMsg()

        // Reset
        this.pstate = AWAITING_CONTROL
        this.payload = null

        // Check to see if we have an option to yield for other events after yieldTime.
        if (start !== undefined) {
          if ((Date.now() - start) > this.options.yieldTime) {
            this.stream.pause()
            setImmediate(this.processInbound.bind(this))
            return
          }
        }
        break
      }
    }

    // This is applicable for a regex match to eat the bytes we used from a control line.
    if (this.inbound && m && !this.closed) {
      // Chop inbound
      const psize = m[0].length
      if (psize >= this.inbound.length) {
        this.inbound = null
      } else {
        this.inbound = this.inbound.slice(psize)
      }
    }
    m = null
  }
}

/**
 * Process server updates in info object
 * @api internal
 */
Client.prototype.processServerUpdate = function () {
  // noinspection JSUnresolvedVariable
  if (this.info.connect_urls && this.info.connect_urls.length > 0) {
    // parse the infos
    const tmp = {}
    this.info.connect_urls.forEach((server) => {
      const u = 'nats://' + server
      const s = new Server(new url.URL(u))
      // implicit servers are ones added via the info connect_urls
      s.implicit = true
      tmp[s.url.href] = s
    })

    // remove implicit servers that are no longer reported
    const toDelete = []
    this.servers.forEach((s, index) => {
      const u = s.url.href
      if (s.implicit && this.currentServer.url.href !== u && tmp[u] === undefined) {
        // server was removed
        toDelete.push(index)
      }
      // remove this entry from reported
      delete tmp[u]
    })

    // perform the deletion
    toDelete.reverse()
    toDelete.forEach((index) => {
      this.servers.splice(index, 1)
    })

    // remaining servers are new
    const newURLs = []
    for (const k in tmp) {
      if (Object.hasOwnProperty.call(tmp, k)) {
        this.servers.push(tmp[k])
        newURLs.push(k)
      }
    }

    if (newURLs.length) {
      // new reported servers useful for tests
      this.emit('serversDiscovered', newURLs)
      // simpler version
      this.emit('servers', newURLs)
    }
  }
}

/**
 * Process a delivered message and deliver to appropriate subscriber.
 *
 * @api private
 */
Client.prototype.processMsg = function () {
  const sub = this.subs[this.payload.sid]
  if (sub !== undefined) {
    sub.received += 1
    // Check for a timeout, and cancel if received >= expected
    if (sub.timeout) {
      if (sub.received >= sub.expected) {
        clearTimeout(sub.timeout)
        sub.timeout = null
      }
    }

    // Check for auto-unsubscribe
    if (sub.max !== undefined) {
      if (sub.received === sub.max) {
        delete this.subs[this.payload.sid]
        this.emit('unsubscribe', this.payload.sid, sub.subject)
      } else if (sub.received > sub.max) {
        this.unsubscribe(this.payload.sid)
        sub.callback = null
      }
    }

    if (sub.callback) {
      let msg = this.payload.msg
      if (this.options.json) {
        try {
          if (this.options.preserveBuffers) {
            msg = JSON.parse(this.payload.msg.toString())
          } else {
            msg = JSON.parse(this.payload.msg.toString(this.options.encoding))
          }
        } catch (e) {
          msg = e
        }
      }
      try {
        sub.callback(msg, this.payload.reply, this.payload.subj, this.payload.sid)
      } catch (error) {
        this.emit('error', error)
      }
    }
  }
}

/**
 * ProcessErr processes any error messages from the server
 * @returns boolean true if stream was closed
 * @api private
 */
Client.prototype.processErr = function (s) {
  // current NATS clients, will raise an error and close on any errors
  // except permission errors
  const m = s ? s.toLowerCase() : ''
  if (m.indexOf(STALE_CONNECTION_ERR) !== -1) {
    // closeStream() triggers a reconnect if allowed
    this.closeStream()
    return true
  } else if (m.indexOf(PERMISSIONS_ERR) !== -1) {
    this.emit('permission_error', new NatsError(s, NATS_PROTOCOL_ERR))
    return false
  } else {
    this.emit('error', new NatsError(s, NATS_PROTOCOL_ERR))
    this.closeStream()
    return true
  }
}

/**
 * Push a new cluster server.
 *
 * @param {String} uri
 * @api public
 */
Client.prototype.addServer = function (uri) {
  this.servers.push(new Server(new url.URL(uri)))

  if (this.options.noRandomize !== true) {
    shuffle(this.servers)
  }
}

/**
 * Flush outbound queue to server and call optional callback when server has processed
 * all data.
 *
 * @param {Function} [callback]
 * @api public
 */
Client.prototype.flush = function (callback) {
  if (this.closed) {
    if (typeof callback === 'function') {
      callback(new NatsError(CONN_CLOSED_MSG, CONN_CLOSED))
      return
    } else {
      throw (new NatsError(CONN_CLOSED_MSG, CONN_CLOSED))
    }
  }
  if (this.pongs) {
    this.pongs.push(callback)
    this.sendCommand(PING_REQUEST)
    this.flushPending()
  }
}

/**
 * Drains all subscriptions. If an opt_callback is provided, the callback
 * is called if there's an error with an error argument.
 *
 * Note that after calling drain, it is impossible to create new subscriptions
 * or any requests. As soon as all messages for the draining subscriptions are
 * processed, it is also impossible to publish new messages.
 *
 * A drained connection is closed when the optional callback is called without arguments.
 * @param callback
 */
Client.prototype.drain = function (callback) {
  if (this.handledClosedOrDraining(callback)) {
    return
  }
  this.draining = true
  const subs = []
  const drains = []
  for (const sid in this.subs) {
    if (Object.hasOwnProperty.call(this.subs, sid)) {
      const sub = this.subs[sid]
      sub.sid = sid
      subs.push(sub)
    }
  }

  subs.forEach((sub) => {
    this.drainSubscription(sub.sid, () => {
      drains.push(sub)
      if (drains.length === subs.length) {
        this.noMorePublishing = true
        this.flush(() => {
          this.close()
          if (typeof callback === 'function') {
            callback()
          }
        })
      }
    })
  })

  // no subscriptions
  if (subs.length === 0) {
    this.noMorePublishing = true
    this.close()
    if (typeof callback === 'function') {
      callback()
    }
  }
}

/**
 * Returns true if the client is closed or draining, caller should
 * return as error was generated.
 * @private
 * @param {Function} [callback]
 * @returns {boolean}
 */
Client.prototype.handledClosedOrDraining = function (callback) {
  if (this.closed) {
    return this.throwOrEmit(new NatsError(CONN_CLOSED_MSG, CONN_CLOSED), callback)
  }
  if (this.draining) {
    return this.throwOrEmit(new NatsError(CONN_DRAINING_MSG, CONN_DRAINING), callback)
  }
}

/**
 * Publish a message to the given subject, with optional reply and callback.
 *
 * @param {String} subject
 * @param {String | Buffer | Object} [data]
 * @param {String} [reply]
 * @param {Function} [callback]
 * @api public
 */
Client.prototype.publish = function (subject, data, reply, callback) {
  const args = callbackShifter(4, Array.prototype.slice.call(arguments))
  subject = args[0]
  data = args[1]
  reply = args[2]
  callback = args[3]

  if (this.noMorePublishing) {
    return this.throwOrEmit(new NatsError(CONN_DRAINING_MSG, CONN_DRAINING))
  }

  if (!this.options.json) {
    data = data || EMPTY
  } else {
    // undefined is not a valid JSON-serializable value, but null is
    data = data === undefined ? null : data
  }

  if (this.handledInvalidArgs({ subject, data, reply, callback })) {
    return
  }

  // Hold PUB SUB [REPLY]
  let psub
  if (reply === undefined) {
    psub = 'PUB ' + subject + SPC
  } else {
    psub = 'PUB ' + subject + SPC + reply + SPC
  }

  // Need to treat sending buffers different.
  if (!Buffer.isBuffer(data)) {
    let str = data
    if (this.options.json) {
      try {
        str = JSON.stringify(data)
      } catch (e) {
        throw (new NatsError(BAD_JSON_MSG, BAD_JSON))
      }
    }
    this.sendCommand(psub + Buffer.byteLength(str) + CR_LF + str + CR_LF)
  } else {
    const b = Buffer.allocUnsafe(psub.length + data.length + (2 * CR_LF_LEN) + data.length.toString().length)
    const len = b.write(psub + data.length + CR_LF)
    data.copy(b, len)
    b.write(CR_LF, len + data.length)
    this.sendCommand(b)
  }

  if (callback !== undefined) {
    this.flush(callback)
  } else if (this.closed) {
    throw (new NatsError(CONN_CLOSED_MSG, CONN_CLOSED))
  }
}

/**
 * @api private
 */
Client.prototype.throwOrEmit = function (err, callback) {
  if (typeof callback === 'function') {
    callback(err)
  } else {
    this.emit('error', err)
  }
  return true
}

/**
 * @api private
 */
Client.prototype.handledInvalidArgs = function (args) {
  const { subject, reply, data, callback, options, timeout } = args
  if (!subject) {
    return this.throwOrEmit(new NatsError(BAD_SUBJECT_MSG, BAD_SUBJECT), callback)
  }
  if (reply && typeof reply !== 'string') {
    return this.throwOrEmit(new NatsError(BAD_REPLY_MSG, BAD_REPLY), callback)
  }
  if (data && typeof data === 'function') {
    return this.throwOrEmit(new NatsError(BAD_MSG_MSG, BAD_MSG), callback)
  }
  if (callback && typeof callback !== 'function') {
    return this.throwOrEmit(new NatsError(BAD_CALLBACK_MSG, BAD_CALLBACK))
  }
  if (options && typeof options !== 'object') {
    return this.throwOrEmit(new NatsError(BAD_OPTIONS_MSG, BAD_OPTIONS), callback)
  }
  if (timeout && typeof timeout !== 'number') {
    return this.throwOrEmit(new NatsError(BAD_TIMEOUT_MSG, BAD_TIMEOUT), callback)
  }
}

/**
 * Subscribe to a given subject, with optional options and callback. opts can be
 * ommitted, even with a callback. The Subscriber Id is returned.
 *
 * @param {String} subject
 * @param {Object} [options]
 * @param {Function} callback - callback arguments are data, reply subject (may be undefined), and subscription id
 * @return {Number}
 * @api public
 */
Client.prototype.subscribe = function (subject, options, callback) {
  const args = callbackShifter(3, Array.prototype.slice.call(arguments))
  subject = args[0]
  options = args[1] || {}
  callback = args[2]

  const qgroup = options.queue
  const max = options.max

  if (this.handledInvalidArgs({ subject, options, callback })) {
    return 0
  }

  if (this.handledClosedOrDraining(callback)) {
    return 0
  }

  this.ssid += 1
  this.subs[this.ssid] = {
    subject: subject,
    callback: callback,
    received: 0
  }

  let proto
  if (typeof qgroup === 'string') {
    this.subs[this.ssid].qgroup = qgroup
    proto = [SUB, subject, qgroup, this.ssid + CR_LF]
  } else {
    proto = [SUB, subject, this.ssid + CR_LF]
  }

  this.sendCommand(proto.join(SPC))
  this.emit('subscribe', this.ssid, subject, options)

  if (max) {
    this.unsubscribe(this.ssid, max)
  }
  return this.ssid
}

/**
 * Unsubscribe to a given Subscriber Id, with optional max parameter.
 * Unsubscribing to a subscription that already yielded the specified number of messages
 * will clear any pending timeout callbacks.
 *
 * @param {Number} sid
 * @param {Number} [max]
 * @api public
 */
Client.prototype.unsubscribe = function (sid, max) {
  if (!sid || this.closed) {
    return
  }

  // in the case of new muxRequest, it is possible they want perform
  // an unsubscribe with the returned 'sid'. Intercept that and clear
  // the request configuration. Mux requests are always negative numbers
  if (sid < 0) {
    this.cancelMuxRequest(sid)
    return
  }

  let proto
  if (max) {
    proto = [UNSUB, sid, max + CR_LF]
  } else {
    proto = [UNSUB, sid + CR_LF]
  }
  this.sendCommand(proto.join(SPC))

  const sub = this.subs[sid]
  if (sub === undefined) {
    return
  }
  sub.max = max
  if (sub.max === undefined || (sub.received >= sub.max)) {
    // remove any timeouts that may be pending
    if (sub.timeout) {
      clearTimeout(sub.timeout)
      sub.timeout = null
    }
    delete this.subs[sid]
    this.emit('unsubscribe', sid, sub.subject)
  }
}

/**
 * Draining a subscription is similar to unsubscribe but inbound pending messages are
 * not discarded. When the last in-flight message is processed, the subscription handler
 * is removed.
 * @param {Number} sid
 * @param {Function} [callback]
 */
Client.prototype.drainSubscription = function (sid, callback) {
  if (this.handledClosedOrDraining(callback)) {
    return
  }

  const sub = this.subs[sid]
  if (sub === undefined) {
    if (typeof callback === 'function') {
      callback()
    }
    return
  }
  if (sub.draining) {
    if (typeof callback === 'function') {
      callback(new NatsError(SUB_DRAINING_MSG, SUB_DRAINING))
    } else {
      throw (new NatsError(SUB_DRAINING_MSG, SUB_DRAINING))
    }
    return
  }
  sub.draining = true
  const proto = [UNSUB, sid + CR_LF]
  this.sendCommand(proto.join(SPC))
  this.flush(() => {
    if (sub.timeout) {
      clearTimeout(sub.timeout)
      sub.timeout = null
    }
    delete this.subs[sid]
    this.emit('unsubscribe', sid, sub.subject)
    if (typeof callback === 'function') {
      callback()
    }
  })
}

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
Client.prototype.timeout = function (sid, timeout, expected, callback) {
  if (!sid) {
    return
  }
  let sub
  // check the sid is not a mux sid - which is always negative
  if (sid < 0) {
    const conf = this.getMuxRequestConfig(sid)
    if (conf && conf.timeout) {
      // clear auto-set timeout
      clearTimeout(conf.timeout)
    }
    sub = conf
  } else {
    sub = this.subs[sid]
  }

  if (sub) {
    sub.expected = expected
    sub.timeout = setTimeout(() => {
      callback(sid)
      // if callback fails unsubscribe will leak
      this.unsubscribe(sid)
    }, timeout)
  }
}

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
 * @param {String | Object | Buffer} [data]
 * @param {Object} [options]
 * @param {Function} [callback]
 * @return {Number}
 * @api public
 */
Client.prototype.request = function (subject, data, options, callback) {
  if (this.options.useOldRequestStyle) {
    // noinspection JSDeprecatedSymbols
    return this.oldRequest(subject, data, options, callback)
  }
  const args = callbackShifter(4, Array.prototype.slice.call(arguments))
  subject = args[0]
  data = args[1]
  options = args[2] || {}
  callback = args[3]

  if (this.handledInvalidArgs({ subject, data, options, callback })) {
    return 0
  }

  if (this.handledClosedOrDraining(callback)) {
    return 0
  }

  const conf = this.initMuxRequestDetails(callback, options.max)
  this.publish(subject, data, conf.inbox)

  if (options.timeout) {
    conf.timeout = setTimeout(() => {
      if (conf.callback) {
        conf.callback(new NatsError(REQ_TIMEOUT_MSG_PREFIX + conf.id, REQ_TIMEOUT))
      }
      this.cancelMuxRequest(conf.token)
    }, options.timeout)
  }

  return conf.id
}

/**
 * @deprecated
 * @api private
 */
Client.prototype.oldRequest = function (subject, data, options, callback) {
  const args = callbackShifter(4, Array.prototype.slice.call(arguments))
  subject = args[0]
  data = args[1]
  options = args[2] || {}
  callback = args[3]

  if (this.handledInvalidArgs({ subject, data, options, callback })) {
    return 0
  }

  if (this.handledClosedOrDraining(callback)) {
    return 0
  }

  const inbox = this.createInbox()
  const s = this.subscribe(inbox, options, function (msg, reply) {
    callback(msg, reply)
  })
  this.publish(subject, data, inbox)
  return s
}

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
 * @param {String | Object | Buffer} [data]
 * @param {Object} [options]
 * @param {Number} timeout
 * @param {Function} callback - can be called with message or NatsError if the request timed out.
 * @return {Number}
 * @api public
 */
Client.prototype.requestOne = function (subject, data, options, timeout, callback) {
  if (this.options.useOldRequestStyle) {
    // noinspection JSDeprecatedSymbols
    return this.oldRequestOne(subject, data, options, timeout, callback)
  }
  const args = callbackShifter(5, Array.prototype.slice.call(arguments))
  subject = args[0]
  data = args[1]
  options = args[2]
  timeout = args[3]
  callback = args[4]

  if (timeout === undefined && typeof options === 'number') {
    timeout = options
    options = undefined
  }

  if (timeout === undefined && options === undefined && typeof data === 'number') {
    timeout = data
    data = EMPTY
  }

  options = options || {}
  options.max = 1
  options.timeout = timeout

  return this.request(subject, data, options, callback)
}

// finds the last index that satisfies the testFn in array a
function lastIndexOf (a, testFun) {
  const idx = a.length - 1
  for (let i = idx; i > -1; i--) {
    if (testFun(a[i])) {
      return i
    }
  }
  return -1
}

// returns an array that shifts the last function in the
// array to the last element of the array
function callbackShifter (maxArgs, args) {
  // last argument is expected to be a function
  const a = new Array(maxArgs)
  const idx = lastIndexOf(args, (v) => typeof v === 'function')
  const last = args.length - 1
  if (typeof args[idx] === 'function' && last > idx) {
    for (let i = idx + 1; i <= last; i++) {
      if (args[i]) {
        throw new NatsError('unknown arguments after callback', BAD_CALLBACK)
      }
    }
  }

  // found a function, at the last index
  if (idx !== -1) {
    a[maxArgs - 1] = args[idx]
    for (let i = 0; i < idx; i++) {
      a[i] = args[i]
    }
  } else {
    for (let i = 0; i < args.length; i++) {
      a[i] = args[i]
    }
  }
  return a
}
// exported only for tests
exports.callbackShifter = callbackShifter

/**
 * Strips the prefix of the request reply to derive the token.
 * This is internal and only used by the new requestOne.
 *
 * @api private
 */
Client.prototype.extractToken = function (subject) {
  return subject.substr(this.respmux.inboxPrefixLen)
}

/**
 * Creates a subscription for the global inbox in the new requestOne.
 * Request tokens, timer, and callbacks are tracked here.
 *
 * @api private
 */
Client.prototype.createResponseMux = function () {
  if (!this.respmux) {
    const inbox = this.createInbox()
    const ginbox = inbox + '.*'
    const sid = this.subscribe(ginbox, (msg, reply, subject) => {
      const token = this.extractToken(subject)
      const conf = this.getMuxRequestConfig(token)
      if (conf) {
        if (conf.callback) {
          conf.callback(msg, reply)
        }
        if (Object.hasOwnProperty.call(conf, 'expected')) {
          conf.received++
          if (conf.received >= conf.expected) {
            this.cancelMuxRequest(token)
            this.emit('unsubscribe', sid, subject)
          }
        }
      }
    })
    this.respmux = {}
    this.respmux.inbox = inbox
    this.respmux.inboxPrefixLen = inbox.length + 1
    this.respmux.subscriptionID = sid
    this.respmux.requestMap = {}
    this.respmux.nextID = -1
  }
  return this.respmux.inbox
}

/**
 * Stores the request callback and other details
 *
 * @api private
 */
Client.prototype.initMuxRequestDetails = function (callback, expected) {
  const ginbox = this.createResponseMux()
  const token = nuid.next()
  const inbox = ginbox + '.' + token

  const conf = {
    token: token,
    callback: callback,
    inbox: inbox,
    id: this.respmux.nextID--,
    received: 0
  }
  if (expected > 0) {
    conf.expected = expected
  }

  this.respmux.requestMap[token] = conf
  return conf
}

/**
 * Returns the mux request configuration
 * @param token
 * @returns Object
 */
Client.prototype.getMuxRequestConfig = function (token) {
  // if the token is a number, we have a fake sid, find the request
  if (typeof token === 'number') {
    let entry = null
    for (const p in this.respmux.requestMap) {
      if (Object.hasOwnProperty.call(this.respmux.requestMap, p)) {
        const v = this.respmux.requestMap[p]
        if (v.id === token) {
          entry = v
          break
        }
      }
    }
    if (entry) {
      // noinspection JSUnresolvedVariable
      token = entry.token
    }
  }
  return this.respmux.requestMap[token]
}

/**
 * Cancels the mux request
 *
 * @api private
 */
Client.prototype.cancelMuxRequest = function (token) {
  const conf = this.getMuxRequestConfig(token)
  if (conf) {
    if (conf.timeout) {
      clearTimeout(conf.timeout)
    }
    // the token could be sid, so use the one in the conf
    delete this.respmux.requestMap[conf.token]
  }
  return conf
}

/**
 * @deprecated
 * @api private
 */
Client.prototype.oldRequestOne = function (subject, data, options, timeout, callback) {
  // eslint-disable-next-line prefer-rest-params
  const args = callbackShifter(5, Array.prototype.slice.call(arguments))
  subject = args[0]
  data = args[1]
  options = args[2]
  timeout = args[3]
  callback = args[4]

  if (timeout === undefined && typeof options === 'number') {
    timeout = options
    options = undefined
  }

  if (timeout === undefined && options === undefined && typeof data === 'number') {
    timeout = data
    data = EMPTY
  }

  options = options || {}
  options.max = 1
  options.timeout = timeout

  const sid = this.request(subject, data, options, callback)
  this.timeout(sid, timeout, 1, function () {
    callback(new NatsError(REQ_TIMEOUT_MSG_PREFIX + sid, REQ_TIMEOUT))
  })
  return sid
}

/**
 * Report number of outstanding subscriptions on this connection.
 *
 * @return {Number}
 * @api public
 */
Client.prototype.numSubscriptions = function () {
  return Object.keys(this.subs).length
}

/**
 * Reconnect to the server.
 *
 * @api private
 */
Client.prototype.reconnect = function () {
  if (this.closed) {
    return
  }
  this.currentServer.reconnects += 1
  this.reconnects += 1
  this.createConnection()
  if (this.currentServer.didConnect === true) {
    this.emit('reconnecting')
  }
  this.currentServer.lastConnect = Date.now()
}

/**
 * Setup a timer event to attempt reconnect.
 *
 * @api private
 */
Client.prototype.scheduleReconnect = function () {
  // Just return if no more servers
  if (this.servers.length === 0) {
    return
  }
  // Don't set reconnecting state if we are just trying
  // for the first time.
  if (this.wasConnected === true) {
    this.reconnecting = true
  }
  // Only stall if we have connected before.
  let wait = 0
  if (this.servers[0].didConnect === true) {
    wait = this.options.reconnectDelayHandler()
  }
  // Select a server to connect to - this will be
  // the first server that meets the wait criteria
  const now = Date.now()
  let maxWait = wait
  for (let i = 0; i < this.servers.length; i++) {
    const srv = this.selectServer()
    if (srv.reconnects >= this.options.maxReconnectAttempts && this.options.maxReconnectAttempts !== -1) {
      // remove the server - we already tried connecting max number of times
      this.servers.pop()
      continue
    }
    if (srv.lastConnect === undefined) {
      // never connected here, try it right away
      this.reconnect()
      return
    }
    if (srv.lastConnect + wait <= now) {
      // tried before, but after the min wait, try right away
      this.reconnect()
      return
    } else {
      // find the smallest amount of time we have to wait to maybe reconnect
      const m = (srv.lastConnect + wait - now)
      if (maxWait > m) {
        maxWait = m
      }
    }
  }

  if (this.servers.length === 0) {
    // we have no more servers
    this.cleanupTimers()
    this.emit('close')
    this.close()
    return
  }
  // if we are here, we cannot yet reconnect, but can at maxWait
  setTimeout(() => {
    this.scheduleReconnect()
  }, maxWait)
}
