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

const NATS = require('../lib/nats')
const nats = NATS.connect()
const fs = require('fs')

/// ////////////////////////////////////
// Publish Performance
/// ////////////////////////////////////

const loop = 1000000
const hash = 2500

console.log('Publish Performance Test')

nats.on('connect', function () {
  const start = new Date()

  for (let i = 0; i < loop; i++) {
    nats.publish('test', 'ok')
    if (i % hash === 0) {
      process.stdout.write('+')
    }
  }

  nats.flush(function () {
    const stop = new Date()
    const mps = parseInt(loop / ((stop - start) / 1000), 10)
    log('pub', loop, stop - start)
    console.log('\nPublished at ' + mps + ' msgs/sec')
  })

  function log (op, count, time) {
    if (process.argv.length === 2) {
      fs.appendFile('pub.csv', [op, count, time, new Date().toDateString(), NATS.version].join(',') + '\n', function (err) {
        if (err) {
          console.log(err)
        }
        process.exit()
      })
    } else {
      // running for sub test, don't record
      process.exit()
    }
  }
})
