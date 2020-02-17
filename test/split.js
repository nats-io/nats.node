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
const should = require('should')
const after = require('mocha').after
const before = require('mocha').before
const describe = require('mocha').describe
const it = require('mocha').it

describe('Split Messages', () => {
  const PORT = 1427
  let server

  // Start up our own nats-server
  before(done => {
    server = nsc.startServer(PORT, done)
  })

  // Shutdown our server
  after(done => {
    nsc.stopServer(server, done)
  })

  it('should properly handle large # of messages from split buffers', done => {
    const nc = NATS.connect(PORT)

    const data = 'Hello World!'
    let received = 0
    const expected = 10000

    nc.subscribe('foo', (_, m) => {
      should.exists(m)
      m.data.should.equal(data)
      m.data.length.should.equal(data.length)
      received += 1
      if (received === expected) {
        nc.close()
        done()
      }
    })

    for (let i = 0; i < expected; i++) {
      nc.publish('foo', data)
    }
  })

  it('should properly handle large # of utf8 messages from split buffers', done => {
    const nc = NATS.connect(PORT)

    // Use utf8 string to make sure encoding works too.
    const data = '½ + ¼ = ¾'
    let received = 0
    const expected = 10000

    nc.subscribe('foo', (_, m) => {
      m.data.should.equal(data)
      m.data.length.should.equal(data.length)
      received += 1
      if (received === expected) {
        nc.close()
        done()
      }
    })

    for (let i = 0; i < expected; i++) {
      nc.publish('foo', data)
    }
  })
})
