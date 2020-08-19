# NATS.js 2.0 API Changes

V2 is a complete re-write of the client, making it reusable in all other supported JavaScript environments (Node, Browser, Node.js).

The API is not only 100% compatible, but actually leveraging the same underlying client engine. This means that code you write, is portable to our other supported platforms.

The new library is `async`/`await`.

## General Changes:

- All API signatures are greatly simplified. Required arguments listed first. Optional arguments follow. In the case that the API takes two optional arguments, an empty value must be provided.
- Callbacks have been eliminated. Instead subscriptions and notifications are async iterators.
- Message payloads are always Uint8Arrays. Simple codecs are provided to encode/decode between strings and JSON.
    

## Changes to `publish`

- Previous publish signature was:
`publish(subject: string, msg?: any, reply?: string, callback?: Function):void`

The new signature is:
`publish(subject: string, data?: Uint8Array, opts?: PublishOptions)`

The `PublishOptions` has the following interface: {reply?: string, headers?: MsgHdrs}`


## Changes to `subscribe`

- Previous subscribe signature was: `subscribe(subject: string, opts: SubscribeOptions, callback: Function): number`

- The new subscribe deprecates the handler into an option: `subscribe(subject: string, opts?: SubscriptionOptions): Subscription`

`SubscriptionOptions` has the following interface:
```
{
  queue?: string;
  max?: number;
  timeout?: number;
  callback?: (err: NatsError | null, msg: Msg) => void;
}
```

The returned `Subscription` is an object. Providing functionality to `drain()`, `unsubscribe()` and more.


Most importantly, subscriptions are `AsyncIterable<Msg>` - to process your messages:
```
for await(const m of sub) {
 // process the message. When the subscription
 // completes the loop ends.
}
```

Messages have all the fields you expect:

- `subject`
- `reply`
- `sid`
- `headers`
- `data`
- `respond(data?:Uint8Array, headers?:MsgHeaders)`

Again, payloads are Uint8Arrays.

## Changes to `request`
- The previous request signature was: `request(subject: string, msg: any, options: RequestOptions, callback: Function): number;`
- The new signature is: `request(subject: string, data?: Uint8Array, opts?: RequestOptions): Promise<Msg>`

The `RequestOptions` interface has the following interface and defaults:
```
{
    timeout: 1000,
    noMux: false
}
```
In all cases a request will either succeed and resolve to a message or fail with a timeout or some other error.
   


## Error Codes

All error codes are now exported under `ErrorCode`.

## Error Handling

Previous versions of NATS.js typically emitted errors and had numerous handlers you needed to specify.
The new version simply provides an async iterator `status()` which you can iterate to pull the latest notification.
The notifications have the interface: `{type: string, data?: string|ServersChanged}`. Available types are available under:
`Events`, which has available properties for `DISCONNECT`, `RECONNECT`, `UPDATE`, and `LDM`.



## Payloads

Previous versions of nats.js created an encoded connection that required all messages to be either binary,
strings, or JSON. Version 2, simplifies the API, by making all payloads Uint8Arrays. User code that is
interested in a different format, can simply encode/decode as necessary.

The `StringCodec()` and `JSONCodec()` functions return an encoder interface:

```
export interface Codec<T> {
  encode(d: T): Uint8Array;
  decode(a: Uint8Array): T;
}
```

For StringCodec, encode coverts a string to UintArray and decodes an UintArray into a string. JSONCodec does the same
between objects and Uint8Arrays.


## Changed Configuration Properties

| Property | Description |
| ---      | ---         |

| `authenticator`         |  A function that deals with providing credentials |
| `debug`                 | If set to `true`, client will output to the console the raw protocol interactions. Only useful for developing the client. |
| `headers`               | If set to `true`, client enables use of headers |
| `maxPingOut`            | Maximum number of pings that go unanswered before a connection is considered stale | 
| `maxReconnectAttempts`  | maximum number of reconnect attempts before client closes |
| `name`                  | A name identifying the client on the server for monitoring purposes |
| `noEcho`                | If `true` messages published by the client won't be visible to the client's subscriptions |
| `noRandomize`           | If `true`, servers are tried in the order specified |
| `noResponders`          | If `true` when making a request for which there are no reponders an error is returned. This functionality requires `headers`' |
| `pass`                  | Password for a connection |
| `pedantic`              | If `true` server will emit pedantic responses. Only useful for developing the client |
| `pingInterval`          | Number of milliseconds between client pings |
| `port`                  | Number of the port where the server is running |
| `reconnect`             | If `false` the client will not attempt reconnects |
| `reconnectDelayHandler` | A function with the interface `() => number` returning the number of milliseconds to wait before the next connection attempt |
| `reconnectJitter`       | number of milliseconds to jitter a connection retry |
| `reconnectJitterTLS`    | number of milliseconds to jitter a TLS connection |
| `reconnectTimeWait`     | number of milliseconds between reconnect attempts |
| `servers`               | A string or array of strings with server hostports |
| `timeout`               | number milliseconds before a connection attempt is timed out |
| `tls`                   | an object specifying a `TlsOptions` options. An empty object implies the client requires a TLS connection. |
| `token`                 | A string to be used as an authentication token |
| `user`                  | string specifying the user name |
| `verbose`               | If `true` the server will emit verbose responses. Only useful for developing the client | 
| `waitOnFirstConnect`    | If `true` the client will keep attempting to connect if it has never connected |
