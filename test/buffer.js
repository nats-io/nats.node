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

describe('Buffer', () => {
  const PORT = 1432
  let server

  // Start up our own nats-server
  before(done => {
    server = nsc.startServer(PORT, done)
  })

  // Shutdown our server
  after(done => {
    nsc.stopServer(server, done)
  })

  it('should allow sending and receiving raw buffers', done => {
    const nc = NATS.connect({
      url: 'nats://localhost:' + PORT,
      preserveBuffers: true
    })

    const validBuffer = Buffer.from('foo-bar')

    nc.subscribe('validBuffer', msg => {
      should(validBuffer.equals(msg)).equal(true)
      nc.close()
      done()
    })

    nc.publish('validBuffer', validBuffer)
  })

  it('should allow parsing raw buffers to json', done => {
    const nc = NATS.connect({
      url: 'nats://localhost:' + PORT,
      preserveBuffers: true,
      json: true
    })

    const jsonString = '{ "foo-bar": true }'
    const validBuffer = Buffer.from(jsonString)

    nc.subscribe('validBuffer', msg => {
      msg.should.eql({
        'foo-bar': true
      })
      nc.close()
      done()
    })

    nc.publish('validBuffer', validBuffer)
  })
})
