/*!
 * Nats
 * Copyright(c) 2011,2012 Derek Collison (derek.collison@gmail.com)
 * MIT Licensed
 */

/**
 * Module Dependencies
 */

var net    = require('net'),
    url    = require('url'),
    util   = require('util'),
    events = require('events');

/**
 * Constants
 */

var VERSION = '0.2.5',

    DEFAULT_PORT = 4222,
    DEFAULT_PRE  = 'nats://localhost:',
    DEFAULT_URI  =  DEFAULT_PRE + DEFAULT_PORT,

    MAX_CONTROL_LINE_SIZE = 512,

    // Parser state
    AWAITING_CONTROL = 0,
    AWAITING_MSG_PAYLOAD = 1,

    // Reconnect Parameters, 2 sec wait, 10 tries
    DEFAULT_RECONNECT_TIME_WAIT = 2*1000,
    DEFAULT_MAX_RECONNECT_ATTEMPTS = 10,

    // Protocol
    CONTROL_LINE = /^(.*)\r\n/,

    MSG  = /^MSG\s+([^\s\r\n]+)\s+([^\s\r\n]+)\s+(([^\s\r\n]+)[^\S\r\n]+)?(\d+)\r\n/i,
    OK   = /^\+OK\s*\r\n/i,
    ERR  = /^-ERR\s+('.+')?\r\n/i,
    PING = /^PING\r\n/i,
    PONG = /^PONG\r\n/i,
    INFO = /^INFO\s+([^\r\n]+)\r\n/i,

    CR_LF = '\r\n',
    CR_LF_LEN = CR_LF.length,
    EMPTY = '',
    SPC = ' ',

    // Protocol
    PUB     = 'PUB',
    SUB     = 'SUB',
    UNSUB   = 'UNSUB',
    CONNECT = 'CONNECT',

    // Responses
    PING_REQUEST  = 'PING' + CR_LF,
    PONG_RESPONSE = 'PONG' + CR_LF,

    EMPTY = '',

    // Pedantic Mode support
    Q_SUB = /^([^\.\*>\s]+|>$|\*)(\.([^\.\*>\s]+|>$|\*))*$/,
    Q_SUB_NO_WC = /^([^\.\*>\s]+)(\.([^\.\*>\s]+))*$/;

    FLUSH_THRESHOLD = 65536,

/**
 * Library Version
 */

exports.version = VERSION;

/**
 * Generate random hex strings for createInbox.
 *
 * @api private
*/

function hexRand(limit) {
  return (parseInt(Math.random()*limit, 16).toString(16));
}

/**
 * Create a properly formatted inbox subject.
 *
 * @api public
*/

var createInbox = exports.createInbox = function() {
  return ('_INBOX.' +
          hexRand(0x0010000) +
          hexRand(0x0010000) +
          hexRand(0x0010000) +
          hexRand(0x0010000) +
          hexRand(0x1000000));
}

/**
 * Initialize a client with the appropriate options.
 *
 * @param {Mixed} opts
 * @api public
 */

function Client(opts) {
  events.EventEmitter.call(this);
  this.parseOptions(opts);
  this.initState();
  this.createConnection();
}

/**
 * Connect to a nats-server and return the client.
 * Argument can be a url, or an object with a 'url'
 * property and additional options.
 *
 * @params {Mixed} opts
 *
 * @api public
 */

var connect = exports.connect = function(opts) {
  return new Client(opts);
}

/**
 * Connected clients are event emitters.
 */

util.inherits(Client, events.EventEmitter);

/**
 * Allow createInbox to be called on a client.
 *
 * @api public
 */

Client.prototype.createInbox = createInbox;

Client.prototype.assignOption = function(opts, prop, assign) {
  if (assign === undefined) {
    assign = prop;
  }
  if (opts[prop] !== undefined) {
    this.options[assign] = opts[prop];
  }
};

/**
 * Parse the conctructor/connect options.
 *
 * @param {Mixed} opts
 * @api private
 */

