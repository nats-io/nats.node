/*
 * Copyright 2013-2020 The NATS Authors
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict'
// change '../' to 'nats' when copying
const nats = require('../')

// To easily encode and decode JSON payloads, set the 'json' connect property.
// All subscriptions will perform a JSON.parse(msg), all publisher will perform
// a JSON.stringify(msg).
// Since the option applies globally you cannot subscribe or publish other
// byte oriented payloads.

const nc = nats.connect({ json: true })

nc.on('connect', function () {
  nc.on('error', function (err) {
    console.log(err)
  })

  nc.subscribe('greeting', function (msg, reply) {
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
