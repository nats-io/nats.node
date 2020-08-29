# NATS.js - A [NATS](http://nats.io) client for [Node.Js](https://nodejs.org/en/)


A Node.js client for the [NATS messaging system](https://nats.io).

[![License](https://img.shields.io/badge/Licence-Apache%202.0-blue.svg)](./LICENSE)
![NATS.js CI](https://github.com/nats-io/nats.js/workflows/NATS.js%20CI/badge.svg)
[![npm](https://img.shields.io/npm/v/nats.svg)](https://www.npmjs.com/package/nats)
[![npm](https://img.shields.io/npm/dt/nats.svg)](https://www.npmjs.com/package/nats)
[![npm](https://img.shields.io/npm/dm/nats.svg)](https://www.npmjs.com/package/nats)

# Installation

** :warning: NATS.js v2 is a preview** you can get the current development version by:

```bash
npm install nats@v2'
```
The nats.js v2 client is under active development. All tests are passing.

The nats.js v2 client is not API compatible with previous versions of nats.js.
For a migration guide, please see [the migration guide](migration.md).

## Basics


### Connecting to a nats-server

To connect to a server you use the `connect()` function. It returns
a connection that you can use to interact with the server.

By default, a connection will attempt to auto-reconnect when dropped
due to some networking type error. Messages that have not been
sent to the server when a disconnect happens are lost. A client can queue
new messages to be sent when the connection resumes. If the connection
cannot be re-established the client will give up and `close` the connection.

To learn when a connection closes, wait for the promise returned by the `closed()`
function. If the close was due to an error, it will resolve to an error.

To disconnect from the nats-server, you call `close()` on the connection.
Connections can also be closed if there's an error. For example, the
server returns some run-time error.

This first example shows basic options that you can provide to the connect
function, note that you can specify multiple servers, allowing the client
to cope with a server that is not available.

```javascript
const { connect } = require("nats");
[
  {},
  { servers: ["demo.nats.io:4442", "demo.nats.io:4222"] },
  { servers: "demo.nats.io:4443" },
  { port: 4222 },
  { servers: "localhost" },
]
  .forEach(async (v) => {
    await connect(v)
      .then((nc) => {
        console.log(`connected to ${nc.getServer()}`);
        nc.close();
      })
      .catch(() => {
        console.log(`unable to connect to ${JSON.stringify(v)}`);
      });
  });
```

### Publish and Subscribe
The basic client operations are to `subscribe` to receive messages,
and publish to `send` messages. A subscription works as an async
iterator where you process messages in a loop until the subscription
closes.

NATS is payload agnostic, this means that payloads are `Uint8Arrays`.
You can easily send JSON or strings by using a `StringCodec` or a
`JSONCodec`, or create a Codec of your own that handles the type
of your data as necessary.

```javascript
const { connect, StringCodec } = require("nats");

(async () => {
  // create a connection to a nats-server
  const nc = await connect({ servers: "demo.nats.io" });

  // create a codec to encode/decode payloads
  const sc = StringCodec();

  // create a simple subscriber and iterate over messages
  // matching the subscription
  const sub = nc.subscribe("hello");
  (async () => {
    for await (const m of sub) {
      console.log(`[${sub.getProcessed()}]: ${sc.decode(m.data)}`);
    }
  })().then(() => {
    console.log("subscription closed");
  });

  // publish two messages to the nats-server
  nc.publish("hello", sc.encode("world"));
  nc.publish("hello", sc.encode("again"));

  // we want to insure that messages that are in flight
  // get processed, so we are going to drain the
  // connection. Drain is the same as close, but makes
  // sure that all messages in flight get seen
  // by the iterator. After calling drain on the connection
  // the connection closes.
  await nc.drain();
  console.log("connection ended");
})();

```

### Streams
Streams are messages that are published at regular intervals.
To get the messages, you simply subscribe to them. To stop
getting the messages you unsubscribe.

```javascript
const { connect, JSONCodec } = require("nats");

(async () => {
  // to create a connection to a nats-server:
  const nc = await connect({ servers: "demo.nats.io" });

  // create a codec
  const jc = JSONCodec();

  console.info("enter the following command to get messages from the stream");
  console.info(
    "node run examples/nats-sub.js -s demo.nats.io stream.demo",
  );

  const start = Date.now();
  let sequence = 0;
  setInterval(() => {
    sequence++;
    const uptime = Date.now() - start;
    console.info(`publishing #${sequence}`);
    nc.publish("stream.demo", jc.encode({ sequence, uptime }));
  }, 1000);
})();

```

### Wildcard Subscriptions
Sometimes you want to process an event (message), based on the
subject that was used to send it. In NATS this is accomplished
by specifying wildcards in the subscription. Subjects that match
the wildcards, are sent to the client.

In the example below, I am using 3 different subscription
to highlight that each subscription is independent. And if
the subject you use matches one or more of them, they all
will get a chance at processing the message.

```javascript
const { connect, StringCodec } = require("nats");

(async () => {
  const nc = await connect({ servers: "demo.nats.io" });
  const sc = StringCodec();

  // subscriptions can have wildcard subjects
  // the '*' matches any string in the specified token position
  const s1 = nc.subscribe("help.*.system");
  const s2 = nc.subscribe("help.me.*");
  // the '>' matches any tokens in that position or following
  // '>' can only be specified at the end
  const s3 = nc.subscribe("help.>");

  async function printMsgs(s) {
    let subj = s.getSubject();
    console.log(`listening for ${subj}`);
    const c = (13 - subj.length);
    const pad = "".padEnd(c);
    for await (const m of s) {
      console.log(
        `[${subj}]${pad} #${s.getProcessed()} - ${m.subject} ${
          m.data ? " " + sc.decode(m.data) : ""
        }`,
      );
    }
  }

  printMsgs(s1);
  printMsgs(s2);
  printMsgs(s3);

  // don't exit until the client closes
  await nc.closed();
})();

```


### Services
A service is a client that responds to requests from other clients.
Now that you know how to create subscriptions, and know about wildcards,
it is time to develop a service that mocks something useful.

This example is a bit complicated, because we are going to use NATS
not only to provide a service, but also to control the service.

```javascript
const { connect, StringCodec } = require("nats");

(async () => {
  // create a connection
  const nc = await connect({ servers: "demo.nats.io" });

  // create a codec
  const sc = StringCodec();

  // A service is a subscriber that listens for messages, and responds
  const started = Date.now();
  const sub = nc.subscribe("time");
  requestHandler(sub);

  // If you wanted to manage a service - well NATS is awesome
  // for just that - setup another subscription where admin
  // messages can be sent
  const msub = nc.subscribe("admin.*");
  adminHandler(msub);

  // wait for the client to close here.
  await nc.closed().then((err) => {
    let m = `connection to ${nc.getServer()} closed`;
    if (err) {
      m = `${m} with an error: ${err.message}`;
    }
    console.log(m);
  });

  // this implements the public service, and just prints
  async function requestHandler(sub) {
    console.log(`listening for ${sub.getSubject()} requests...`);
    let serviced = 0;
    for await (const m of sub) {
      serviced++;
      if (m.respond(sc.encode(new Date().toISOString()))) {
        console.info(
          `[${serviced}] handled ${m.data ? "- " + sc.decode(m.data) : ""}`,
        );
      } else {
        console.log(`[${serviced}] ignored - no reply subject`);
      }
    }
  }

  // this implements the admin service
  async function adminHandler(sub) {
    console.log(`listening for ${sub.getSubject()} requests [uptime | stop]`);

    // it would be very good to verify the origin of the request
    // before implementing something that allows your service to be managed.
    // NATS can limit which client can send or receive on what subjects.
    for await (const m of sub) {
      const chunks = m.subject.split(".");
      console.info(`[admin] handling ${chunks[1]}`);
      switch (chunks[1]) {
        case "uptime":
          // send the number of millis since up
          m.respond(sc.encode(`${Date.now() - started}`));
          break;
        case "stop":
          m.respond(sc.encode("stopping...."));
          // finish requests by draining the subscription
          await sub.drain();
          // close the connection
          const _ = nc.close();
          break;
        default:
          console.log(`ignoring request`);
      }
    }
  }
})();
```

### Making Requests
```javascript
const { connect, StringCodec } = require("nats");

(async () => {
  // create a connection
  const nc = await connect({ servers: "demo.nats.io:4222" });

  // create an encoder
  const sc = StringCodec();

  // a client makes a request and receives a promise for a message
  // by default the request times out after 1s (1000 millis) and has
  // no payload.
  await nc.request("time", sc.encode("hello!"), { timeout: 1000 })
    .then((m) => {
      console.log(`got response: ${sc.decode(m.data)}`);
    })
    .catch((err) => {
      console.log(`problem with request: ${err.message}`);
    });

  await nc.close();
})();


```

### Queue Groups
Queue groups allow scaling of services horizontally. Subscriptions for members of a 
queue group are treated as a single service, that means when you send a message
only a single client in a queue group will receive it. There can be multiple queue 
groups, and each is treated as an independent group. Non-queue subscriptions are
also independent.
```javascript
const {
  connect,
  StringCodec,
} = require("nats");

(async () => {
  async function createService(
    name,
    count = 1,
    queue = ""
  ) {
    const conns = [];
    for (let i = 1; i <= count; i++) {
      const n = queue ? `${name}-${i}` : name;
      const nc = await connect(
        { servers: "demo.nats.io:4222", name: `${n}` },
      );
      nc.closed()
        .then((err) => {
          if (err) {
            console.error(
              `service ${n} exited because of error: ${err.message}`,
            );
          }
        });
      // create a subscription - note the option for a queue, if set
      // any client with the same queue will be the queue group.
      const sub = nc.subscribe("echo", { queue: queue });
      const _ = handleRequest(n, sub);
      console.log(`${nc.options.name} is listening for 'echo' requests...`);
      conns.push(nc);
    }
    return conns;
  }

  const sc = StringCodec();

  // simple handler for service requests
  async function handleRequest(name, sub) {
    const p = 12 - name.length;
    const pad = "".padEnd(p);
    for await (const m of sub) {
      // respond returns true if the message had a reply subject, thus it could respond
      if (m.respond(m.data)) {
        console.log(
          `[${name}]:${pad} #${sub.getProcessed()} echoed ${sc.decode(m.data)}`,
        );
      } else {
        console.log(
          `[${name}]:${pad} #${sub.getProcessed()} ignoring request - no reply subject`,
        );
      }
    }
  }

  // let's create two queue groups and a standalone subscriber
  const conns = [];
  conns.push(...await createService("echo", 3, "echo"));
  conns.push(...await createService("other-echo", 2, "other-echo"));
  conns.push(...await createService("standalone"));

  const a = [];
  conns.forEach((c) => {
    a.push(c.closed());
  });
  await Promise.all(a);
})();

```

## Advanced Usage

### Authentication

Simple authentication just provides connection properties. The fundamental
mechanism for authentication relies on an ["authenticator"](index.d.ts).
Autheticators can be used for nkeys, and JWT authentication as well as
any other. In cases where you want to dynamically obtain credentials,
the authenticator is where you would provide this logic.

```typescript
// if the connection requires authentication, provide `user` and `pass` or 
// `token` options in the NatsConnectionOptions.
import { connect } from "src/mod.ts";

const nc1 = await connect({ port: ns.port, user: "jenny", pass: "867-5309" });
const nc2 = await connect({ port: ns.port, token: "s3cret!" });

// nkeys
const auth = nkeyAuthenticator(seed);
const nc3 = await connect({ port: ns.port, authenticator: auth });
```

### Flush
```javascript
// flush sends a PING request to the servers and returns a promise
// when the servers responds with a PONG. The flush guarantees that
// things you published have been delivered to the servers. Typically
// it is not necessary to use flush, but on tests it can be invaluable.
nc.publish('foo');
nc.publish('bar');
await nc.flush();
```

### Auto Unsubscribe
```javascript
// subscriptions can auto unsubscribe after a certain number of messages
nc.subscribe('foo', {max:10});
```

### Timeout Subscriptions
```javascript
// create subscription with a timeout, if no message arrives
// within the timeout, the function running the iterator with
// reject - depending on how you code it, you may need a
// try/catch block.
// import the connect function
const { connect, ErrorCode } = require("nats");

(async () => {
  // to create a connection to a nats-server:
  const nc = await connect({ servers: "demo.nats.io" });

  // create subscription with a timeout, if no message arrives
  // within the timeout, the subscription throws a timeout error
  const sub = nc.subscribe("hello", { timeout: 1000 });
  (async () => {
    for await (const m of sub) {
      console.log(`got message #${sub.getProcessed()}`);
    }
  })().catch((err) => {
    if (err.code === ErrorCode.TIMEOUT) {
      console.log(`sub timed out!`);
    } else {
      console.log(`sub iterator got an error!`);
    }
    nc.close();
  });

  await nc.closed();
})();
```

### Async vs. Callbacks

Previous versions of the JavaScript NATS clients specified callbacks
for message processing. This required complex handling logic when a
service required coordination of operations. Callbacks are an 
inversion of control anti-pattern.

The async APIs trivialize complex coordination and makes your code
easier to maintain. With that said, there are some implications:

- Async subscriptions buffer inbound messages.
- Subscription processing delays until the runtime executes the promise related 
microtasks at the end of an event loop.

In a traditional callback based library, I/O happens after all data yielded by 
a read in the current event loop completes processing. This means that
callbacks are invoked as part of processing. With async, processing is queued
up in a microtask queue. At the end of the event loop, the runtime processes 
the microtasks, which in turn resumes your functions. As expected, this 
increases latency, but also provides additional liveliness.

To reduce async latency, the NATS client allows processing a subscription 
in the same event loop that dispatched the message. Simply specify a `callback`
in the subscription options. The signature for a callback is 
`(err: (Error|null), msg: Msg) => void`. When specified, the subscription
iterator will never yield a message.

Note that `callback` likely shouldn't even be documented,  as likely it 
is a workaround to an underlying application problem where you should be 
considering a different strategy to horizontally scale your application, 
or reduce pressure on the clients, such as using queue workers, 
or more explicitly targeting messages.


### Lifecycle/Informational Events
Clients can get notification on various event types:
- `Events.DISCONNECT`
- `Events.RECONNECT`
- `Events.UPDATE`
- `Events.LDM`

The first two fire when a client disconnects and reconnects respectively.
The payload will be the server where the event took place.

The `UPDATE` event notifies whenever the client receives a cluster configuration
update. The `ServersChanged` interface provides two arrays: `added` and `deleted`
listing the servers that were added or removed. 

The `LDM` event notifies that the current server has signaled that it
is running in _Lame Duck Mode_ and will evict clients. Depending on the server
configuration policy, the client may want to initiate an ordered shutdown, and
initiate a new connection to a different server in the cluster.

```javascript
  const nc = await connect();
  (async () => {
    console.info(`connected ${nc.getServer()}`);
    for await (const s of nc.status()) {
      console.info(`${s.type}: ${s.data}`);
    }
  })().then();

  nc.closed()
    .then((err) => {
      console.log(
        `connection closed ${err ? " with error: " + err.message : ""}`,
      );
    });
```

To be aware of when a client closes, wait for the `closed()` promise to resolve.
When it resolves, the client has finished and won't reconnect.