Client.prototype.parseOptions = function(opts) {
  var options = this.options = {
    'url'                  : DEFAULT_URI,
    'verbose'              : false,
    'pedantic'             : false,
    'reconnect'            : true,
    'maxReconnectAttempts' : DEFAULT_MAX_RECONNECT_ATTEMPTS,
    'reconnectTimeWait'    : DEFAULT_RECONNECT_TIME_WAIT
  };
  if ('number' === typeof opts) {
    options.url = DEFAULT_PRE + opts;
  } else if ('string' === typeof opts) {
    options.url = opts;
  } else if ('object' === typeof opts) {
    if (opts.port !== undefined) {
      options.url = DEFAULT_PRE + opts.port;
    }
    // Pull out various options here
    this.assignOption(opts, 'url');
    this.assignOption(opts, 'uri', 'url');
    this.assignOption(opts, 'user');
    this.assignOption(opts, 'pass');
    this.assignOption(opts, 'password', 'pass');
    this.assignOption(opts, 'verbose');
    this.assignOption(opts, 'pedantic');
    this.assignOption(opts, 'reconnect');
    this.assignOption(opts, 'maxReconnectAttempts');
    this.assignOption(opts, 'reconnectTimeWait');
  }
  options.uri = options.url;

  if (options.url !== undefined) {
    // Parse the url
    this.url = url.parse(options.url);
    if (this.url.auth !== undefined) {
      var auth = this.url.auth.split(':');
      if (options.user === undefined) {
        options.user = auth[0];
      }
      if (options.pass === undefined) {
        options.pass = auth[1];
      }
    }
  }
}

/**
 * Properly setup a stream connection with proper events.
 *
 * @api private
*/

Client.prototype.createConnection = function() {
  var client = this;

  client.pongs   = [];
  client.pending = [];
  client.pSize   = 0;
  client.pstate  = AWAITING_CONTROL;

  var stream = client.stream = net.createConnection(client.url.port, client.url.hostname);

  stream.on('connect', function() {
    var wasReconnecting = client.reconnecting;
    var event = wasReconnecting === true ? 'reconnect' : 'connect';
    client.connected = true;
    client.reconnecting = false;
    client.reconnects = 0;
    client.flushPending();
    if (wasReconnecting) {
      client.sendSubscriptions();
    }
    client.flush(function() {
      client.emit(event, client);
    });
  });

  // FIXME, use close event?
  stream.on('close', function(hadError) {
    if (hadError) { return; }
    client.closeStream();
    client.emit('disconnect');
    if (client.closed === true ||
        client.options.reconnect === false ||
        client.reconnects >= client.options.maxReconnectAttempts) {
      client.emit('close');
    } else {
      client.scheduleReconnect();
    }
  });

  stream.on('error', function(exception) {
    client.closeStream();

    if (client.reconnecting === false) {
      client.emit('error', exception);
    }
    client.emit('disconnect');

    if (client.reconnecting === true) {
      if (client.closed === true ||
	  client.reconnects >= client.options.maxReconnectAttempts) {
        client.emit('close');
      } else {
        client.scheduleReconnect();
      }
    }
  });

  stream.on('data', function (data) {
    var m;

    client.inbound = client.inbound ? client.inbound + data : data;

    while (!client.closed && client.inbound && client.inbound.length > 0) {
      switch (client.pstate) {
      case AWAITING_CONTROL:
        if (m = MSG.exec(client.inbound)) {
          client.payload = {
	    subj : m[1],
	    sid : m[2],
	    reply : m[4],
	    size : parseInt(m[5], 10)
	  }
          client.pstate = AWAITING_MSG_PAYLOAD;
        } else if (m = OK.exec(client.inbound)) {
          // Ignore for now..
        } else if (m = ERR.exec(client.inbound)) {
          client.emit('error', m[1]);
        } else if (m = PONG.exec(client.inbound)) {
          var cb = client.pongs.shift()
          if (cb) cb();
        } else if (m = PING.exec(client.inbound)) {
          this.send_command(PONG_RESPONSE);
        } else if (m = INFO.exec(client.inbound)) {
          // Nothing for now..
        } else {
          // FIXME, check line length for something weird.
          // Nothing here yet, return
          return;
        }
        break;

      case AWAITING_MSG_PAYLOAD:

        if (client.inbound.length < client.payload.size + CR_LF_LEN) {
	  return;
	}

	// FIXME, may be inefficient.
        client.payload.msg = client.inbound.slice(0, client.payload.size).toString();

        if (client.inbound.length == client.payload.size + CR_LF_LEN) {
          client.inbound = null;
        } else {
          client.inbound = client.inbound.slice(client.payload.size + CR_LF_LEN);
        }
        // process the message
        client.processMsg();
      }

      if (m) {
        // Chop inbound
        var psize = m[0].length;
        if (psize >= client.inbound.length) {
          client.inbound = null;
        } else {
          client.inbound = client.inbound.slice(psize);
        }
      }
      m = null;
    }
  });

  // Queue the connect command.
  var cs = { 'verbose':this.options.verbose, 'pedantic':this.options.pedantic };
  if (this.options.user !== undefined) {
    cs.user = this.options.user;
    cs.pass = this.options.pass;
  }
  this.sendCommand(CONNECT + SPC + JSON.stringify(cs) + CR_LF);
}

