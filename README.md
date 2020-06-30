# NATS.js - Node.js Client

A [Node.js](http://nodejs.org/) client for the [NATS messaging system](https://nats.io).

[![license](https://img.shields.io/github/license/nats-io/node-nats.svg)](https://www.apache.org/licenses/LICENSE-2.0)
![NATS.js CI](https://github.com/nats-io/nats.js/workflows/NATS.js%20CI/badge.svg)
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

## NATS.js 2.0 Preview
> :warning: We have a preview for a nats.js v2 available. Nats.js v2 is currently hosted in the [v2 branch](https://github.com/nats-io/nats.js/tree/v2).
> 
> Version 2.0 changes existing APIs slightly, and while porting is trivial, it will
> require careful changes on existing code bases. A description of the changes and migration can be found [here](https://github.com/nats-io/nats.js/blob/v2/nats_2.0_migration.md).
> 
> Nats.js 2.0 will be the underlying engine for ts-nats which provides an async/await API on top of nats.js.
> You can play with the nats.js v2 by `npm install nats@alpha`.

## Basic Usage

```javascript
const NATS = require('nats')
const nc = NATS.connect()

// Simple Publisher
nc.publish('foo', 'Hello World!')

// Simple Subscriber
nc.subscribe('foo', function (msg) {
  console.log('Received a message: ' + msg)
})

// Unsubscribing
const sid = nc.subscribe('foo', function (msg) {})
nc.unsubscribe(sid)

// Subscription/Request callbacks are given multiple arguments:
// - msg is the payload for the message
// - reply is an optional reply subject set by the sender (could be undefined)
// - subject is the subject the message was sent (which may be more specific
//   than the subscription subject - see "Wildcard Subscriptions".
// - finally the subscription id is the local id for the subscription
//   this is the same value returned by the subscribe call.
nc.subscribe('foo', (msg, reply, subject, sid) => {
  if (reply) {
    nc.publish(reply, 'got ' + msg + ' on ' + subject + ' in subscription id ' + sid)
    return
  }
  console.log('Received a message: ' + msg + " it wasn't a request.")
})

// Request, creates a subscription to handle any replies to the request
// subject, and publishes the request with an optional payload. This usage
// allows you to collect responses from multiple services
nc.request('request', (msg) => {
  console.log('Got a response in msg stream: ' + msg)
})

// Request with a max option will unsubscribe after
// the first max messages are received. You can also specify the number
// of milliseconds you are willing to wait for the response - when a timeout
// is specified, you can receive an error
nc.request('help', null, { max: 1, timeout: 1000 }, (msg) => {
  if (msg instanceof NATS.NatsError && msg.code === NATS.REQ_TIMEOUT) {
    console.log('request timed out')
  } else {
    console.log('Got a response for help: ' + msg)
  }
})

// Replies
nc.subscribe('help', function (request, replyTo) {
  nc.publish(replyTo, 'I can help!')
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

  nc.subscribe('greeting', (msg, reply) => {
    // msg is a parsed JSON object object
    if (msg.name && msg.reply) {
      nc.publish(reply, { greeting: 'hello ' + msg.name })
    }
  })

  // As with all inputs from unknown sources, if you don't trust the data
  // you should verify it prior to accessing it. While JSON is safe because
  // it doesn't export functions, it is still possible for a client to
  // cause issues to a downstream consumer that is not written carefully
  nc.subscribe('unsafe', function (msg) {
    // for example a client could inject a bogus `toString` property
    // which could cause your client to crash should you try to
    // concatenation with the `+` like this:
    // console.log("received", msg + "here");
    // `TypeError: Cannot convert object to primitive value`
    // Note that simple `console.log(msg)` is fine.
    if (Object.hasOwnProperty.call(msg, 'toString')) {
      console.log('tricky - trying to crash me:', msg.toString)
      return
    }

    // of course this is no different than using a value that is
    // expected in one format (say a number), but the client provides
    // a string:
    if (isNaN(msg.amount) === false) {
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
  // "*" matches any token, at any level of the subject.
  nc.subscribe('foo.*.baz', (msg, reply, subject) => {
    console.log('Msg received on [' + subject + '] : ' + msg)
  })

  nc.subscribe('foo.bar.*', (msg, reply, subject) => {
    console.log('Msg received on [' + subject + '] : ' + msg)
  })

  // ">" matches any length of the tail of a subject, and can only be
  // the last token E.g. 'foo.>' will match 'foo.bar', 'foo.bar.baz',
  // 'foo.foo.bar.bax.22'
  nc.subscribe('foo.>', (msg, reply, subject) => {
    console.log('Msg received on [' + subject + '] : ' + msg)
  })
```

## Queue Groups

```javascript
  // All subscriptions with the same queue name will form a queue group.
  // Each message will be delivered to only one subscriber per queue group,
  // queuing semantics. You can have as many queue groups as you wish.
  // Normal subscribers will continue to work as expected.
  nc.subscribe('foo', { queue: 'job.workers' }, function () {
    received += 1
  })
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
const sid1 = nc.subscribe('foo', { queue: 'q1' }, () => {
  c1++
  if (c1 === 1) {
    nc.drainSubscription(sid1, () => {
      // subscription drained - possible arguments are an error or
      // the sid (number) and subject identifying the drained
      // subscription
    })
  }
})

// It is possible to drain a connection, draining a connection:
// - drains all subscriptions
// - after calling drain it is impossible to make subscriptions or requests
// - when all subscriptions are drained, it is impossible to publish
// messages and drained connection is closed.
// - finally, the callback handler is called (with possibly an error).

let c2 = 0
nc.subscribe('foo', { queue: 'q1' }, () => {
  c2++
  if (c2 === 1) {
    nc.drain(() => {
      // connection drained - possible arguments is an error
      // connection is closed by the time this function is
      // called.
    })
  }
})

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
// Publish with callback, callback fires when server has processed the message
nc.publish('foo', 'You done?', () => {
  console.log('msg processed!')
})

// Flush connection to server, callback fires when all messages have
// been processed.
nc.flush(() => {
  console.log('round trip to the server done')
})

// If you want to make sure NATS yields during the processing
// of messages, you can use an option to specify a yieldTime in ms.
// During the processing of the inbound stream, NATS will yield if it
// spends more than yieldTime milliseconds processing.
nc = NATS.connect({ port: 4222, yieldTime: 10 })

// Timeouts for subscriptions
let sid = NATS.subscribe('foo', () => {
  // do something
})

// Timeout unless a certain number of messages have been received
// the callback for the timeout. The callback for the timeout
// provides one argument, the subscription id (sid) for the
// subscription. This allows a generic callback to identify
// where the timeout triggered.
nc.timeout(sid, 1000, 1, () => {
  // do something
})

// Auto-unsubscribe after max messages received
sid = nc.subscribe('foo', { max: 100 })
nc.unsubscribe(sid, 100)

// Multiple connections
const nc1 = NATS.connect()
const nc2 = NATS.connect()

nc1.subscribe('foo', () => {
  // do something
})
nc1.flush()
nc2.flush()
nc2.publish('foo')

// Encodings

// By default messages received will be decoded using UTF8. To change that,
// set the encoding option on the connection.

nc = NATS.connect({ encoding: 'ascii' })

// PreserveBuffers

// To prevent payload conversion from a Buffer to a string, set the
// preserveBuffers option to true. Message payload return will be a Buffer.

nc = NATS.connect({ preserveBuffers: true })

// Reconnect Attempts and Time between reconnects

// By default a NATS connection will try to reconnect to a server 10 times
// waiting 2 seconds between reconnect attempts. If the maximum number of
// retries is reached, the client will close the connection.
// To change the default behaviour specify the max number of connection
// attempts in `maxReconnectAttempts` (set to -1 to retry forever), and the
// time in milliseconds between reconnects in `reconnectTimeWait`.

nc = NATS.connect({ maxReconnectAttempts: -1, reconnectTimeWait: 250 })
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
nc.on('close', function () {
  console.log('close')
})

// emitted whenever the client unsubscribes
nc.on('unsubscribe', function (sid, subject) {
  console.log('unsubscribed subscription', sid, 'for subject', subject)
})

// emitted whenever the server returns a permission error for
// a publish/subscription for the current user. This sort of error
// means that the client cannot subscribe and/or publish/request
// on the specific subject
nc.on('permission_error', function (err) {
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
| `reconnectTimeWait`    | `2000`                    | If disconnected, the client will wait the specified number of milliseconds between reconnect attempts. See [jitter](#jitter).
| `reconnectJitter`      | `100`                     | Number of millis to randomize after `reconnectTimeWait`. See [jitter](#jitter).
| `reconnectJitterTLS`   | `1000`                    | Number of millis to randomize after `reconnectTimeWait` when TLS options are specified. See [jitter](#jitter).
| `reconnectDelayHandler`| Generated function        | A function that returns the number of millis to wait before the next connection to a server it connected to. See [jitter](#jitter).
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


### Jitter 

The settings `reconnectTimeWait`, `reconnectJitter`, `reconnectJitterTLS`, `reconnectDelayHandler` are all related.
They control how long before the NATS client attempts to reconnect to a server it has previously connected.

The intention of the settings is to spread out the number of clients attempting to reconnect to a server over a period of time, 
and thus preventing a ["Thundering Herd"](https://docs.nats.io/developing-with-nats/reconnect/random).

The relationship between these is:

- If `reconnectDelayHandler` is specified, the client will wait the value returned by this function. No other value will be taken into account.
- If the client specified TLS options, the client will generate a number between 0 and `reconnectJitterTLS` and add it to
`reconnectTimeWait`.
- If the client didn't specify TLS options, the client will generate a number between 0 and `reconnectJitter` and add it to `reconnectTimeWait`.


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
