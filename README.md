# NATS.js - Node.js Client

A [Node.js](http://nodejs.org/) client for the [NATS messaging system](https://nats.io).

[![license](https://img.shields.io/github/license/nats-io/node-nats.svg)](https://www.apache.org/licenses/LICENSE-2.0)
[![Build Status](https://travis-ci.org/nats-io/nats.js.svg?branch=master)](https://travis-ci.org/nats-io/nats.js)
[![Coverage Status](https://coveralls.io/repos/github/nats-io/nats.js/badge.svg?branch=master)](https://coveralls.io/github/nats-io/nats.js?branch=master)
[![npm](https://img.shields.io/npm/v/nats.svg)](https://www.npmjs.com/package/nats)
[![npm](https://img.shields.io/npm/dt/nats.svg)](https://www.npmjs.com/package/nats)
[![npm](https://img.shields.io/npm/dm/nats.svg)](https://www.npmjs.com/package/nats)
[![JavaScript Style Guide](https://img.shields.io/badge/code_style-standard-brightgreen.svg)](https://standardjs.com)


## Installation

```bash
npm install nats

# to install current dev version:
npm install nats@next
```

## Basic Usage

```javascript
const NATS = require('nats')

const nc = NATS.connect()

// Simple publisher
nc.publish('foo', 'Hello World!')

// Simple Subscriber - error is set if there was some error
nc.subscribe('foo', (err, msg) => {
  if (err) {
    console.error(err)
    return
  }
  console.log('Received a message: ' + msg)
})

// Unsubscribing
const sub = nc.subscribe('foo', (err, m) => {
  if(!err) {
    console.log(m)
  } else {
    console.error(err)
  }
})
sub.unsubscribe()


// Subscription/Request are given two arguments:
// - an error (undefined if no error)
// - a message object
//   - the message has 4 properties:
//   - data - the message payload (can be undefined)
//   - subject - subject where the message was sent
//   - reply - the reply subject if this is a request (can be undefined)
//   - sid - the subscription id associated with the handler (same value as the return of subscribe())
nc.subscribe('foo', (_, m) => {
  if (m.reply) {
    nc.publish(m.reply, 'got ' + m.data + ' on ' + m.subject + ' in subscription id ' + m.sid)
    return
  }
  console.log('Received a message: ' + m.data + " it wasn't a request.")
})

// Request, creates a subscription to handle any replies to the request
// subject, and publishes the request with an optional payload. This usage
// allows you to collect responses from multiple services
nc.request('request', (_, m) => {
  console.log('Got a response in msg stream: ' + m.data)
})

// Request with a max option will unsubscribe after
// the first max messages are received. You can also specify the number
// of milliseconds you are willing to wait for the response - when a timeout
// is specified, you can receive an error
nc.request('help', (err, m) => {
  if (err && err.code === NATS.REQ_TIMEOUT) {
    console.log('request timed out')
  } else if (err) {
    console.error('request got error', err)
  } else {
    console.log('Got a response for help: ' + m.data)
  }
}, null, { max: 1, timeout: 1000 })

// Replies
nc.subscribe('help', (_, m) => {
  nc.publish(m.reply, 'I can help!')
})

// Close connection
nc.close()
```

## JSON

The `json` connect property makes it easier to exchange JSON data with other
clients.

```javascript
const nc = NATS.connect({ json: true })
nc.on('connect', () => {
  nc.on('error', (err) => {
    console.log(err)
  })

  nc.subscribe('greeting', (_, m) => {
    // msg is a parsed JSON object object
    if (m.data && m.data.name && m.reply) {
      nc.publish(m.reply, { greeting: 'hello ' + m.data.name })
    }
  })

  // As with all inputs from unknown sources, if you don't trust the data
  // you should verify it prior to accessing it. While JSON is safe because
  // it doesn't export functions, it is still possible for a client to
  // cause issues to a downstream consumer that is not written carefully
  nc.subscribe('unsafe', (_, m) => {
    // for example a client could inject a bogus `toString` property
    // which could cause your client to crash should you try to
    // concatenation with the `+` like this:
    // console.log("received", msg + "here");
    // `TypeError: Cannot convert object to primitive value`
    // Note that simple `console.log(msg)` is fine.
    if (Object.hasOwnProperty.call(m, 'toString')) {
      console.log('tricky - trying to crash me:', m.toString)
      return
    }

    // of course this is no different than using a value that is
    // expected in one format (say a number), but the client provides
    // a string:
    if (isNaN(m.data.amount) === false) {
      // do something with the number
    }
    // ...
  })

  // the bad guy
  nc.publish('unsafe', { toString: 'no good' })

  nc.flush(function () {
    nc.close()
  })
})
```

## Wildcard Subscriptions

```javascript
const nc = NATS.connect({ json: true })
// "*" matches any token, at any level of the subject.
nc.subscribe('foo.*.baz', (_, m) => {
  console.log('Msg received on [' + m.subject + '] : ' + m.data)
})

nc.subscribe('foo.bar.*', (_, m) => {
  console.log('Msg received on [' + m.subject + '] : ' + m.data)
})

// ">" matches any length of the tail of a subject, and can only be
// the last token E.g. 'foo.>' will match 'foo.bar', 'foo.bar.baz',
// 'foo.foo.bar.bax.22'
nc.subscribe('foo.>', (_, m) => {
  console.log('Msg received on [' + m.subject + '] : ' + m.data)
})
```

## Queue Groups

```javascript
// All subscriptions with the same queue name will form a queue group.
// Each message will be delivered to only one subscriber per queue group,
// queuing semantics. You can have as many queue groups as you wish.
// Normal subscribers will continue to work as expected.
let received = 0
nc.subscribe('foo', () => {
  received++
}, { queue: 'job.workers' })
```
## Clustered Usage

```javascript
const servers = ['nats://nats.io:4222', 'nats://nats.io:5222', 'nats://nats.io:6222']

// Randomly connect to a server in the cluster group.
// Note that because `url` is not specified, the default connection is called first
// (nats://localhost:4222). If you don't want default connection, specify one of
// the above the above servers as `url`: `nats.connect(servers[0], {'servers': servers});`
let nc = NATS.connect({ servers: servers })

// currentServer is the URL of the connected server.
nc.on('connect', () => {
  console.log('Connected to ' + nc.currentServer.url.host)
})

// Preserve order when connecting to servers.
nc = NATS.connect({ noRandomize: true, servers: servers })
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

let c1 = 0
const sub = nc.subscribe('foo', () => {
  c1++
  if (c1 === 1) {
    sub.drain((err) => {
      if (err) {
        console.error(err)
        return
      }
      console.log(`subscription ${sub.sid} drained`)
    })
  }
}, { queue: 'q1' })

// It is possible to drain a connection, draining a connection:
// - drains all subscriptions
// - after calling drain it is impossible to make subscriptions or requests
// - when all subscriptions are drained, it is impossible to publish
// messages and drained connection is closed.
// - finally, the callback handler is called (with possibly an error).

let c2 = 0
nc.subscribe('foo', () => {
  c2++
  if (c2 === 1) {
    nc.drain((err) => {
      if (err) {
        console.error('error draining', err)
        return
      }
      console.log('connection drained')
    })
  }
}, { queue: 'q1' })

```

## TLS

```javascript
const NATS = require('nats')
const fs = require('fs')

// Simple TLS connect
let nc = NATS.connect({ tls: true })

// Overriding and not verifying the server
let tlsOptions = {
  rejectUnauthorized: false
}
nc = NATS.connect({ tls: tlsOptions })
// nc.stream.authorized will be false

// Use a specified CA for self-signed server certificates
tlsOptions = {
  ca: [fs.readFileSync('./test/certs/ca.pem')]
}
nc = NATS.connect({ tls: tlsOptions })
// nc.stream.authorized should be true

// Use a client certificate if the server requires
tlsOptions = {
  key: fs.readFileSync('./test/certs/client-key.pem'),
  cert: fs.readFileSync('./test/certs/client-cert.pem'),
  ca: [fs.readFileSync('./test/certs/ca.pem')]
}
nc = NATS.connect({ tls: tlsOptions })
```

## Basic Authentication
```javascript
// Connect with username and password in the url
let nc = NATS.connect('nats://foo:bar@localhost:4222')

// Connect with username and password inside object
nc = NATS.connect({ url: 'nats://localhost:4222', user: 'foo', pass: 'bar' })

// Connect with token in url
nc = NATS.connect('nats://mytoken@localhost:4222')

// Connect with token inside object
nc = NATS.connect({ url: 'nats://localhost:4222', token: 'mytoken' })
```

## New Authentication (Nkeys and User Credentials)
See examples for more usage.
```javascript
const nkeys = require('ts-nkeys')

// Simple connect using credentials file. This loads JWT and signing key
// each time that NATS connects.
let nc = NATS.connect('connect.ngs.global', NATS.creds('./myid.creds'))

// Manually, you need to specify the JWT, and seed and sign the challenge
const jwt = 'eyJ0eXAiOiLN1...'
const nkeySeed = 'SUAIBDPBAUTWCWBKIO6XHQNINK5FWJW4OHLXC3HQ2KFE4PEJUA44CNHTC4'
const sk = nkeys.fromSeed(Buffer.from(nkeySeed))

// Setting nkey and signing callback directly.
nc = NATS.connect('nats://localhost:4222', {
  nkey: 'UAH42UG6PV552P5SWLWTBP3H3S5BHAVCO2IEKEXUANJXR75J63RQ5WM6',
  nonceSigner: function (nonce) {
    return sk.sign(nonce)
  }
})

// Setting user JWT statically.
nc = NATS.connect({
  userJWT: jwt,
  nonceSigner: function (nonce) {
    return sk.sign(nonce)
  }
})

// Having user JWT be a function that returns the JWT. Can be useful for
// loading a new JWT.
nc = NATS.connect({
  userJWT: function () {
    return jwt
  },
  nonceSigner: function (nonce) {
    return sk.sign(nonce)
  }
})
```

## Advanced Usage

```javascript
// Flush connection to server, callback fires when all messages have
// been processed.
nc.flush((err) => {
  if (err) {
    console.error('error flushing', err)
    return
  }
  console.log('round trip to the server done')
})

// If you want to make sure NATS yields during the processing
// of messages, you can use an option to specify a yieldTime in ms.
// During the processing of the inbound stream, NATS will yield if it
// spends more than yieldTime milliseconds processing.
nc = NATS.connect({ port: 4222, yieldTime: 10 })

// Timeout a subscription unless a certain number of messages have been received
// When a subscription times out, it automatically cancels. You can specify more
// messages in the `expected` option. However that count of messages must be
// received before the timeout specified. If `expected` is not specified, it
// defaults to '1'.
NATS.subscribe('foo', (err) => {
  if (err && err.code === TIMEOUT_ERR) {
    // didn't get the message
  }
  // do something
}, {timeout: 1000, expected: 1})


// Auto-unsubscribe after max messages received
nc.subscribe('foo', () => {}, { max: 100 })
// or
const sub = nc.subscribe('foo', () => {})
sub.unsubscribe(100)



// Encodings

// By default messages received will be decoded using UTF8. To change that,
// set the encoding option on the connection.

NATS.connect({ encoding: 'ascii' })

// PreserveBuffers

// To prevent payload conversion from a Buffer to a string, set the
// preserveBuffers option to true. Message payload return will be a Buffer.

NATS.connect({ preserveBuffers: true })

// Reconnect Attempts and Time between reconnects

// By default a NATS connection will try to reconnect to all servers 10 times
// waiting 2 seconds between the previous reconnect to the server. If the 
// maximum number of retries is reached, the client will close the connection.
// To change the default behaviour specify the max number of connection
// attempts in `maxReconnectAttempts` (set to -1 to retry forever), and the
// time in milliseconds between reconnects in `reconnectTimeWait`.

NATS.connect({ maxReconnectAttempts: -1, reconnectTimeWait: 250 })
```

# Events

The nats client is an event emitter, you can listen to several kinds of events.

```javascript
// emitted whenever there's an error. if you don't implement at least
// the error handler, your program will crash if an error is emitted.
nc.on('error', (err) => {
  console.log(err)
})

// connect callback provides a reference to the connection as an argument
nc.on('connect', (nc) => {
  console.log(`connect to ${nc.currentServer.url.host}`)
})

// emitted whenever the client disconnects from a server
nc.on('disconnect', () => {
  console.log('disconnect')
})

// emitted whenever the client is attempting to reconnect
nc.on('reconnecting', () => {
  console.log('reconnecting')
})

// emitted whenever the client reconnects
// reconnect callback provides a reference to the connection as an argument
nc.on('reconnect', (nc) => {
  console.log(`reconnect to ${nc.currentServer.url.host}`)
})

// emitted when the connection is closed - once a connection is closed
// the client has to create a new connection.
nc.on('close', () => {
  console.log('close')
})

// emitted whenever the client unsubscribes
nc.on('unsubscribe', (sid, subject) => {
  console.log('unsubscribed subscription', sid, 'for subject', subject)
})

// emitted whenever the server returns a permission error for
// a publish for the current user. This sort of error
// means that the client cannot publish/request
// on the specific subject. Note that subscription permission
// errors are delivered to the subscription's handler
nc.on(pubError, (err) => {
  console.error('got a permissions error', err.message)
})
```

See examples and benchmarks for more information.

## Connect Options

The following is the list of connection options and default values.

| Option                 | Default                   | Description
|--------                |---------                  |------------
| `encoding`             | `"utf8"`                  | Encoding specified by the client to encode/decode data
| `json`                 | `false`                   | If true, message payloads are converted to/from JSON
| `maxPingOut`           | `2`                       | Max number of pings the client will allow unanswered before raising a stale connection error
| `maxReconnectAttempts` | `10`                      | Sets the maximum number of reconnect attempts. The value of `-1` specifies no limit
| `name`                 |                           | Optional client name
| `nkey`                 | ``                        | See [NKeys/User Credentials](https://github.com/nats-io/nats.js#new-authentication-nkeys-and-user-credentials)
| `noEcho`               | `false`                   | Subscriptions receive messages published by the client. Requires server support (1.2.0). If set to true, and the server does not support the feature, an error with code `NO_ECHO_NOT_SUPPORTED` is emitted, and the connection is aborted. Note that it is possible for this error to be emitted on reconnect when the server reconnects to a server that does not support the feature.
| `noRandomize`          | `false`                   | If set, the order of user-specified servers is randomized.
| `nonceSigner`          | ``                        | See [NKeys/User Credentials](https://github.com/nats-io/nats.js#new-authentication-nkeys-and-user-credentials). A function that takes a `Buffer` and returns a nkey signed signature.
| `pass`                 |                           | Sets the password for a connection
| `pedantic`             | `false`                   | Turns on strict subject format checks
| `pingInterval`         | `120000`                  | Number of milliseconds between client-sent pings
| `preserveBuffers`      | `false`                   | If true, data for a message is returned as Buffer
| `reconnectTimeWait`    | `2000`                    | If disconnected, the client will wait the specified number of milliseconds between reconnect attempts
| `reconnect`            | `true`                    | If false server will not attempt reconnecting
| `servers`              |                           | Array of connection `url`s
| `timeout`              | node default - no timeout | Number of milliseconds the client will wait for a connection to be established. If it fails it will emit a `connection_timeout` event with a NatsError that provides the hostport of the server where the connection was attempted.
| `tls`                  | `false`                   | This property can be a boolean or an Object. If true the client requires a TLS connection. If false a non-tls connection is required.  The value can also be an object specifying TLS certificate data. The properties `ca`, `key`, `cert` should contain the certificate file data. `ca` should be provided for self-signed certificates. `key` and `cert` are required for client provided certificates. `rejectUnauthorized` if `true` validates server's credentials
| `token`                |                           | Sets a authorization token for a connection
| `tokenHandler`         |                           | A function returning a `token` used for authentication.
| `url`                  | `"nats://localhost:4222"` | Connection url
| `useOldRequestStyle`   | `false`                   | If set to `true` calls to `request()` and `requestOne()` will create an inbox subscription per call.
| `user`                 |                           | Sets the username for a connection
| `userCreds`            | ``                        | See [NKeys/User Credentials](https://github.com/nats-io/nats.js#new-authentication-nkeys-and-user-credentials). Set with `NATS.creds()`.
| `userJWT`              | ``                        | See [NKeys/User Credentials](https://github.com/nats-io/nats.js#new-authentication-nkeys-and-user-credentials). The property can be a JWT or a function that returns a JWT.
| `verbose`              | `false`                   | Turns on `+OK` protocol acknowledgements
| `waitOnFirstConnect`   | `false`                   | If `true` the server will fall back to a reconnect mode if it fails its first connection attempt.
| `yieldTime`            |                           | If set, processing will yield at least the specified number of milliseconds to IO callbacks before processing inbound messages

## Tools

The examples, `node-pub`, `node-sub`, `node-req`, `node-reply` are now bound to `bin` entries on the npm package.
You can use these while developing your own tools. After you install the `nats` npm package, you'll need to add
a dependency on `minimist` before you can use the tools:

```bash
npm install nats
npm install minimist
...
% npx node-sub hello &
[1] 9208
% Listening on [hello]
% npx node-pub hello world
Received "world"
Published [hello] : "world"
```

## Supported Node Versions

Our support policy for Nodejs versions follows [Nodejs release support]( https://github.com/nodejs/Release).
We will support and build node-nats on even-numbered Nodejs versions that are current or in LTS.


## Running Tests

To run the tests, you need to have a `nats-server` executable in your path. Refer to the [server installation guide](https://nats-io.github.io/docs/nats_server/installation.html) in the NATS.io documentation. With that in place, you can run `npm test` to run all tests.

## License

Unless otherwise noted, the NATS source files are distributed under the Apache Version 2.0 license found in the LICENSE file.