/**
 * Initialize client state.
 *
 * @api private
 */

Client.prototype.initState = function() {
  this.ssid         = 1;
  this.subs         = {};
  this.reconnects   = 0;
  this.connected    = false;
  this.reconnecting = false;
}

/**
 * Close the connection to the server.
 *
 * @api public
 */

Client.prototype.close = function() {
  this.closed = true;
  this.removeAllListeners();
  this.closeStream();
  this.ssid     = -1;
  this.subs     = null;
  this.pstate   = -1;
  this.pongs    = null;
  this.pending  = null;
  this.pSize    = 0;
}

/**
 * Close down the stream and clear state.
 *
 * @api private
 */

Client.prototype.closeStream = function() {
  if (this.stream != null) {
    this.stream.end();
    this.stream.destroy();
    this.stream  = null;
  }
  if (this.connected === true || this.closed === true) {
    this.pongs     = null;
    this.pending   = null;
    this.pSize     = 0;
    this.connected = false;
  }
}

/**
 * Flush all pending data to the server.
 *
 * @api private
 */

Client.prototype.flushPending = function() {
  if (this.connected === false ||
      this.pending == null ||
      this.pending.length === 0) { return; }

  this.stream.write(this.pending.join(EMPTY));
  this.pending = [];
  this.pSize   = 0;
}

/**
 * Send commands to the server or queue them up if connection pending.
 *
 * @api private
 */

Client.prototype.sendCommand = function(cmd) {
  // Buffer to cut down on system calls, increase throughput.
  // When receive gets faster, should make this Buffer based..

  if (this.closed || this.pending == null) { return; }

  this.pending.push(cmd);
  this.pSize += Buffer.byteLength(cmd);

  if (this.connected === true) {
    // First one let's setup flush..
    if (this.pending.length === 1) {
      var self = this;
      process.nextTick(function() {
	self.flushPending();
      });
    } else if (this.pSize > FLUSH_THRESHOLD) {
      // Flush in place when threshold reached..
      this.flushPending();
    }
  }

}

/**
 * Sends existing subscriptions to new server after reconnect.
 *
 * @api private
 */

Client.prototype.sendSubscriptions = function() {
  var proto;
  for(var sid in this.subs) {
    var sub = this.subs[sid];
    if (sub.qgroup) {
      proto = [SUB, sub.subject, sub.qgroup, sid + CR_LF];
    } else {
      proto = [SUB, sub.subject, sid + CR_LF];
    }
    this.sendCommand(proto.join(SPC));
  }
}

/**
 * Process a delivered message and deliver to appropriate subscriber.
 *
 * @api private
 */

Client.prototype.processMsg = function() {
  var sub = this.subs[this.payload.sid];
  if (sub != null) {
    sub.received += 1;
    // Check for a timeout, and cancel if received >= expected
    if (sub.timeout) {
      if (sub.received >= sub.expected) {
        clearTimeout(sub.timeout);
        sub.timeout = null;
      }
    }
    // Check for auto-unsubscribe
    if (sub['max'] && sub.received > sub.max) {
      this.unsubscribe(this.payload.sid);
    } else if (sub.callback) {
      sub.callback(this.payload.msg, this.payload.reply, this.payload.subj);
    }
  }
  this.pstate = AWAITING_CONTROL;
  this.payload = null;
}

/**
 * Flush outbound queue to server and call optional callback when server has processed
 * all data.
 *
 * @param {Function} opt_callback
 * @api public
 */

Client.prototype.flush = function(opt_callback) {
  if (typeof opt_callback === 'function') {
    this.pongs.push(opt_callback);
    this.sendCommand(PING_REQUEST);
  }
}

/**
 * Publish a message to the given subject, with optional reply and callback.
 *
 * @param {String} subject
 * @param {String} msg
 * @param {String} opt_reply
 * @param {Function} opt_callback
 * @api public
 */

