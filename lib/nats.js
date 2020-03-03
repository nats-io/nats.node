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

const MAX_CONTROL_LINE_SIZE = 1024

// Parser state
const AWAITING_CONTROL = 0
const AWAITING_MSG_PAYLOAD = 1

// Reconnect Parameters, 2 sec wait, 10 tries
const DEFAULT_RECONNECT_TIME_WAIT = 2 * 1000
const DEFAULT_MAX_RECONNECT_ATTEMPTS = 10

// Ping interval
const DEFAULT_PING_INTERVAL = 2 * 60 * 1000 // 2 minutes
const DEFAULT_MAX_PING_OUT = 2

const FLUSH_THRESHOLD = 65536

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
const ErrorCode = {}
exports.ErrorCode = ErrorCode
ErrorCode.BAD_AUTHENTICATION = 'BAD_AUTHENTICATION'
ErrorCode.BAD_CREDS = 'BAD_CREDENTIALS'
ErrorCode.BAD_JSON = 'BAD_JSON'
ErrorCode.BAD_MSG = 'BAD_MSG'
ErrorCode.BAD_OPTIONS = 'BAD_OPTIONS'
ErrorCode.BAD_REPLY = 'BAD_REPLY'
ErrorCode.BAD_SUBJECT = 'BAD_SUBJECT'
ErrorCode.API_ERROR = 'API_ERROR'
ErrorCode.CLIENT_CERT_REQ = 'CLIENT_CERT_REQ'
ErrorCode.CONN_CLOSED = 'CONN_CLOSED'
ErrorCode.DISCONNECT_ERR = 'DISCONNECT'
ErrorCode.CONN_DRAINING = 'CONN_DRAINING'
ErrorCode.CONN_ERR = 'CONN_ERR'
ErrorCode.CONN_TIMEOUT = 'CONN_TIMEOUT'
ErrorCode.INVALID_ENCODING = 'INVALID_ENCODING'
ErrorCode.NATS_PROTOCOL_ERR = 'NATS_PROTOCOL_ERR'
ErrorCode.NKEY_OR_JWT_REQ = 'NKEY_OR_JWT_REQ'
ErrorCode.NON_SECURE_CONN_REQ = 'NON_SECURE_CONN_REQ'
ErrorCode.NO_ECHO_NOT_SUPPORTED = 'NO_ECHO_NOT_SUPPORTED'
ErrorCode.NO_SEED_IN_CREDS = 'NO_SEED_IN_CREDS'
ErrorCode.NO_USER_JWT_IN_CREDS = 'NO_USER_JWT_IN_CREDS'
ErrorCode.OPENSSL_ERR = 'OPENSSL_ERR'
ErrorCode.PERMISSIONS_ERR = 'permissions violation'
ErrorCode.REQ_TIMEOUT = 'REQ_TIMEOUT'
ErrorCode.SECURE_CONN_REQ = 'SECURE_CONN_REQ'
ErrorCode.SIGCB_NOTFUNC = 'SIG_NOT_FUNC'
ErrorCode.SIGNATURE_REQUIRED = 'SIG_REQ'
ErrorCode.STALE_CONNECTION_ERR = 'stale connection'
ErrorCode.SUB_DRAINING = 'SUB_DRAINING'
ErrorCode.TIMEOUT_ERR = 'TIMEOUT'

const BAD_AUTHENTICATION_MSG = 'User and Token can not both be provided'
const BAD_AUTHENTICATION_TH_FAILED_MSG_PREFIX = 'tokenHandler call failed: '
const BAD_AUTHENTICATION_TH_NOT_FUNC_MSG = 'tokenHandler must be a function returning a token'
const BAD_AUTHENTICATION_T_AND_TH_MSG = 'token and tokenHandler cannot both be provided'
const BAD_CREDS_MSG = 'Bad user credentials'
const BAD_JSON_MSG = 'Message should be a non-circular JSON-serializable value'
const BAD_OPTIONS_MSG = 'Options should be an object as second parameter.'
const BAD_OPTS_MSG = 'Options must be an object'
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
const TIMEOUT_MSG = 'subscription or request timedout'

const Events = {}
Events.Error = 'error'
Events.PublishPermissionError = 'pubError'
Events.Subscribe = 'subscribe'
Events.Unsubscribe = 'unsubscribe'
Events.Reconnecting = 'reconnecting'
Events.Close = 'close'
Events.Reconnect = 'reconnect'
Events.Connect = 'connect'
Events.Disconnect = 'disconnect'

