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

describe('Max responses and Auto-unsub', () => {
  const PORT = 1422
  let server

  // Start up our own nats-server
  before(done => {
    server = nsc.startServer(PORT, done)
  })

  // Shutdown our server after we are done
  after(done => {
    nsc.stopServer(server, done)
  })

  it('should only received max responses requested', done => {
    const nc = NATS.connect(PORT)
    const WANT = 10
    const SEND = 20
    let received = 0

    nc.subscribe('foo', () => {
      received += 1
    }, { max: WANT })
    for (let i = 0; i < SEND; i++) {
      nc.publish('foo')
    }
    nc.flush(() => {
      should.exists(received)
      received.should.equal(WANT)
      nc.close()
      done()
    })
  })

  it('should unsub if max messages already received', done => {
    const nc = NATS.connect(PORT)
    let gotOne = false
    const sid = nc.subscribe('foo', () => {
      if (!gotOne) {
        gotOne = true
        nc.unsubscribe(sid, 1)
      }
    })
    for (let i = 0; i < 2; i++) {
      nc.publish('foo')
    }
    nc.flush(() => {
      nc.numSubscriptions().should.be.equal(0)
      nc.close()
      done()
    })
  })

  it('should only received max responses requested (client support)', done => {
    const nc = NATS.connect(PORT)
    const WANT = 10
    const SEND = 20
    let received = 0

    const sid = nc.subscribe('foo', () => {
      received += 1
    })
    for (let i = 0; i < SEND; i++) {
      nc.publish('foo')
    }
    nc.unsubscribe(sid, WANT)

    nc.flush(() => {
      should.exists(received)
      received.should.equal(WANT)
      nc.close()
      done()
    })
  })

  it('should not complain when unsubscribing an auto-unsubscribed sid', done => {
    const nc = NATS.connect(PORT)
    const SEND = 20
    let received = 0

    const sid = nc.subscribe('foo', () => {
      received += 1
    }, { max: 1 })
    for (let i = 0; i < SEND; i++) {
      nc.publish('foo')
    }

    nc.flush(() => {
      nc.unsubscribe(sid)
      should.exists(received)
      received.should.equal(1)
      nc.close()
      done()
    })
  })

  it('should allow proper override to a lesser value ', done => {
    const nc = NATS.connect(PORT)
    const SEND = 20
    let received = 0

    const sid = nc.subscribe('foo', () => {
      received += 1
      nc.unsubscribe(sid, 1)
    })
    nc.unsubscribe(sid, SEND)

    for (let i = 0; i < SEND; i++) {
      nc.publish('foo')
    }

    nc.flush(() => {
      should.exists(received)
      received.should.equal(1)
      nc.close()
      done()
    })
  })

  it('should allow proper override to a higher value', done => {
    const nc = NATS.connect(PORT)
    const WANT = 10
    const SEND = 20
    let received = 0

    const sid = nc.subscribe('foo', () => {
      received += 1
    })
    nc.unsubscribe(sid, 1)
    nc.unsubscribe(sid, WANT)

    for (let i = 0; i < SEND; i++) {
      nc.publish('foo')
    }

    nc.flush(() => {
      should.exists(received)
      received.should.equal(WANT)
      nc.close()
      done()
    })
  })

  it('should only receive N msgs in request mode with multiple helpers', done => {
    /* jshint loopfunc: true */
    const nc = NATS.connect(PORT)
    let received = 0

    // Create 5 helpers
    for (let i = 0; i < 5; i++) {
      nc.subscribe('help', (msg, reply) => {
        nc.publish(reply, 'I can help!')
      })
    }

    nc.request('help', () => {
      received += 1
      nc.flush(() => {
        should.exists(received)
        received.should.equal(1)
        nc.close()
        done()
      })
    }, null, { max: 1 })
  })

  function requestSubscriptions (nc, done) {
    let received = 0

    nc.subscribe('help', (msg, reply) => {
      nc.publish(reply, 'I can help!')
    })

    /* jshint loopfunc: true */
    // Create 5 requests
    for (let i = 0; i < 5; i++) {
      nc.request('help', () => {
        received += 1
      }, null, { max: 1 })
    }
    nc.flush(() => {
      setTimeout(() => {
        received.should.equal(5)
        const expectedSubs = (nc.options.useOldRequestStyle ? 1 : 2)
        Object.keys(nc.subs).length.should.equal(expectedSubs)
        nc.close()
        done()
      }, 100)
    })
  }

  it('should not leak subscriptions when using max', done => {
    const nc = NATS.connect(PORT)
    requestSubscriptions(nc, done)
  })

  it('oldRequest should not leak subscriptions when using max', done => {
    const nc = NATS.connect({
      port: PORT,
      useOldRequestStyle: true
    })
    requestSubscriptions(nc, done)
  })

  function requestGetsWantedNumberOfMessages (nc, done) {
    let received = 0

    nc.subscribe('help', (msg, reply) => {
      nc.publish(reply, 'I can help!')
      nc.publish(reply, 'I can help!')
      nc.publish(reply, 'I can help!')
      nc.publish(reply, 'I can help!')
      nc.publish(reply, 'I can help!')
      nc.publish(reply, 'I can help!')
    })

    nc.request('help', () => {
      received++
    }, null, { max: 3 })

    nc.flush(() => {
      setTimeout(() => {
        received.should.equal(3)
        nc.close()
        done()
      }, 100)
    })
  }

  it('request should received specified number of messages', done => {
    /* jshint loopfunc: true */
    const nc = NATS.connect(PORT)
    requestGetsWantedNumberOfMessages(nc, done)
  })
})
