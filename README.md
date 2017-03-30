# NATS - Node.js Client

A [Node.js](http://nodejs.org/) client for the [NATS messaging system](https://nats.io).

[![License MIT](https://img.shields.io/npm/l/express.svg)](http://opensource.org/licenses/MIT)
[![Build Status](https://travis-ci.org/nats-io/node-nats.svg?branch=master)](http://travis-ci.org/nats-io/node-nats) [![npm version](https://badge.fury.io/js/nats.svg)](http://badge.fury.io/js/nats)[![Coverage Status](https://coveralls.io/repos/github/nats-io/node-nats/badge.svg?branch=master)](https://coveralls.io/github/nats-io/node-nats?branch=master)

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
  if(response.code && response.code === NATS.REQ_TIMEOUT) {
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
## Authentication
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
nats.timeout(sid, timeout_ms, expected, function() {
  timeout = true;
});

// Auto-unsubscribe after MAX_WANTED messages received
nats.subscribe('foo', {'max':MAX_WANTED});
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

```

See examples and benchmarks for more information..

## License

(The MIT License)

Copyright (c) 2015-2017 Apcera Inc.<br/>
Copyright (c) 2011-2015 Derek Collison

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to
deal in the Software without restriction, including without limitation the
rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
sell copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS
IN THE SOFTWARE.
