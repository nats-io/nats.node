/*!
 * Nats
 * Copyright(c) 2011 Derek Collison (derek.collison@gmail.com)
 * MIT Licensed
 */


/**
 * Module Dependencies
 */

var sys    = require('sys'),
    net    = require('net'),
    url    = require('url'),
    util   = require('util'),
    events = require('events');

/**
 * Constants
 */

var VERSION = '0.2.0',

    DEFAULT_PORT = 4222,
    DEFAULT_PRE  = 'nats://localhost:',
    DEFAULT_URI  =  DEFAULT_PRE + DEFAULT_PORT,

    MAX_CONTROL_LINE_SIZE = 512,

    // Parser state
    AWAITING_CONTROL = 0,
    AWAITING_MSG_PAYLOAD = 1,

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

    // Responses
    PING_REQUEST  = 'PING'+CR_LF,
    PONG_RESPONSE = 'PONG'+CR_LF,

    EMPTY = '',

    // Pedantic Mode support
    SUB = /^([^\.\*>\s]+|>$|\*)(\.([^\.\*>\s]+|>$|\*))*$/,
    SUB_NO_WC = /^([^\.\*>\s]+)(\.([^\.\*>\s]+))*$/;


/**
 * Library Version
 */

exports.version = VERSION;

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
  var client = new Client(opts);
  return client;
}

/**
 * Generate random hex strings for createInbox.
 *
 * @api private
*/

function hexRand(limit) {
  return parseInt(Math.random()*limit).toString(16)
}

/**
 * Create a properly formatted inbox subject.
 *
 * @api public
*/

var createInbox = exports.createInbox = function() {
  return "_INBOX." +
    hexRand(0x0010000) +
    hexRand(0x0010000) +
    hexRand(0x0010000) +
    hexRand(0x0010000) +
    hexRand(0x1000000);
}

/**
 * Parse the conctructor/connect options.
 *
 * @param {Mixed} opts
 * @api private
 */

function parseInitOptions(opts) {
  var options = {};
  if ('number' == typeof opts) {
    options.url = DEFAULT_PRE + opts;
  } else if ('string' == typeof opts) {
    options.url = opts;
  } else if ('object' == typeof opts) {
    // Pull out various options here
    if (opts['url'] != undefined) {
      options.url = opts.url;
    } else if (opts['uri'] != undefined) {
      options.url = opts.uri;
    }
    if (opts['user'] != undefined) {
      options.user = opts.user;
    }
    if (opts['pass'] != undefined) {
      options.pass = opts.pass;
    } else if (opts['password'] != undefined) {
      options.pass = opts.password;
    }
  } else {
    options.url = DEFAULT_URI;
  }
  if (options.url != undefined) {
    // Parse the uri
    options.url = url.parse(options.url);
    if (options.url.auth != undefined) {
      var auth = options.url.auth.split(':');
      if (options.user == undefined) {
        options.user = auth[0];
      }
      if (options.pass == undefined) {
        options.pass = auth[1];
      }
    }
  }

  options.urlString = function() {
    return options.url.hostname + ":" + options.url.port;
  }();

  options.server = options.urlString;

  return options;
}

/**
 * Initialize a client with the appropriate options.
 *
 * @param {Mixed} opts
 * @api public
 */

