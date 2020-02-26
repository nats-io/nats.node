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

describe('Subscription Events', () => {
  const PORT = 9422
  let server

  // Start up our own nats-server
  before(done => {
    server = nsc.startServer(PORT, done)
  })

  // Shutdown our server after we are done
  after(done => {
    nsc.stopServer(server, done)
  })

  it('should generate subscribe events', done => {
    const nc = NATS.connect(PORT)
    const subj = 'sub.event'
    nc.on('subscribe', (sub) => {
      should.exist(sub)
      should.exist(sub.sid)
      should.exist(sub.subject)
      sub.subject.should.equal(subj)
      nc.close()
      done()
    })
    nc.subscribe(subj, () => {})
  })

  it('should generate subscribe events with opts', done => {
    const nc = NATS.connect(PORT)
    const subj = 'sub.event'
    const queuegroup = 'bar'
    nc.on('subscribe', (sub) => {
      should.exist(sub)
      should.exist(sub.subject)
      sub.subject.should.equal(subj)
      should.exist(sub.queue)
      sub.queue.should.equal(queuegroup)
      nc.close()
      done()
    })
    nc.subscribe(subj, () => {}, { queue: queuegroup })
  })

  it('should generate unsubscribe events', done => {
    const nc = NATS.connect(PORT)
    const subj = 'sub.event'
    nc.on('unsubscribe', (sid, subject) => {
      should.exist(sid)
      should.exist(subject)
      subject.should.equal(subj)
      nc.close()
      done()
    })
    const sub = nc.subscribe(subj, () => {})
    sub.unsubscribe()
  })

  it('should generate unsubscribe events on auto-unsub', done => {
    const nc = NATS.connect(PORT)
    const subj = 'autounsub.event'
    nc.on('unsubscribe', (sid, subject) => {
      should.exist(sid)
      should.exist(subject)
      subject.should.equal(subj)
      nc.close()
      done()
    })
    nc.subscribe(subj, () => {}, { max: 1 })
    nc.publish(subj)
  })

  it('should generate only one unsubscribe events on auto-unsub', done => {
    const nc = NATS.connect(PORT)
    const subj = 'autounsub.event'
    let eventsReceived = 0
    const want = 5

    nc.on('unsubscribe', () => {
      eventsReceived++
    })
    const sub = nc.subscribe(subj, () => {})
    sub.unsubscribe(want)
    for (let i = 0; i < want; i++) {
      nc.publish(subj)
    }
    nc.flush(() => {
      eventsReceived.should.equal(1)
      nc.close()
      done()
    })
  })

  it('should generate unsubscribe events on request max', done => {
    const nc = NATS.connect(PORT)
    const subj = 'request.autounsub.event'

    nc.subscribe(subj, (_, m) => {
      m.respond('OK')
    })
    nc.request(subj, () => {}, null, { max: 1 })

    nc.on('unsubscribe', (sid, subject) => {
      should.exist(sid)
      should.exist(subject)
      nc.close()
      done()
    })
  })
})
