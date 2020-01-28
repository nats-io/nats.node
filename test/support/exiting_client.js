#!/usr/bin/env node

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

/* jslint node: true */
'use strict'

const NATS = require('../..')
const fs = require('fs')

const count = process.argv.length
const port = parseInt(process.argv[count - 1], 10)
const nats = NATS.connect({
  port: port
})

nats.on('connect', () => {
  fs.writeFile('/tmp/existing_client.log', 'connected\n', err => {
    console.error(err)
  })
})

/* eslint-disable no-console */
/* eslint-disable no-process-exit */

nats.on('error', e => {
  fs.appendFile('/tmp/existing_client.log', 'got error\n' + e, err => {
    console.error(err)
  })
  process.exit(1)
})

nats.subscribe('close', (msg, replyTo) => {
  fs.appendFile('/tmp/existing_client.log', 'got close\n', err => {
    console.error(err)
  })
  if (replyTo) {
    nats.publish(replyTo, 'closing')
  }
  nats.flush(() => {
    nats.close()
    fs.appendFile('/tmp/existing_client.log', 'closed\n', err => {
      console.error(err)
    })
  })
})

nats.flush(() => {
  nats.publish('started', '')
})
