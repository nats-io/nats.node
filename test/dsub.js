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

const NATS = require('../')
const nsc = require('./support/nats_server_control')
const after = require('mocha').after
const before = require('mocha').before
const describe = require('mocha').describe
const it = require('mocha').it

describe('Double SUBS', () => {
  const PORT = 1922
  const flags = ['-DV']
  let server

  // Start up our own nats-server
  before(done => {
    server = nsc.startServer(PORT, flags, done)
  })

  // Shutdown our server after we are done
  after(done => {
    nsc.stopServer(server, done)
  })

  it('should not send multiple subscriptions on startup', done => {
    let subsSeen = 0
    const subRe = /(\[SUB foo \d\])+/g

    // Capture log output from nats-server and check for double SUB protos.
    server.stderr.on('data', data => {
      while (subRe.exec(data) !== null) {
        subsSeen++
      }
    })

    const nc = NATS.connect(PORT)
    nc.subscribe('foo', () => {})
    nc.on('connect', nc => {
      setTimeout(() => {
        nc.close()
        subsSeen.should.equal(1)
        done()
      }, 100)
    })
  })
})
