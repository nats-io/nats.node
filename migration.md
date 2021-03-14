# NATS.js 2.0 API Changes

V2 is a complete re-write of the client using a shared underlying client engine.
The new API is 100% compatible across all our supported JavaScript environments;
Code written for Node will work on Browser or Deno.

The new library is also `async` / `await`, while still supporting `callbacks`
for subscription handling if desired.

## General Changes:

- All API signatures are greatly simplified, with required arguments listed
  first. Optional arguments follow. In the case that the API takes two optional
  arguments, an empty value is required.
- Subscriptions and notifications are async iterators, but subscriptions can
  specify a `callback` if desired.
- Message payloads are always Uint8Arrays. Simple `Codec`s are provided to
  encode/decode strings, JSON, or custom data.

## Changes to Connect

Previous versions of the `connect(url, opts)` function depended on notifications
from an event listener, to know if the client connected, etc. The new version
changes to `connect(opts: ConnectionOptions): Promise<NatsConnection>.

If the connect resolves, you have a connection and you can use the client.
Otherwise depending on the connection options, the connection will fail.

Similarly, to detect that the connection closed, you had to register a handler.
The new API simplifies handling a closed connection by waiting for the promise
from `closed(): Promise<void|Error>`.

## Changes to `publish`

- Previous publish signature was:
  `publish(subject: string, msg?: any, reply?: string, callback?: Function):void`

The new signature is:
`publish(subject: string, data?: Uint8Array, opts?: PublishOptions): void`

The `PublishOptions` has the following interface:
`{ reply?: string, headers?: MsgHdrs }`

## Changes to `subscribe`

- Previous subscribe signature was:
  `subscribe(subject: string, opts: SubscribeOptions, callback: Function): number`

- The new signature is
  `subscribe(subject: string, opts?: SubscriptionOptions): Subscription`

`SubscriptionOptions` has the following interface:

```
{
  queue?: string;
  max?: number;
  timeout?: number;
  callback?: (err: NatsError | null, msg: Msg) => void;
}
```

The returned `Subscription` is an object. Providing functionality to `drain()`,
`unsubscribe()` and more:

```
{
  unsubscribe(max?: number): void;
  drain(): Promise<void>;
  isDraining(): boolean;
  isClosed(): boolean;
  getSubject(): string;
  getReceived(): number;
  getProcessed(): number;
  getPending(): number;
  getID(): number;
  getMax(): number | undefined;
}
```

Most importantly, subscriptions are `AsyncIterable<Msg>` - to process your
messages:

```
for await(const m of sub) {
 // process the message. When the subscription completes the loop ends.
}
```

If you want to use callbacks you can specify them as a subscription option. The
use of callbacks is discouraged.

Messages have the following interface:

```
{
  subject: string;
  sid: number;
  reply?: string;
  data: Uint8Array;
  headers?: MsgHdrs;
  respond(data?: Uint8Array, opts?: PublishOptions): boolean;
}
```

The respond method of the message returns true if the message had a reply
subject.

## Changes to `request`

- The previous request signature was:
  `request(subject: string, msg: any, options: RequestOptions, callback: Function): number;`
- The new signature is:
  `request(subject: string, data?: Uint8Array, opts?: RequestOptions): Promise<Msg>`

The `RequestOptions` interface has the following interface and defaults:

```
{
    timeout: number; // defaults to `1000`
    noMux: boolean; // defaults to `false`
    headers?: MsgHeaders;
    reply?: string
}
```

A request will either succeed and resolve to a message or fail with a timeout or
some other error. If specifying the connection options `headers` and
`noResponder`, requests sent to subjects that have no interest will immediately
fail with a `ErrorCode.NoResponders`.

## Error Codes

All error codes are now exported under `ErrorCode`.

## Error Handling

Previous versions of NATS.js typically emitted errors and had numerous handlers
you needed to specify. The new version provides an async iterator `status()`.
You can iterate to pull the latest notification. The notifications have the
interface: `{type: string, data?: string|ServersChanged}`. Available types are
available under: `Events`, which has available properties for `DISCONNECT`,
`RECONNECT`, `UPDATE`, `LDM` and `ERROR`.

The `ERROR` event will notify any runtime error returned by the server that
could not properly be dispatched to your client in a more direct way. For
example, if there's a problem publishing to a subject because the client doesn't
have permissions.

## Payloads

Previous versions of NATS.js created an encoded connection that required all
messages to be either binary, strings, or JSON. Version 2 simplifies the API by
making all payloads Uint8Arrays. User code that is interested in a different
format, can simply encode/decode as necessary.

The `StringCodec()` and `JSONCodec()` functions return an encoder interface:

```
export interface Codec<T> {
  encode(d: T): Uint8Array;
  decode(a: Uint8Array): T;
}
```

For StringCodec, encode coverts a string to UintArray and decodes an UintArray
into a string. JSONCodec does the same between objects and Uint8Arrays.

## Changed Configuration Properties

| Property                | Description                                                                                                                   |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `authenticator`         | A function that deals with providing credentials                                                                              |
| `debug`                 | If set to `true`, client will output to the console the raw protocol interactions. Only useful for developing the client.     |
| `headers`               | If set to `true`, client enables use of headers                                                                               |
| `maxPingOut`            | Maximum number of pings that go unanswered before a connection is considered stale                                            |
| `maxReconnectAttempts`  | maximum number of reconnect attempts before client closes                                                                     |
| `name`                  | A name identifying the client on the server for monitoring purposes                                                           |
| `noEcho`                | If `true` messages published by the client won't be visible to the client's subscriptions                                     |
| `noRandomize`           | If `true`, servers are tried in the order specified                                                                           |
| `noResponders`          | If `true` when making a request for which there are no reponders an error is returned. This functionality requires `headers`' |
| `pass`                  | Password for a connection                                                                                                     |
| `pedantic`              | If `true` server will emit pedantic responses. Only useful for developing the client                                          |
| `pingInterval`          | Number of milliseconds between client pings                                                                                   |
| `port`                  | Number of the port where the server is running                                                                                |
| `reconnect`             | If `false` the client will not attempt reconnects                                                                             |
| `reconnectDelayHandler` | A function with the interface `() => number` returning the number of milliseconds to wait before the next connection attempt  |
| `reconnectJitter`       | number of milliseconds to jitter a connection retry                                                                           |
| `reconnectJitterTLS`    | number of milliseconds to jitter a TLS connection                                                                             |
| `reconnectTimeWait`     | number of milliseconds between reconnect attempts                                                                             |
| `servers`               | A string or array of strings with server hostports                                                                            |
| `timeout`               | number milliseconds before a connection attempt is timed out                                                                  |
| `tls`                   | an object specifying a `TlsOptions` options. An empty object implies the client requires a TLS connection.                    |
| `token`                 | A string to be used as an authentication token                                                                                |
| `user`                  | string specifying the user name                                                                                               |
| `verbose`               | If `true` the server will emit verbose responses. Only useful for developing the client                                       |
| `waitOnFirstConnect`    | If `true` the client will keep attempting to connect if it has never connected                                                |
| `ignoreClusterUpdates`  | If `true` the client will ignore any cluster updates provided by the server.                                                  |
