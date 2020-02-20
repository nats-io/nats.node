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
// Request Performance
/// ////////////////////////////////////

const loop = 100000
const hash = 1000
let received = 0

console.log('Request Performance Test')

nc1.on('connect', function () {
  const start = new Date()

  nc1.subscribe('request.test', function (_, m) {
    nc1.publish(m.reply, 'ok')
  })

  // Need to flush here since using separate connections.
  nc1.flush(function () {
    for (let i = 0; i < loop; i++) {
      nc2.request('request.test', function () {
        received += 1
        if (received === loop) {
          const stop = new Date()
          const rps = parseInt(loop / ((stop - start) / 1000), 10)
          console.log('\n' + rps + ' request-responses/sec')
          const latmicros = ((stop - start) * 1000) / (loop * 2)
          const lat = parseInt(latmicros, 10) // Request=2, Reponse=2 RTs
          console.log('Avg roundtrip latency: ' + lat + ' microseconds')
          log('rr', loop, stop - start, latmicros)
        } else if (received % hash === 0) {
          process.stdout.write('+')
        }
      }, 'help', { max: 1 })
    }
  })

  function log (op, count, time, latmicros) {
    fs.appendFile('rr.csv', [op, count, time, new Date().toDateString(), NATS.version, latmicros].join(',') + '\n', function (err) {
      if (err) {
        console.log(err)
      }
      process.exit()
    })
  }
})
