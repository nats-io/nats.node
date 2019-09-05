# NATS.js - Node.js Client

A [Node.js](http://nodejs.org/) client for the [NATS messaging system](https://nats.io).

[![license](https://img.shields.io/github/license/nats-io/node-nats.svg)](https://www.apache.org/licenses/LICENSE-2.0)
[![Build Status](https://travis-ci.org/nats-io/nats.js.svg?branch=master)](https://travis-ci.org/nats-io/nats.js)
[![Coverage Status](https://coveralls.io/repos/github/nats-io/nats.js/badge.svg?branch=master)](https://coveralls.io/github/nats-io/nats.js?branch=master)
[![npm](https://img.shields.io/npm/v/nats.svg)](https://www.npmjs.com/package/nats)
[![npm](https://img.shields.io/npm/dt/nats.svg)](https://www.npmjs.com/package/nats)
[![npm](https://img.shields.io/npm/dm/nats.svg)](https://www.npmjs.com/package/nats)

## Installation

```bash
npm install nats
```

## Basic Usage

```javascript
var NATS = require('nats');
var nats = NATS.connect();

// Simple Publisher
nats.publish('foo', 'Hello World!');

// Simple Subscriber
nats.subscribe('foo', function(msg) {
  console.log('Received a message: ' + msg);
});

// Unsubscribing
var sid = nats.subscribe('foo', function(msg) {});
nats.unsubscribe(sid);

// Subscription/Request callbacks are given multiple arguments:
// - msg is the payload for the message
// - reply is an optional reply subject set by the sender (could be undefined)
// - subject is the subject the message was sent (which may be more specific 
//   than the subscription subject - see "Wildcard Subscriptions".
// - finally the subscription id is the local id for the subscription
//   this is the same value returned by the subscribe call.
nats.subscribe('foo', function(msg, reply, subject, sid) {
    if(reply) {
        nats.publish(reply, "got " + msg + " on " + subject + " in subscription id " + sid);
        return;
    }
    console.log('Received a message: ' + msg + " it wasn't a request.");
});

// Request Streams
var sid = nats.request('request', function(response) {
  console.log('Got a response in msg stream: ' + response);
});


// Request with Auto-Unsubscribe. Will unsubscribe after
// the first response is received via {'max':1}
nats.request('help', null, {'max':1}, function(response) {
  console.log('Got a response for help: ' + response);
});


// Request for single response with timeout.
nats.requestOne('help', null, {}, 1000, function(response) {
  // `NATS` is the library.
  if(response instanceof NATS.NatsError && response.code === NATS.REQ_TIMEOUT) {
    console.log('Request for help timed out.');
    return;
  }
  console.log('Got a response for help: ' + response);
});

// Replies
nats.subscribe('help', function(request, replyTo) {
  nats.publish(replyTo, 'I can help!');
});

// Close connection
nats.close();

```

## JSON

The `json` connect property makes it easier to exchange JSON data with other
clients.

```javascript
var nc = NATS.connect({json: true});
nc.on('connect', function() {

    nc.on('error', function(err) {
        console.log(err);
    });

    nc.subscribe("greeting", function(msg, reply) {
        // msg is a parsed JSON object object
        if(msg.name && msg.reply) {
            nc.publish(reply, {greeting: "hello " + msg.name});
        }
    });

    // As with all inputs from unknown sources, if you don't trust the data
    // you should verify it prior to accessing it. While JSON is safe because
    // it doesn't export functions, it is still possible for a client to
    // cause issues to a downstream consumer that is not written carefully
    nc.subscribe("unsafe", function(msg) {
        // for example a client could inject a bogus `toString` property
        // which could cause your client to crash should you try to
        // concatenation with the `+` like this:
        // console.log("received", msg + "here");
        // `TypeError: Cannot convert object to primitive value`
        // Note that simple `console.log(msg)` is fine.
        if (msg.hasOwnProperty('toString')) {
            console.log('tricky - trying to crash me:', msg.toString);
            return;
        }

        // of course this is no different than using a value that is
        // expected in one format (say a number), but the client provides
        // a string:
        if (isNaN(msg.amount) === false) {
            // do something with the number
        }
        //...
    });

    // the bad guy
    nc.publish("unsafe", {toString: "no good"});

    nc.flush(function() {
        nc.close();
    });
});

```

## Wildcard Subscriptions

```javascript

// "*" matches any token, at any level of the subject.
nats.subscribe('foo.*.baz', function(msg, reply, subject) {
  console.log('Msg received on [' + subject + '] : ' + msg);
});

nats.subscribe('foo.bar.*', function(msg, reply, subject) {
  console.log('Msg received on [' + subject + '] : ' + msg);
});

// ">" matches any length of the tail of a subject, and can only be
// the last token E.g. 'foo.>' will match 'foo.bar', 'foo.bar.baz',
// 'foo.foo.bar.bax.22'
nats.subscribe('foo.>', function(msg, reply, subject) {
  console.log('Msg received on [' + subject + '] : ' + msg);
});

```

## Queue Groups

```javascript
// All subscriptions with the same queue name will form a queue group.
// Each message will be delivered to only one subscriber per queue group,
// queuing semantics. You can have as many queue groups as you wish.
// Normal subscribers will continue to work as expected.
nats.subscribe('foo', {'queue':'job.workers'}, function() {
  received += 1;
});

```
## Clustered Usage

```javascript
var nats = require('nats');

var servers = ['nats://nats.io:4222', 'nats://nats.io:5222', 'nats://nats.io:6222'];

// Randomly connect to a server in the cluster group.
var nc = nats.connect({'servers': servers});

// currentServer is the URL of the connected server.
console.log("Connected to " + nc.currentServer.url.host);

// Preserve order when connecting to servers.
nc = nats.connect({'dontRandomize': true, 'servers':servers});

```

## Draining Connections and Subscriptions

```javascript
// Unsubscribing removes the subscription handler for a subscription
// and cancels the subscription. Any pending messages on the client's
// buffer are discarded.
//
// Draining is similar to unsubscribe, but the client instead
// sends the unsubscribe request followed by a flush. When the flush
// returns, the subscription handler is removed. Thus the client is
// able to process all messages sent by the server before the subscription
// handler is removed.
//
// Draining is particularly valuable with queue subscriptions preventing
// messages from being lost.

let c1 = 0;
const sid1 = nc.subscribe(subj, {queue: 'q1'}, () => {
    c1++;
    if(c1 === 1) {
        nc1.drainSubscription(sid1, () => {
            // subscription drained - possible arguments are an error or
            // the sid (number) and subject identifying the drained
            // subscription
        });
    }
});


// It is possible to drain a connection, draining a connection:
// - drains all subscriptions
// - after calling drain it is impossible to make subscriptions or requests
// - when all subscriptions are drained, it is impossible to publish
// messages and drained connection is closed.
// - finally, the callback handler is called (with possibly an error).

let c2 = 0;
nc.subscribe(subj, {queue: 'q1'}, () => {
    c2++;
    if(c2 === 1) {
        nc1.drain(() => {
            // connection drained - possible arguments is an error
            // connection is closed by the time this function is
            // called.
        });
    }
});
```

## TLS

```javascript
var nats = require('nats');
var fs = require('fs');

// Simple TLS connect
var nc = nats.connect({port: TLSPORT, tls: true});

// Overriding and not verifying the server
var tlsOptions = {
  rejectUnauthorized: false,
};
var nc = nats.connect({port: TLSPORT, tls: tlsOptions});
// nc.stream.authorized will be false

// Use a specified CA for self-signed server certificates
var tlsOptions = {
  ca: [ fs.readFileSync('./test/certs/ca.pem') ]
};
var nc = nats.connect({port: TLSPORT, tls: tlsOptions});
// nc.stream.authorized should be true

// Use a client certificate if the server requires
var tlsOptions = {
  key: fs.readFileSync('./test/certs/client-key.pem'),
  cert: fs.readFileSync('./test/certs/client-cert.pem'),
  ca: [ fs.readFileSync('./test/certs/ca.pem') ]
};
var nc = nats.connect({port: TLSPORT, tls: tlsOptions});

```

## New Authentication (Nkeys and User Credentials)
See examples for more usage.
```javascript
// Simple connect using credentials file. This loads JWT and signing key
// each time that NATS connects.
var nc = NATS.connect('connect.ngs.global', NATS.creds("./myid.creds"));

// Setting nkey and signing callback directly.
var nc = NATS.connect(url, {
    nkey: 'UAH42UG6PV552P5SWLWTBP3H3S5BHAVCO2IEKEXUANJXR75J63RQ5WM6',
    sigCB: function(nonce) {
      return sk.sign(nonce);
    }
});

// Setting user JWT statically.
var nc = NATS.connect(url, {
    userJWT: myJWT,
    sigCB: function(nonce) {
      return sk.sign(nonce);
    }
});

// Having user JWT be a function that returns the JWT. Can be useful for
// loading a new JWT.
var nc = NATS.connect(url, {
    userJWT: function() {
      return myJWT;
    },
    sigCB: function(nonce) {
      return sk.sign(nonce);
    }
});

```

## Basic Authentication
```javascript

// Connect with username and password in the url
var nc = NATS.connect("nats://foo:bar@localhost:4222");

// Connect with username and password inside object
var nc = NATS.connect({'url':"nats://localhost:4222", 'user':'foo', 'pass':'bar'});

// Connect with token in url
var nc = NATS.connect("nats://mytoken@localhost:4222");

// Connect with token inside object
var nc = NATS.connect({'url':"nats://localhost:4222", 'token':'mytoken'});

```
## Advanced Usage

```javascript

// Publish with closure, callback fires when server has processed the message
nats.publish('foo', 'You done?', function() {
  console.log('msg processed!');
});

// Flush connection to server, callback fires when all messages have
// been processed.
nats.flush(function() {
  console.log('All clear!');
});

// If you want to make sure NATS yields during the processing
// of messages, you can use an option to specify a yieldTime in ms.
// During the processing of the inbound stream, we will yield if we
// spend more then yieldTime milliseconds processing.
var nc = nats.connect({port: PORT, yieldTime: 10});

// Timeouts for subscriptions
var sid = nats.subscribe('foo', function() {
  received += 1;
});

// Timeout unless a certain number of messages have been received
// the callback for the timeout. The callback for the timeout
// provides one argument, the subscription id (sid) for the
// subscription. This allows a generic callback to identify
// where the timeout triggered.
nats.timeout(sid, timeout_ms, expected, function() {
  timeout = true;
});

// Auto-unsubscribe after MAX_WANTED messages received
var sid = nats.subscribe('foo', {'max':MAX_WANTED});
nats.unsubscribe(sid, MAX_WANTED);

// Multiple connections
var nats = require('nats');
var nc1 = nats.connect();
var nc2 = nats.connect();

nc1.subscribe('foo');
nc2.publish('foo');

// Encodings

// By default messages received will be decoded using UTF8. To change that,
// set the encoding option on the connection.

nc = nats.connect({'servers':servers, 'encoding': 'ascii'});



// PreserveBuffers

// To prevent payload conversion from a Buffer to a string, set the
// preserveBuffers option to true. Message payload return will be a Buffer.

nc = nats.connect({'preserveBuffers': true});

// Reconnect Attempts and Time between reconnects

// By default a NATS connection will try to reconnect to a server 10 times
// waiting 2 seconds between reconnect attempts. If the maximum number of
// retries is reached, the client will close the connection.
// To change the default behaviour specify the max number of connection
// attempts in `maxReconnectAttempts` (set to -1 to retry forever), and the
// time in milliseconds between reconnects in `reconnectTimeWait`.

nc = nats.connect({'maxReconnectAttempts': -1, 'reconnectTimeWait': 250});

// emitted whenever there's an error. if you don't implement at least
// the error handler, your program will crash if an error is emitted.
nc.on('error', function(err) {
	console.log(err);
});

// connect callback provides a reference to the connection as an argument
nc.on('connect', function(nc) {
	console.log('connected');
});

// emitted whenever the client disconnects from a server
nc.on('disconnect', function() {
	console.log('disconnect');
});

// emitted whenever the client is attempting to reconnect
nc.on('reconnecting', function() {
	console.log('reconnecting');
});

// emitted whenever the client reconnects
// reconnect callback provides a reference to the connection as an argument
nc.on('reconnect', function(nc) {
	console.log('reconnect');
});

// emitted when the connection is closed - once a connection is closed
// the client has to create a new connection.
nc.on('close', function() {
	console.log('close');
});

// emitted whenever the client unsubscribes
nc.on('unsubscribe', function(sid, subject) {
    console.log("unsubscribed subscription", sid, "for subject", subject);
});

// emitted whenever the server returns a permission error for
// a publish/subscription for the current user. This sort of error
// means that the client cannot subscribe and/or publish/request
// on the specific subject
nc.on("permission_error", function(err) {
    console.error("got a permissions error", err.message);
});

```

See examples and benchmarks for more information.

## Connect Options

The following is the list of connection options and default values.

| Option                 | Aliases                                      | Default                   | Description
|--------                |---------                                     |---------                  |------------
| `encoding`             |                                              | `"utf8"`                  | Encoding specified by the client to encode/decode data
| `json`                 |                                              | `false`                   | If true, message payloads are converted to/from JSON
| `maxPingOut`           |                                              | `2`                       | Max number of pings the client will allow unanswered before raising a stale connection error
| `maxReconnectAttempts` |                                              | `10`                      | Sets the maximum number of reconnect attempts. The value of `-1` specifies no limit
| `name`                 | `client`                                     |                           | Optional client name
| `nkey`                 |                                              | ``                        | See [NKeys/User Credentials](https://github.com/nats-io/nats.js#new-authentication-nkeys-and-user-credentials)
| `noEcho`               |                                              | `false`                   | Subscriptions receive messages published by the client. Requires server support (1.2.0). If set to true, and the server does not support the feature, an error with code `NO_ECHO_NOT_SUPPORTED` is emitted, and the connection is aborted. Note that it is possible for this error to be emitted on reconnect when the server reconnects to a server that does not support the feature.
| `noRandomize`          | `dontRandomize`, `NoRandomize`               | `false`                   | If set, the order of user-specified servers is randomized.
| `pass`                 | `password`                                   |                           | Sets the password for a connection
| `pedantic`             |                                              | `false`                   | Turns on strict subject format checks
| `pingInterval`         |                                              | `120000`                  | Number of milliseconds between client-sent pings
| `preserveBuffers`      |                                              | `false`                   | If true, data for a message is returned as Buffer
| `reconnect`            |                                              | `true`                    | If false server will not attempt reconnecting
| `reconnectTimeWait`    |                                              | `2000`                    | If disconnected, the client will wait the specified number of milliseconds between reconnect attempts
| `servers`              | `urls`                                       |                           | Array of connection `url`s
| `sigCB`                |                                              | ``                        | See [NKeys/User Credentials](https://github.com/nats-io/nats.js#new-authentication-nkeys-and-user-credentials)
| `tls`                  | `secure`                                     | `false`                   | This property can be a boolean or an Object. If true the client requires a TLS connection. If false a non-tls connection is required.  The value can also be an object specifying TLS certificate data. The properties `ca`, `key`, `cert` should contain the certificate file data. `ca` should be provided for self-signed certificates. `key` and `cert` are required for client provided certificates. `rejectUnauthorized` if `true` validates server's credentials
| `token`                |                                              |                           | Sets a authorization token for a connection
| `url`                  | `uri`                                        | `"nats://localhost:4222"` | Connection url
| `useOldRequestStyle`   |                                              | `false`                   | If set to `true` calls to `request()` and `requestOne()` will create an inbox subscription per call.
| `user`                 |                                              |                           | Sets the username for a connection
| `usercreds`            |                                              | ``                        | See [NKeys/User Credentials](https://github.com/nats-io/nats.js#new-authentication-nkeys-and-user-credentials). Set with `NATS.creds()`.
| `userjwt`              |                                              | ``                        | See [NKeys/User Credentials](https://github.com/nats-io/nats.js#new-authentication-nkeys-and-user-credentials)
| `verbose`              |                                              | `false`                   | Turns on `+OK` protocol acknowledgements
| `waitOnFirstConnect`   |                                              | `false`                   | If `true` the server will fall back to a reconnect mode if it fails its first connection attempt.
| `yieldTime`            |                                              |                           | If set, processing will yield at least the specified number of milliseconds to IO callbacks before processing inbound messages


## Supported Node Versions

Our support policy for Nodejs versions follows [Nodejs release support]( https://github.com/nodejs/Release).
We will support and build node-nats on even-numbered Nodejs versions that are current or in LTS.


## Running Tests

To run the tests, you need to have a `nats-server` executable in your path. Refer to the [server installation guide](https://nats-io.github.io/docs/nats_server/installation.html) in the NATS.io documentation. With that in place, you can run `npm test` to run all tests.

## License

Unless otherwise noted, the NATS source files are distributed under the Apache Version 2.0 license found in the LICENSE file.
