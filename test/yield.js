/*
 * Copyright 2013-2019 The NATS Authors
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
/* global describe: false, before: false, after: false, it: false */
'use strict'

const NATS = require('../')
const nsc = require('./support/nats_server_control')
const sleep = require('./support/sleep')

describe('Yield', function () {
  const PORT = 1469
  let server

  // Start up our own nats-server
  before(function (done) {
    server = nsc.startServer(PORT, done)
  })

  // Shutdown our server
  after(function (done) {
    nsc.stopServer(server, done)
  })

  it('should yield to other events', function (done) {
    const nc = NATS.connect({
      port: PORT,
      yieldTime: 5
    })

    const start = Date.now()

    const timer = setInterval(function () {
      const delta = Date.now() - start
      nc.close()
      clearTimeout(timer)
      delta.should.within(10, 25)
      done()
    }, 10)

    nc.subscribe('foo', function () {
      sleep.sleep(1)
    })

    for (let i = 0; i < 256; i++) {
      nc.publish('foo', 'hello world')
    }
  })
})
