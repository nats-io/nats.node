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

const fs = require('fs')
const NATS = require('../lib/nats')
const nc1 = NATS.connect()
const nc2 = NATS.connect()

/// ////////////////////////////////////
// Publish/Subscribe Performance
/// ////////////////////////////////////

const loop = 1000000
const hash = 2500

console.log('Publish/Subscribe Performance Test')

nc1.on('connect', function () {
  let received = 0
  const start = new Date()

  nc1.subscribe('test', function () {
    received += 1

    if (received === loop) {
      const stop = new Date()
      const mps = parseInt(loop / ((stop - start) / 1000), 10)
      console.log('\nPublished/Subscribe at ' + mps + ' msgs/sec')
      console.log('Received ' + received + ' messages')
      log('pubsub', loop, stop - start)
    }
  })

  // Make sure sub is registered
  nc1.flush(function () {
    for (let i = 0; i < loop; i++) {
      nc2.publish('test', 'ok')
      if (i % hash === 0) {
        process.stdout.write('+')
      }
    }
  })

  function log (op, count, time) {
    fs.appendFile('pubsub.csv', [op, count, time, new Date().toDateString(), NATS.version].join(',') + '\n', function (err) {
      if (err) {
        console.log(err)
      }
      process.exit()
    })
  }
})
