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

describe('Queues', () => {
  const PORT = 1425
  let server

  // Start up our own nats-server
  before(done => {
    server = nsc.startServer(PORT, done)
  })

  // Shutdown our server
  after(done => {
    nsc.stopServer(server, done)
  })

  it('should deliver a message to single member of a queue group', done => {
    const nc = NATS.connect(PORT)
    let received = 0
    nc.subscribe('foo', () => {
      received += 1
    }, { queue: 'myqueue' })
    nc.publish('foo')
    nc.flush(() => {
      should.exists(received)
      received.should.equal(1)
      nc.close()
      done()
    })
  })

  it('should deliver a message to only one member of a queue group', done => {
    const nc = NATS.connect(PORT)
    let received = 0
    const cb = () => {
      received += 1
    }
    for (let i = 0; i < 5; i++) {
      nc.subscribe('foo', cb, { queue: 'myqueue' })
    }
    nc.publish('foo')
    nc.flush(() => {
      received.should.equal(1)
      nc.close()
      done()
    })
  })

  it('should allow queue subscribers and normal subscribers to work together', done => {
    const nc = NATS.connect(PORT)
    const expected = 4
    let received = 0
    const recv = () => {
      received += 1
      if (received === expected) {
        nc.close()
        done()
      }
    }

    nc.subscribe('foo', recv, { queue: 'myqueue' })
    nc.subscribe('foo', recv)
    nc.publish('foo')
    nc.publish('foo')
    nc.flush()
  })

  it('should spread messages out equally (given random)', done => {
    /* jshint loopfunc: true */
    const nc = NATS.connect(PORT)
    const total = 5000
    const numSubscribers = 10
    const avg = total / numSubscribers
    const allowedVariance = total * 0.05
    const received = new Array(numSubscribers)

    for (var i = 0; i < numSubscribers; i++) {
      received[i] = 0
      nc.subscribe('foo.bar', ((index => () => {
        received[index] += 1
      })(i)), { queue: 'spreadtest' })
    }

    for (i = 0; i < total; i++) {
      nc.publish('foo.bar', 'ok')
    }

    nc.flush(() => {
      for (let i = 0; i < numSubscribers; i++) {
        Math.abs(received[i] - avg).should.be.below(allowedVariance)
      }
      nc.close()
      done()
    })
  })

  it('should deliver only one mesage to queue subscriber regardless of wildcards', done => {
    const nc = NATS.connect(PORT)
    let received = 0
    nc.subscribe('foo.bar', () => {
      received += 1
    }, {
      queue: 'wcqueue'
    })
    nc.subscribe('foo.*', () => {
      received += 1
    }, {
      queue: 'wcqueue'
    })
    nc.subscribe('foo.>', () => {
      received += 1
    }, {
      queue: 'wcqueue'
    })
    nc.publish('foo.bar')
    nc.flush(() => {
      received.should.equal(1)
      nc.close()
      done()
    })
  })

  it('should deliver to multiple queue groups', done => {
    const nc = NATS.connect(PORT)
    let received1 = 0
    let received2 = 0
    const num = 10

    nc.subscribe('foo.bar', () => {
      received1 += 1
    }, {
      queue: 'r1'
    })
    nc.subscribe('foo.bar', () => {
      received2 += 1
    }, {
      queue: 'r2'
    })

    for (let i = 0; i < num; i++) {
      nc.publish('foo.bar')
    }

    nc.flush(() => {
      received1.should.equal(num)
      received2.should.equal(num)
      nc.close()
      done()
    })
  })
})