Client.prototype.publish = function(subject, msg, opt_reply, opt_callback) {
  if (!msg) msg = EMPTY;
  if (typeof msg == 'function') {
    if (opt_callback || opt_reply) throw(new Error("Message can't be a function"));
    opt_callback = msg;
    msg = EMPTY;
    opt_reply = undefined;
  }
  if (typeof opt_reply == 'function') {
    if (opt_callback) throw(new Error("Reply can't be a function"));
    opt_callback = opt_reply;
    opt_reply = undefined;
  }

  var proto = [PUB, subject];
  var msg = [Buffer.byteLength(msg), CR_LF, msg, CR_LF];

  if (opt_reply !== undefined) {
    proto.push(opt_reply);
  }

  this.sendCommand(proto.concat(msg.join(EMPTY)).join(SPC));

  if (opt_callback !== undefined) {
    this.flush(opt_callback);
  }
}

/**
 * Subscribe to a given subject, with optional options and callback. opts can be
 * ommitted, even with a callback. The Subscriber Id is returned.
 *
 * @param {String} subject
 * @param {Object} opts
 * @param {Function} callback
 * @return {Mixed}
 * @api public
 */

Client.prototype.subscribe = function(subject, opts, callback) {
  var qgroup, max;
  if (typeof opts == 'function') {
    callback = opts;
    opts = null;
  } else if (opts && typeof opts == 'object') {
    // FIXME, check exists, error otherwise..
    qgroup = opts['queue'];
    max = opts['max'];
  }
  this.ssid += 1;
  this.subs[this.ssid] = { 'subject':subject, 'callback':callback, 'received':0 }

  var proto;
  if (typeof qgroup == 'string') {
    this.subs[this.ssid].qgroup = qgroup;
    proto = [SUB, subject, qgroup, this.ssid + CR_LF];
  } else {
    proto = [SUB, subject, this.ssid + CR_LF];
  }
  this.sendCommand(proto.join(SPC));

  if (max) {
    this.unsubscribe(this.ssid, max);
  }
  return this.ssid;
}

/**
 * Unsubscribe to a given Subscriber Id, with optional max parameter.
 *
 * @param {Mixed} sid
 * @param {Number} opt_max
 * @api public
 */

Client.prototype.unsubscribe = function(sid, opt_max) {
  if (!sid) { return; }

  var proto;
  if (opt_max) {
    proto = [UNSUB, sid, opt_max + CR_LF];
  } else {
    proto = [UNSUB, sid + CR_LF];
  }
  this.sendCommand(proto.join(SPC));

  var sub = this.subs[sid];
  if (sub == null) {
    return;
  }
  sub['max'] = opt_max;
  if (sub['max'] === undefined || (sub.received >= sub.max)) {
    delete this.subs[sid];
  }
}

/**
 * Set a timeout on a subscription.
 *
 * @param {Mixed} sid
 * @param {Number} timeout
 * @param {Number} expected
 * @api public
 */

Client.prototype.timeout = function(sid, timeout, expected, callback) {
  if (!sid) { return; }
  var sub = this.subs[sid];
  if (sub == null) { return; }
  sub.expected = expected;
  sub.timeout = setTimeout(function() { callback(sid); }, timeout);
}

/**
 * Publish a message with an implicit inbox listener as the reply. Message is optional.
 *
 * @param {String} subject
 * @param {String} opt_msg
 * @param {Object} opt_options
 * @param {Function} callback
 * @api public
 */

Client.prototype.request = function(subject, opt_msg, opt_options, callback) {
  if (typeof opt_msg == 'function') {
    callback = opt_msg;
    opt_msg = EMPTY;
    opt_options = null;
  }
  if (typeof opt_options == 'function') {
    callback = opt_options;
    opt_options = null;
  }
  var inbox = createInbox();
  var s = this.subscribe(inbox, opt_options, function(msg, reply) {
    callback(msg, reply);
  });
  this.publish(subject, opt_msg, inbox);
}

/**
 * Reonnect to the server.
 *
 * @api private
 */

Client.prototype.reconnect = function() {
  if (this.closed) { return; }
  this.reconnects += 1;
  this.createConnection();
  this.emit('reconnecting');
}

/**
 * Setup a timer event to attempt reconnect.
 *
 * @api private
 */

Client.prototype.scheduleReconnect = function() {
  var client = this;
  client.reconnecting = true;
  setTimeout(function() { client.reconnect(); }, this.options.reconnectTimeWait);
}