const InternalEvents = {}
InternalEvents.PingTimer = 'pingtimer'
InternalEvents.PingCount = 'pingcount'
InternalEvents.Servers = 'serversChanged'

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

  this.subs = new Subs(this)
  this.reqs = new Reqs(this)
  this.servers = new Servers(this)
  this.reconnects = 0
  this.connected = false
  this.wasConnected = false
  this.reconnecting = false
  this.pending = []
  this.pout = 0
  this.parseOptions(opts)
  // Select a server to connect to.
  this.servers.selectServer()
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
      throw new NatsError(BAD_OPTIONS_MSG, ErrorCode.BAD_OPTIONS)
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
    tls: false,
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
    this.assignOption(opts, 'noMuxRequests')
    this.assignOption(opts, 'noRandomize')
    this.assignOption(opts, 'nonceSigner')
    this.assignOption(opts, 'pass')
    this.assignOption(opts, 'pedantic')
    this.assignOption(opts, 'pingInterval')
    this.assignOption(opts, 'preserveBuffers')
    this.assignOption(opts, 'reconnect')
    this.assignOption(opts, 'reconnectTimeWait')
    this.assignOption(opts, 'servers')
    this.assignOption(opts, 'tls')
    this.assignOption(opts, 'token')
    this.assignOption(opts, 'tokenHandler')
    this.assignOption(opts, 'url')
    this.assignOption(opts, 'user')
    this.assignOption(opts, 'userCreds')
    this.assignOption(opts, 'userJWT')
    this.assignOption(opts, 'verbose')
    this.assignOption(opts, 'waitOnFirstConnect')
    this.assignOption(opts, 'yieldTime')
  }

  // Set user/pass as needed if in options.
  this.user = options.user
  this.pass = options.pass

  // Set token as needed if in options.
  this.token = options.token
  this.tokenHandler = options.tokenHandler

  // Authentication - make sure authentication is valid.
  if (this.user && this.token) {
    throw (new NatsError(BAD_AUTHENTICATION_MSG, ErrorCode.BAD_AUTHENTICATION))
  }

  if (this.tokenHandler && typeof this.tokenHandler !== 'function') {
    throw (new NatsError(BAD_AUTHENTICATION_TH_NOT_FUNC_MSG, ErrorCode.BAD_AUTHENTICATION))
  }

  if (this.tokenHandler && this.token) {
    throw (new NatsError(BAD_AUTHENTICATION_T_AND_TH_MSG, ErrorCode.BAD_AUTHENTICATION))
  }

  // Encoding - make sure its valid.
  if (Buffer.isEncoding(options.encoding)) {
    this.encoding = options.encoding
  } else {
    throw new NatsError(INVALID_ENCODING_MSG_PREFIX + options.encoding, ErrorCode.INVALID_ENCODING)
  }
  this.servers.init()

  // If we are not setup for tls, but were handed a url with a tls:// prefix
  // then upgrade to tls.
  if (options.tls === false) {
    options.tls = this.servers.hasTLS() !== undefined
  }

  if (options.timeout && typeof options.timeout !== 'number') {
    throw new NatsError('timeout should be a number', ErrorCode.BAD_OPTIONS)
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

Client.prototype.checkNoEchoMismatch = function () {
  if ((this.info.proto === undefined || this.info.proto < 1) && this.options.noEcho) {
    this.emit(Events.Error, new NatsError(NO_ECHO_NOT_SUPPORTED_MSG, ErrorCode.NO_ECHO_NOT_SUPPORTED))
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
    this.emit(Events.Error, new NatsError(SECURE_CONN_REQ_MSG, ErrorCode.SECURE_CONN_REQ))
    this.closeStream()
    return true
  }

  if (!this.info.tls_required && this.options.tls !== false) {
    this.emit(Events.Error, new NatsError(NON_SECURE_CONN_REQ_MSG, ErrorCode.NON_SECURE_CONN_REQ))
    this.closeStream()
    return true
  }

  if (this.info.tls_verify === true &&
    this.options.tls.cert === undefined) {
    this.emit(Events.Error, new NatsError(CLIENT_CERT_REQ_MSG, ErrorCode.CLIENT_CERT_REQ))
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
    this.emit(Events.Error, new NatsError(NO_USER_JWT_IN_CREDS_MSG, ErrorCode.NO_USER_JWT_IN_CREDS))
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
    this.emit(Events.Error, new NatsError(NO_SEED_IN_CREDS_MSG, ErrorCode.NO_SEED_IN_CREDS))
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
  if (this.info.nonce === undefined) {
    return false
  }

  // If this has been specified make sure we can open the file and parse it.
  if (this.options.userCreds !== undefined) {
    // Treat this as a filename.
    let contents = null
    try {
      contents = fs.readFileSync(this.options.userCreds).toString()
    } catch (err) {
      this.emit(Events.Error, new NatsError(BAD_CREDS_MSG, ErrorCode.BAD_CREDS, err))
      this.closeStream()
      return true
    }

    if (CREDS.exec(contents) === null) {
      this.emit(Events.Error, new NatsError(BAD_CREDS_MSG, ErrorCode.BAD_CREDS))
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

  if (this.options.nonceSigner === undefined) {
    this.emit(Events.Error, new NatsError(SIGNATURE_REQUIRED_MSG, ErrorCode.SIGNATURE_REQUIRED))
    this.closeStream()
    return true
  }
  if (typeof this.options.nonceSigner !== 'function') {
    this.emit(Events.Error, new NatsError(SIGCB_NOTFUNC_MSG, ErrorCode.SIGCB_NOTFUNC))
    this.closeStream()
    return true
  }
  if (this.options.nkey === undefined && this.options.userJWT === undefined) {
    this.emit(Events.Error, new NatsError(NKEY_OR_JWT_REQ_MSG, ErrorCode.NKEY_OR_JWT_REQ))
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
  const event = (wasReconnecting === true) ? Events.Reconnect : Events.Connect
  this.reconnecting = false
  this.reconnects = 0
  this.wasConnected = true
  this.servers.getCurrent().didConnect = true

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
    client.emit(InternalEvents.PingTimer)
    if (client.closed) {
      return
    }
    // we could be waiting on the socket to connect
    if (client.stream && !client.stream.connecting) {
      client.emit(InternalEvents.PingCount, client.pout)
      client.pout++
      if (client.pout > client.options.maxPingOut) {
        // processErr will scheduleReconnect
        client.processErr(ErrorCode.STALE_CONNECTION_ERR)
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
 * Properly setup a stream event handlers.
 *
 * @api private
 */
Client.prototype.setupHandlers = function () {
  const stream = this.stream

  if (undefined === stream) {
    return
  }

  if (this.options.timeout) {
    this.connectionTimeoutHandler = setTimeout(() => {
      stream.destroy(new NatsError(CONN_TIMEOUT_MSG, ErrorCode.CONN_TIMEOUT))
    }, this.options.timeout)
  }

  stream.on('connect', () => {
    this.cancelHeartbeat()
    this.connected = true
    this.scheduleHeartbeat()
  })

  stream.on('close', () => {
    const done = (this.closed === true || this.options.reconnect === false || this.servers.isEmpty())
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
              cb(new NatsError(DISCONNECT_MSG, ErrorCode.DISCONNECT_ERR))
            } catch (_) {
              // don't fail
            }
          }
        })
      }
      this.emit(Events.Disconnect)
    }
    if (done) {
      this.cleanupTimers()
      this.emit(Events.Close)
    } else {
      this.scheduleReconnect()
    }
  })

  stream.on('error', (exception) => {
    // If we were connected just return, close event will process
    if (this.wasConnected === true && this.servers.getCurrent().didConnect === true) {
      return
    }

    // if the current server did not connect at all, and we in
    // general have not connected to any server, remove it from
    // this list. Unless overridden
    if (this.wasConnected === false && this.servers.getCurrent().didConnect === false) {
      // We can override this behavior with waitOnFirstConnect, which will
      // treat it like a reconnect scenario.
      if (this.options.waitOnFirstConnect) {
        // Pretend to move us into a reconnect state.
        this.servers.getCurrent().didConnect = true
      } else {
        this.servers.remove(this.servers.getCurrent())
      }
    }

    // Only bubble up error if we never had connected
    // to the server and we only have one, and close
    if (this.wasConnected === false && this.servers.isEmpty()) {
      this.emit(Events.Error, new NatsError(CONN_ERR_MSG_PREFIX + exception, ErrorCode.CONN_ERR, exception))
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
      this.emit(Events.Error, new NatsError(BAD_AUTHENTICATION_TH_FAILED_MSG_PREFIX + err, ErrorCode.BAD_AUTHENTICATION, err))
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
  this.stream = net.createConnection(this.servers.getCurrent().url.port, this.servers.getCurrent().url.hostname)
  // this change makes it a bit faster on Linux, slightly worse on OS X
  this.stream.setNoDelay(true)
  // Setup the proper handlers.
  this.setupHandlers()
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
  if (this.subs) {
    this.subs.clearTimers()
  }
  if (this.reqs) {
    this.reqs.clearTimers()
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
    this.stream = null
  }
  if (this.connected === true || this.closed === true) {
    this.pongs = null
    this.pout = 0
    this.pending = null
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
  this.subs.getAll().forEach((s) => {
    protos += s.subCmd()
    protos += s.reUnsubCmd()
  })
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
          this.servers.processServerUpdate()

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
                this.stream = tls.connect(tlsOpts, () => {
                  this.flushPending()
                })
              } catch (error) {
                this.emit(Events.Error, new NatsError(OPENSSL_ERR_MSG_PREFIX + error, ErrorCode.OPENSSL_ERR, error))
                return
              }
              this.setupHandlers()
            }

            // Send the connect message and subscriptions immediately
            this.sendConnect()
            // add the first callback to a ping
            this.pongs.unshift(() => {
              // this gets called when the first pong is received by the connection
              // if we have a connection timeout timer, remove it
              if (this.connectionTimeoutHandler) {
                clearTimeout(this.connectionTimeoutHandler)
                delete this.connectionTimeoutHandler
              }
              // send any subscriptions, and strip pending
              this.sendSubscriptions()
              this.stripPendingSubs()
              // reset the reconnects for this server
              this.servers.getCurrent().reconnects = 0
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
    if (m && !this.closed) {
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
 * Process a delivered message and deliver to appropriate subscriber.
 *
 * @api private
 */
Client.prototype.processMsg = function () {
  const sub = this.subs.get(this.payload.sid)
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
        sub.unsubscribe()
      } else if (sub.received > sub.max) {
        sub.unsubscribe()
        sub.callback = null
      }
    }

    if (sub.callback) {
      let err = null
      let msg = this.payload.msg
      if (this.options.json) {
        try {
          if (this.options.preserveBuffers) {
            msg = JSON.parse(this.payload.msg.toString())
          } else {
            msg = JSON.parse(this.payload.msg.toString(this.options.encoding))
          }
        } catch (e) {
          err = e
        }
      }
      try {
        const v = new Msg(this, this.payload.subj, this.payload.reply, msg, this.payload.sid)
        sub.callback(err, v)
      } catch (error) {
        this.emit(Events.Error, error)
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
  if (m.indexOf(ErrorCode.STALE_CONNECTION_ERR) !== -1) {
    // closeStream() triggers a reconnect if allowed
    this.closeStream()
    return true
  } else if (m.indexOf(ErrorCode.PERMISSIONS_ERR) !== -1) {
    this.dispatchPermissionError(s)
    return false
  } else if (m.indexOf('authorization violation') !== -1) {
    this.emit(Events.Error, new NatsError(s, ErrorCode.BAD_AUTHENTICATION))
    this.closeStream()
    return true
  } else {
    this.emit(Events.Error, new NatsError(s, ErrorCode.NATS_PROTOCOL_ERR))
    this.closeStream()
    return true
  }
}

Client.prototype.dispatchPermissionError = function (srvError) {
  const err = new NatsError(srvError, ErrorCode.PERMISSIONS_ERR)
  const m = srvError.match(/^'Permissions Violation for (Subscription|Publish) to "(.+)"'/)
  let sub
  if (m) {
    switch (m[1]) {
      case 'Subscription':
        sub = this.subs.getBySubject(m[2])
        if (sub) {
          sub.callback(err)
          sub.unsubscribe()
        }
        break
      case 'Publish':
        this.emit(Events.PublishPermissionError, err)
        break
    }
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
      callback(new NatsError(CONN_CLOSED_MSG, ErrorCode.CONN_CLOSED))
      return
    } else {
      throw (new NatsError(CONN_CLOSED_MSG, ErrorCode.CONN_CLOSED))
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
  const subs = this.subs.getAll()
  const drains = []

  const errs = []
  subs.forEach((sub) => {
    sub.doDrain((err) => {
      if (err) {
        errs.push(err)
      }
      drains.push(sub)
      if (drains.length === subs.length) {
        this.noMorePublishing = true
        this.flush(() => {
          this.emit(Events.Close)
          this.close()
          if (typeof callback === 'function') {
            errs.forEach((e, i) => {
              errs[i] = e.toString()
            })
            let e = null
            if (errs.length > 0) {
              e = new Error('errors while draining:\n' + errs.join(('\n')))
            }
            callback(e)
          }
        })
      }
    })
  })
  // no subscriptions
  if (subs.length === 0) {
    this.noMorePublishing = true
    this.emit(Events.Close)
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
    this.dispatchError(callback, new NatsError(CONN_CLOSED_MSG, ErrorCode.CONN_CLOSED))
    return true
  }
  if (this.draining) {
    this.dispatchError(callback, new NatsError(CONN_DRAINING_MSG, ErrorCode.CONN_DRAINING))
    return true
  }
  return false
}

/**
 * @api private
 */
Client.prototype.handledSubArgErrors = function (subject, callback, opts) {
  if (typeof callback !== 'function') {
    throw new NatsError('requests require a callback', ErrorCode.API_ERROR)
  }
  if (typeof subject !== 'string' || subject === '') {
    this.dispatchError(callback, new NatsError(`bad subject: '${subject}'`, ErrorCode.BAD_SUBJECT))
    return true
  }
  if (this.handledClosedOrDraining(callback)) {
    return true
  }
  if (typeof opts !== 'object') {
    this.dispatchError(callback, new NatsError(BAD_OPTS_MSG, ErrorCode.BAD_OPTIONS))
    return true
  }
  return false
}

/**
 * @api private
 */
Client.prototype.handledPubArgErrors = function (subject, reply, data, callback) {
  if (callback && typeof callback !== 'function') {
    throw new NatsError('callback must be a function', ErrorCode.API_ERROR)
  }
  if (data && typeof data === 'function') {
    this.dispatchError(callback, new NatsError('data cannot be a function', ErrorCode.API_ERROR))
    return true
  }
  if (typeof subject !== 'string' || subject === '') {
    this.dispatchError(callback, new NatsError(`bad subject: '${subject}'`, ErrorCode.BAD_SUBJECT))
    return true
  }
  if (reply !== '' && typeof reply !== 'string') {
    this.dispatchError(callback, new NatsError(`bad reply subject: '${subject}'`, ErrorCode.BAD_SUBJECT))
    return true
  }
  return this.handledClosedOrDraining(callback)
}

/**
 * Publish a request a message to the given subject, with specified reply and callback.
 *
 * @param {String} subject
 * @param {String} [reply]
 * @param {String | Buffer | Object} [data]
 * @param {Function} callback
 * @api public
 * @throws NatsError (CONN_CLOSED, CONN_DRAINING, BAD_SUBJECT)
 */
Client.prototype.publishRequest = function (subject, reply, data, callback) {
  if (reply === '' || typeof reply !== 'string') {
    this.dispatchError(callback, new NatsError(`bad reply subject: '${subject}'`, ErrorCode.BAD_SUBJECT))
    return false
  }
  if (this.doPublish(subject, reply, data, callback) && callback) {
    this.flush(callback)
  }
}

/**
 * @param {String} subject
 * @param {String | Buffer | Object} [data]
 * @param {Function} callback
 */
Client.prototype.publish = function (subject, data, callback) {
  if (this.doPublish(subject, '', data, callback) && callback) {
    this.flush(callback)
  }
}

/**
 * @api private
 */
Client.prototype.doPublish = function (subject, reply, data, callback) {
  if (this.handledPubArgErrors(subject, reply, data, callback)) {
    return false
  }
  if (!this.options.json) {
    data = data || EMPTY
  } else {
    // undefined is not a valid JSON-serializable value, but null is
    data = data === undefined ? null : data
  }

  let psub
  if (!reply) {
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
        this.dispatchError(callback, new NatsError(BAD_JSON_MSG, ErrorCode.BAD_JSON))
        return false
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
  return true
}

/**
 * @api private
 */
Client.prototype.dispatchError = function (callback, err) {
  if (callback && typeof callback === 'function') {
    callback(err)
  } else {
    throw err
  }
}

/**
 * Subscribe to a given subject, with optional options and callback. opts can be
 * ommitted, even with a callback. The Subscriber Id is returned.
 *
 * @param {String} subject
 * @param {Object} [opts]
 * @param {Function} callback - callback arguments are data, reply subject (may be undefined), and subscription id
 * @return {Object | undefined}
 * @api public
 */
Client.prototype.subscribe = function (subject, callback, opts) {
  opts = opts || {}
  if (this.handledSubArgErrors(subject, callback, opts)) {
    return undefined
  }
  return this.subs.addSubscription(subject, callback, opts)
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
 * @param {Object} [opts]
 * @param {Function} [callback]
 * @return {Request}
 * @api public
 */
Client.prototype.request = function (subject, callback, data, opts) {
  opts = opts || {}
  if (this.handledSubArgErrors(subject, callback, opts)) {
    return null
  }
  if (!opts.max) {
    opts.max = 1
  }
  if (this.options.noMuxRequests) {
    opts.expected = opts.expected || opts.max
    const inbox = this.createInbox()
    const sub = this.subscribe(inbox, callback, opts)
    this.doPublish(subject, inbox, data)
    return new Req(sub.nc, sub.sid, inbox, callback, opts, sub)
  } else {
    const req = this.reqs.addRequest(callback, opts)
    this.doPublish(subject, req.subject, data)
    return req
  }
}

/**
 * Report number of outstanding subscriptions on this connection.
 *
 * @return {Number}
 * @api public
 */
Client.prototype.numSubscriptions = function () {
  return this.subs.length
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
  this.servers.getCurrent().reconnects += 1
  this.reconnects += 1
  this.createConnection()
  if (this.servers.getCurrent().didConnect === true) {
    this.emit(Events.Reconnecting)
  }
  this.servers.getCurrent().lastConnect = Date.now()
}

/**
 * Setup a timer event to attempt reconnect.
 *
 * @api private
 */
Client.prototype.scheduleReconnect = function () {
  // Just return if no more servers
  if (this.servers.isEmpty()) {
    return
  }
  // Don't set reconnecting state if we are just trying
  // for the first time.
  if (this.wasConnected === true) {
    this.reconnecting = true
  }
  // Only stall if we have connected before.
  let wait = 0
  if (this.servers.peek().didConnect === true) {
    wait = this.options.reconnectTimeWait
  }
  // Select a server to connect to - this will be
  // the first server that meets the reconnectTimeWait criteria
  const now = Date.now()
  let maxWait = wait
  for (let i = 0; i < this.servers.length(); i++) {
    const srv = this.servers.selectServer()
    if (srv.reconnects >= this.options.maxReconnectAttempts && this.options.maxReconnectAttempts !== -1) {
      // remove the server - we already tried connecting max number of times
      this.servers.remove(srv)
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

  if (this.servers.isEmpty()) {
    // we have no more servers
    this.cleanupTimers()
    this.emit(Events.Close)
    this.close()
    return
  }
  // if we are here, we cannot yet reconnect, but can at maxWait
  setTimeout(() => {
    this.scheduleReconnect()
  }, maxWait)
}

function Subs (nc) {
  this.sids = 0
  this.nc = nc
  this.sidToSub = {}
  this.length = 0
}

Subs.prototype.addSubscription = function (subject, callback, opts) {
  this.sids++
  const sid = this.sids
  const sub = new Sub(this.nc, sid, subject, callback, opts)
  this.sidToSub[sid] = sub
  this.length++

  this.nc.sendCommand(sub.subCmd())
  if (sub.getMax() > 0) {
    sub.unsubscribe(sub.getMax())
  }
  this.nc.emit(Events.Subscribe, { sid: sub.sid, subject: sub.subject, queue: sub.queue })
  return sub
}

Subs.prototype.remove = function (sub) {
  if (sub) {
    if (sub.timeout) {
      clearTimeout(sub.timeout)
      sub.timeout = null
    }
    delete this.sidToSub[sub.sid]
    sub.closed = true
    this.length--
    this.nc.emit(Events.Unsubscribe, { sid: sub.sid, subject: sub.subject, queue: sub.queue })
  }
}

Subs.prototype.get = function (sid) {
  return this.sidToSub[sid]
}

Subs.prototype.getAll = function () {
  const a = []
  for (const p in this.sidToSub) {
    if (Object.hasOwnProperty.call(this.sidToSub, p)) {
      const sub = this.sidToSub[p]
      a.push(sub)
    }
  }
  return a
}

Subs.prototype.getBySubject = function (subj) {
  return this.getAll().find((e) => {
    return subj === e.subject
  })
}

Subs.prototype.clearTimers = function () {
  this.getAll().forEach((s) => {
    s.cancelTimeout()
  })
}

function Sub (nc, sid, subject, callback, opts) {
  this.nc = nc
  this.closed = false
  this.sid = sid
  this.subject = subject
  this.callback = callback
  this.received = 0
  this.queue = opts.queue || null
  this.max = opts.max || undefined
  if (opts.timeout) {
    this.setTimeout(opts.timeout, opts.expected)
  }
}

Sub.prototype.unsubscribe = function (max) {
  if (this.nc.closed) {
    return
  }
  if (!this.closed) {
    this.max = max
    this.nc.sendCommand(this.unsubCmd())
    if (this.max === undefined || (this.received >= this.max)) {
      this.nc.subs.remove(this)
    }
  }
}

Sub.prototype.drain = function (callback) {
  if (this.nc.handledClosedOrDraining(callback)) {
    return
  }
  this.doDrain(callback)
}

// internal sub drain doesn't check if the connection
// is draining as this is the method used to drain the connection
Sub.prototype.doDrain = function (callback) {
  if (this.closed) {
    if (typeof callback === 'function') {
      callback()
    }
    return
  }
  if (this.draining) {
    if (typeof callback === 'function') {
      callback(new NatsError(SUB_DRAINING_MSG, ErrorCode.SUB_DRAINING))
    } else {
      throw (new NatsError(SUB_DRAINING_MSG, ErrorCode.SUB_DRAINING))
    }
    return
  }
  this.draining = true
  this.nc.sendCommand(this.unsubCmd())
  this.nc.flush((err) => {
    this.nc.subs.remove(this)
    if (typeof callback === 'function') {
      callback(err)
    }
  })
}

Sub.prototype.hasTimeout = function () {
  return !this.closed && this.timeout
}

Sub.prototype.cancelTimeout = function () {
  if (!this.closed && this.timeout) {
    clearTimeout(this.timeout)
    delete this.timeout
    delete this.expected
    return true
  }
  return false
}

Sub.prototype.setTimeout = function (millis, max) {
  this.cancelTimeout()
  if (!this.closed) {
    this.expected = (max || 1)
    this.timeout = setTimeout(() => {
      this.unsubscribe()
      this.nc.dispatchError(this.callback, new NatsError(TIMEOUT_MSG, ErrorCode.TIMEOUT_ERR))
    }, millis)
    return true
  }
  return false
}

Sub.prototype.getReceived = function () {
  return this.received
}

Sub.prototype.getMax = function () {
  if (!this.closed) {
    return this.max || -1
  }
  return -1
}

Sub.prototype.isCancelled = function () {
  return this.closed
}

Sub.prototype.isDraining = function () {
  return !this.closed && this.draining
}

Sub.prototype.getID = function () {
  return this.sid
}

Sub.prototype.subCmd = function () {
  if (this.queue) {
    return [SUB, this.subject, this.queue, this.sid + CR_LF].join(SPC)
  }
  return [SUB, this.subject, this.sid + CR_LF].join(SPC)
}

Sub.prototype.reUnsubCmd = function () {
  if (this.max) {
    const max = this.max - this.received
    if (max > 0) {
      return [UNSUB, this.sid, max + CR_LF].join(SPC)
    }
    return [UNSUB, this.sid + CR_LF].join(SPC)
  }
  return ''
}

Sub.prototype.unsubCmd = function () {
  if (this.max) {
    return [UNSUB, this.sid, this.max + CR_LF].join(SPC)
  }
  return [UNSUB, this.sid + CR_LF].join(SPC)
}

function Reqs (nc) {
  this.sids = 0
  this.nc = nc
  this.inbox = this.nc.createInbox()
  this.inboxPrefixLen = this.inbox.length + 1
  this.tokenToReq = {}
  this.length = 0
  this.sub = null
}

Reqs.prototype.init = function () {
  if (this.sub === null) {
    this.sub = this.nc.subscribe(`${this.inbox}.*`, (err, m) => {
      const token = this.extractToken(m.subject)
      const req = this.get(token)
      if (req) {
        req.received++
        if (req.callback && typeof req.callback === 'function') {
          req.callback(err, m)
        }
        if (Object.hasOwnProperty.call(req, 'max')) {
          if (req.received >= req.max) {
            req.cancel()
          }
        }
      }
    })
  }
}

Reqs.prototype.clearTimers = function () {
  this.getAll().forEach((s) => {
    s.cancel()
  })
}

Reqs.prototype.addRequest = function (callback, opts) {
  // insure we have a subscription
  this.init()

  this.sids--
  const token = nuid.next()
  const subject = `${this.inbox}.${token}`
  const sid = this.sids
  const req = new Req(this.nc, sid, subject, token, callback, opts)
  this.tokenToReq[token] = req
  this.length++

  if (opts.timeout) {
    req.timeout = setTimeout(() => {
      if (req.callback) {
        req.callback(new NatsError(REQ_TIMEOUT_MSG_PREFIX + req.sid, ErrorCode.REQ_TIMEOUT))
      }
      this.nc.reqs.remove(req)
    }, opts.timeout)
  }
  return req
}

Reqs.prototype.remove = function (req) {
  if (req) {
    if (req.timeout) {
      clearTimeout(req.timeout)
      req.timeout = null
    }
    delete this.tokenToReq[req.token]
    req.closed = true
    this.length--
    this.nc.emit(Events.Unsubscribe, { sid: req.sid, subject: req.subject })
  }
}

Reqs.prototype.extractToken = function (s) {
  return s.substr(this.inboxPrefixLen)
}

Reqs.prototype.get = function (token) {
  return this.tokenToReq[token]
}

Reqs.prototype.getAll = function () {
  const a = []
  for (const p in this.tokenToReq) {
    if (Object.hasOwnProperty.call(this.tokenToReq, p)) {
      const req = this.tokenToReq[p]
      a.push(req)
    }
  }
  return a
}

function Req (nc, sid, subject, token, callback, opts, sub) {
  this.nc = nc
  this.sid = sid
  this.closed = false
  this.subject = subject
  this.token = token
  this.callback = callback
  this.received = 0
  this.max = opts.max || undefined
  this.sub = sub
}

Req.prototype.cancel = function () {
  if (this.nc.closed) {
    return
  }
  if (!this.closed) {
    if (this.sub) {
      this.sub.unsubscribe()
    } else {
      this.nc.reqs.remove(this)
    }
  }
}

function Msg (nc, subject, reply, data, sid) {
  this.nc = nc
  this.subject = subject
  this.reply = reply
  this.data = data
  this.sid = sid
}

Msg.prototype.respond = function (data) {
  this.nc.publish(this.reply, data)
}

function Servers (nc) {
  this.nc = nc
  this.pool = []
  this.current = null
}

Servers.prototype.init = function () {
  if (Array.isArray(this.nc.options.servers)) {
    this.nc.options.servers.forEach((u) => {
      this.pool.push(new Server(new url.URL(u)))
    })
    // Randomize if needed
    if (this.nc.options.noRandomize !== true) {
      this.shuffle()
    }
    // if they gave an URL we should add it if different
    if (this.nc.options.url !== undefined && this.pool.indexOf(this.nc.options.url) === -1) {
      // Make url first element so it is attempted first
      this.pool.unshift(new Server(new url.URL(this.nc.options.url)))
    }
  } else {
    if (this.nc.options.url === undefined) {
      this.nc.options.url = DEFAULT_URI
    }
    this.pool.push(new Server(new url.URL(this.nc.options.url)))
  }
}

Servers.prototype.selectServer = function () {
  const server = this.pool.shift()

  // Place in client context.
  this.current = server
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
      if (this.nc.options.user === undefined) {
        this.nc.user = auth[0]
      }
      if (this.nc.options.pass === undefined) {
        this.nc.pass = auth[1]
      }
    } else {
      if (this.nc.options.token === undefined) {
        this.nc.token = auth[0]
      }
    }
  }
  this.pool.push(server)
  return server
}

Servers.prototype.processServerUpdate = function () {
  // noinspection JSUnresolvedVariable
  if (this.nc.info.connect_urls && this.nc.info.connect_urls.length > 0) {
    // parse the infos
    const tmp = {}
    this.nc.info.connect_urls.forEach((server) => {
      const u = 'nats://' + server
      const s = new Server(new url.URL(u))
      // implicit servers are ones added via the info connect_urls
      s.implicit = true
      tmp[s.url.href] = s
    })

    // remove implicit servers that are no longer reported
    const deleted = []
    const toDelete = []
    this.pool.forEach((s, index) => {
      const u = s.url.href
      if (s.implicit && this.current.url.href !== u && tmp[u] === undefined) {
        // server was removed
        deleted.push(u)
        toDelete.push(index)
      }
      // remove this entry from reported
      delete tmp[u]
    })

    // perform the deletion
    toDelete.reverse()
    toDelete.forEach((index) => {
      this.pool.splice(index, 1)
    })

    // remaining servers are new
    const newURLs = []
    for (const k in tmp) {
      if (Object.hasOwnProperty.call(tmp, k)) {
        this.pool.push(tmp[k])
        newURLs.push(k)
      }
    }

    if (newURLs.length || deleted.length) {
      const evt = { added: newURLs, deleted: deleted }
      this.nc.emit(InternalEvents.Servers, evt)
    }
  }
}

Servers.prototype.add = function (uri) {
  this.pool.push(new Server(new url.URL(uri)))

  if (this.nc.options.noRandomize !== true) {
    this.shuffle()
  }
}

Servers.prototype.length = function () {
  return this.pool.length
}

Servers.prototype.peek = function () {
  return this.pool[0]
}

Servers.prototype.hasTLS = function () {
  this.pool.find((s) => {
    return (s.url.protocol === 'tls' || s.url.protocol === 'tls:')
  })
}

Servers.prototype.remove = function (s) {
  this.pool = this.pool.filter((t) => {
    return t !== s
  })
}

Servers.prototype.getAll = function () {
  return this.pool
}

Servers.prototype.isEmpty = function () {
  return this.pool.length === 0
}

Servers.prototype.getCurrent = function () {
  return this.current
}

Servers.prototype.shuffle = function () {
  for (let i = this.pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const temp = this.pool[i]
    this.pool[i] = this.pool[j]
    this.pool[j] = temp
  }
}
