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

describe('Callbacks', () => {
  const PORT = 1429
  let server

  // Start up our own nats-server
  before(done => {
    server = nsc.startServer(PORT, done)
  })

  // Shutdown our server
  after(done => {
    nsc.stopServer(server, done)
  })

  it('should not properly do a publish after connection is closed', done => {
    const nc = NATS.connect(PORT)
    nc.close()
    try {
      nc.publish('foo')
    } catch (err) {
      done()
    }
  })

  it('should properly do a flush callback after connection is closed', done => {
    const nc = NATS.connect(PORT)
    nc.close()
    nc.flush(err => {
      should.exist(err)
      done()
    })
  })

  it('request callbacks have message and reply', done => {
    const nc = NATS.connect(PORT)
    nc.flush(() => {
      nc.subscribe('rr', (msg, reply) => {
        nc.publish(reply, 'data', 'foo')
      })
    })

    nc.flush(() => {
      nc.requestOne('rr', 5000, (msg, reply) => {
        if (msg instanceof NATS.NatsError) {
          nc.close()
          done('Error making request', msg)
          return
        }
        msg.should.be.equal('data')
        reply.should.be.equal('foo')
        nc.close()
        done()
      })
    })
  })
})
