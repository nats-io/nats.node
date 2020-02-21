# NATS.js 2.0 API Changes

## General Changes:
    
- All API signatures have required arguments listed first. Optional arguments follow. In the case that the API takes two optional arguments, an empty value must be provided.
    
- Callback signatures have been normalized. Now all callbacks derive from: `(err: NatsError | null)`.
    
- If an API call takes a callback, the callback will be used to deliver error messages when making the call. For callbacks executing in an async context, they will also be used to deliver any other error - such as a timeout, etc.
    

## Changes to `publish`

- Previous publish signature was:
`publish(subject: string, msg?: any, reply?: string, callback?: Function):void`

- Replaced old publish with two APIs:
    - `publish(subject: string, data?: any, callback?: Callback): void`
    - `publishRequest(subject: string, reply: string, data?: any, callback?: Callback): void`
    
- To publish requests that reply to your own subscription handlers, use `publishRequest()`.

## Changes to `subscribe`

- Previous subscribe signature was: `subscribe(subject: string, opts: SubscribeOptions, callback: Function): number`

- The new subscribe API makes the subscription handler required, and moves the optional subscription options, to the last argument: `subscribe(subject: string, callback: MsgCallback, opts?: SubscriptionOptions): void`
```
nc.subscribe(subj, (err, m) => {
    if(err) {
        console.error(err)
        return
    }
    console.log(`data: ${m.data}`)
    console.log(`subject: ${m.subject}`)
    console.log(`reply: ${m.reply}`)
    console.log(`sid: ${m.sid}`)
}, {max: 5, timeout: 1000, expected: 1, queue: 'queue})
```

- The more extensive change is in the message callback provided to both subscriptions and requests. See [MessageCallbacks](#message-callbacks) 

- Old subscription API returned a number, the new  API returns a subscription object. The subscription object provides a `unsubscribe()` and `drain()`:
```
const sub = nc.subscribe(subj, (err, m) => {
  // do something with the message
})
// unsubscribe after 10 messages
sub.unsubscribe(10)

// drain the subscription
sub.drain(() => {
})
```

## Changes to `request`
- The previous request signature was: `request(subject: string, msg: any, options: RequestOptions, callback: Function): number;`
- The new signatures is: `request(subject: string, callback: MsgCallback, data?: any, options?: RequestOptions): number`

- The new signature again moves all required arguments `subject` and `callback` to the front of the call.
```
nc.request(subj, (err, m) => {
    if(err) {
        console.error(err)
        return
    }
    console.log(`data: ${m.data}`)
    console.log(`subject: ${m.subject}`)
    console.log(`reply: ${m.reply}`)
    console.log(`sid: ${m.sid}`)
}, 'help', '{timeout: 1000, max: 1})
```

- The more extensive change is in the message callback provided to both subscriptions and requests. See [MessageCallbacks](#message-callbacks) 

- `request()` now returns an object

- Requests can be cancelled before they timeout by invoking `cancel()` on the request.

   
## Message Callbacks

Messages callbacks have been normalized in NATS.js 2.0 - Standard Node.js pattern is `(err, args...)`, and NATS.js 2.0 now follows this pattern.
In addition we took the opportunity to consolidate all the arguments provided to a message callback into an object. This removes any ambiguity about the callback arguments or any ordering.
```
(data: any|null, reply: string|null, subject: string, sid: number)
```

new callback is:

```
(err: NatsError | null, m: Message)
```

If there was an error, the `err` argument will always be set.
If no error, the message argument follows the interface:

```
{
    subject: string;
    reply?: string;
    data?: any;
    sid: number;
}
```

- Message allows to respond to requests:
```
nc.subscribe(subj, (err, m) => {
    if(err) {
        console.error(err)
        return
    }
    // echo back to the client - note this can throw if the connection is closed
    m.respond(m.data)
}, {queue: 'queue})
```

    
## `timeout`

The `timeout` API allowed setting up a timer on a subscription. The timer would trigger if the subscription didn't receive the expected number of messages in the specified time. Timeouts can now be specified directly as a subscription or request option. If a timeout happens, the message callback associated with the subscription or request will be invoked with a timeout error.

## Error Codes

Previous error codes were exported constants. They have been organized into an exported `ErrorCode` object. This clearly expresses that these constants are codes that can be compared with any `NatsError.code` property.

## Error Handling

Previous versions of NATS.js typically emitted errors. Error emitting provided no insight as to the context of the error. With the new message callback mechanism, it is a better experience to route the errors to it's callback when possible. In some cases, such as API errors like missing a required argument such as subject or callbacks in `subscribe` and `request`.
 
 If no callback is provided or is the callback is not a function, the error will be thrown for all API usage errors.

Errors emitted by the server or some other condition not associated or mappable to a provided callback will be emitted as before.