function Client(opts) {
  events.EventEmitter.call(this);

  var options = this.options = parseInitOptions(opts);
  var stream = this.stream = net.createConnection(options.url.port, options.url.hostname);

  stream.setEncoding('utf8'); // FIXME, Force Strings

  var client = this;

  client.connected = false;

  stream.on("connect", function() {
    client.connected = true;
    client.flushPending();
    client.emit("connect", client);
  });

  stream.on("error", function (exception) {
    client.emit("error", exception);
  });

  stream.on("data", function (data) {

    client.inbound = client.inbound ? client.inbound + data : data;

    var m;

    while (client.inbound && client.inbound.length > 0) {
      switch (client.pstate) {
      case AWAITING_CONTROL:
        if (m = MSG.exec(client.inbound)) {
          client.payload = {subj : m[1], sid : m[2], reply : m[4], size : parseInt(m[5])}
          client.pstate = AWAITING_MSG_PAYLOAD;
        } else if (m = OK.exec(client.inbound)) {
          // Nothing for now..
        } else if (m = ERR.exec(client.inbound)) {
          client.emit("error", m[1]);
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
        if (client.inbound.length < client.payload.size + CR_LF_LEN) return;

        client.payload.msg = client.inbound.slice(0, client.payload.size);

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

  this.initState();
  this.server = options.server;

  // Queue the connect command.
  var cs = {'verbose':false, 'pedantic':false};
  if (this.options.user != undefined) {
    cs.user = this.options.user;
    cs.pass = this.options.pass;
  }
  this.sendCommand('CONNECT ' + JSON.stringify(cs) + CR_LF);
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

/**
 * Initialize client state.
 *
 * @api private
 */

Client.prototype.initState = function() {
  this.ssid    = 1;
  this.subs    = {};
  this.pstate  = AWAITING_CONTROL;
  this.pongs   = [];
}

/**
 * Close the connection to the server.
 *
 * @api public
 */

Client.prototype.close = function() {
  this.stream.end();
  this.stream.destroy();
  this.stream  = null;
  this.pending = null;
  this.ssid    = -1;
  this.subs    = null;
  this.pstate  = -1;
  this.pongs   = null;
}

/**
 * Flush all pending data to the server.
 *
 * @api private
 */

Client.prototype.flushPending = function() {
  if (!this.connected || this.pending == undefined) {
    return;
  }
  var l = this.pending.length;
  for (var i=0; i < l; i++) {
    this.stream.write(this.pending[i]);
  }
  this.pending = null;
}

/**
 * Send commands to the server or queue them up if connection pending.
 *
 * @api private
 */

Client.prototype.sendCommand = function(cmd) {
  if (this.connected) {
    this.stream.write(cmd);
  } else {
    if (this.pending == undefined) {
      this.pending = [];
    }
    this.pending.push(cmd);
  }
}

/**
 * Process a delivered message and deliver to appropriate subscriber.
 *
 * @api private
 */

Client.prototype.processMsg = function() {
  var sub = this.subs[this.payload.sid];
  if (sub != undefined) {
    sub.received += 1;
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
  if (typeof opt_callback == 'function') {
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
    if (opt_callback || opt_reply) throw("Error: message can't be a function"); // FIXME
    opt_callback = msg;
    msg = EMPTY;
    opt_reply = null;
  }
  if (typeof opt_reply == 'function') {
    if (opt_callback) throw("Error: reply can't be a function"); // FIXME
    opt_callback = opt_reply;
    opt_reply = null;
  }
  // FIXME Array.join?
  if (opt_reply) {
    this.sendCommand('PUB ' + subject + SPC + opt_reply + SPC + msg.length + CR_LF);
  } else {
    this.sendCommand('PUB ' + subject + SPC + msg.length + CR_LF);
  }
  // Optimize?
  this.sendCommand(msg);
  this.sendCommand(CR_LF);

  if (opt_callback) {
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

  // FIXME, Array.join?
  if (typeof qgroup == 'string') {
    this.sendCommand('SUB ' + subject + SPC + qgroup + SPC + this.ssid + CR_LF);
  } else {
    this.sendCommand('SUB ' + subject + SPC + this.ssid + CR_LF);
  }
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
  if (!sid) return;
  if (opt_max) {
    this.sendCommand('UNSUB ' + sid + SPC + opt_max + CR_LF);
  } else {
    this.sendCommand('UNSUB ' + sid + CR_LF);
  }
  var sub = this.subs[sid];
  if (sub == undefined) {
    return;
  }
  sub['max'] = opt_max;
  if (sub['max'] == undefined || (sub.received >= sub.max)) {
    this.subs[sid] = null;
  }
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
