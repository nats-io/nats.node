/*
 * Copyright 2020 The NATS Authors
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

/* jslint node: true */
'use strict'

// change '../' to 'nats' when copying
const nats = require('../')
const argv = require('minimist')(process.argv.slice(2))

const url = argv.s || nats.DEFAULT_URI
const creds = argv.creds
const subject = argv._[0]
const count = argv.c || 1
const len = argv.p || 0
let msg = argv._[1] || ''

if (!subject) {
  console.log('Usage: node-pubsub  [-s server] [--creds=filepath] <subject> [msg]')
  process.exit()
}

if (len) {
  for (let i = 0; i < len; i++) {
    msg += (i % 10) + ''
  }
}

// Connect to NATS server.
const opts = nats.creds(creds) || {}
opts.yieldTime = 1000
opts.name = 'bulk-pub'
const nc = nats.connect(url, opts)
  .on('connect', () => {
    (async () => {
      let i = 0
      for (i = 0; i < count; i++) {
        nc.publish(subject, msg)
        if (i % 1000 === 0) {
          console.info(`< ${i} messages`)
        }
      }
      nc.flush(() => {
        console.log(`Published ${i} messages`)
      })
    })()
  })

nc.on('error', (e) => {
  console.log('Error [' + nc.currentServer + ']: ' + e)
  process.exit()
})
