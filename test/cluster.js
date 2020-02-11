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
/* jshint -W030 */
'use strict'

const NATS = require('../')
const nsc = require('./support/nats_server_control')
const should = require('should')
const url = require('url')
const after = require('mocha').after
const before = require('mocha').before
const describe = require('mocha').describe
const it = require('mocha').it

describe('Cluster', () => {
  const WAIT = 20
  const ATTEMPTS = 4

  const PORT1 = 15621
  const PORT2 = 15622

  const s1Url = 'nats://localhost:' + PORT1
  const s2Url = 'nats://localhost:' + PORT2

  let s1
  let s2

  // Start up our own nats-server
  before(done => {
    s1 = nsc.startServer(PORT1, () => {
      s2 = nsc.startServer(PORT2, () => {
        done()
      })
    })
  })

  // Shutdown our server
  after(done => {
    nsc.stopCluster([s1, s2], done)
  })

  it('should accept servers options', done => {
    const nc = NATS.connect({
      servers: [s1Url, s2Url]
    })
    should.exists(nc)
    nc.should.have.property('options')
    nc.options.should.have.property('servers')
    nc.should.have.property('servers')
    nc.servers.should.be.a.Array()
    nc.should.have.property('url')
    nc.flush(() => {
      nc.close()
      done()
    })
  })

  it('should randomly connect to servers by default', done => {
    const conns = []
    let s1Count = 0
    for (var i = 0; i < 100; i++) {
      const nc = NATS.connect({
        servers: [s1Url, s2Url]
      })
      conns.push(nc)
      const nurl = url.format(nc.url)
      if (nurl === s1Url) {
        s1Count++
      }
    }
    for (i = 0; i < 100; i++) {
      conns[i].close()
    }
    s1Count.should.be.within(35, 65)
    done()
  })

  it('should connect to first valid server', done => {
    const nc = NATS.connect({
      servers: ['nats://localhost:' + 21022, s1Url, s2Url]
    })
    nc.on('error', err => {
      done(err)
    })
    nc.on('connect', () => {
      nc.close()
      done()
    })
  })

  it('should emit error if no servers are available', done => {
    const nc = NATS.connect({
      servers: ['nats://localhost:' + 21022, 'nats://localhost:' + 21023]
    })
    nc.on('error', () => {
      nc.close()
      done()
    })
    nc.on('reconnecting', () => {
      // This is an error
      done('Should not receive a reconnect event')
    })
  })

  it('should not randomly connect to servers if noRandomize is set', done => {
    const conns = []
    let s1Count = 0
    for (var i = 0; i < 100; i++) {
      const nc = NATS.connect({
        noRandomize: true,
        servers: [s1Url, s2Url]
      })
      conns.push(nc)
      const nurl = url.format(nc.url)
      if (nurl === s1Url) {
        s1Count++
      }
    }
    for (i = 0; i < 100; i++) {
      conns[i].close()
    }
    s1Count.should.equal(100)
    done()
  })

  it('should not randomly connect to servers if dontRandomize is set', done => {
    const conns = []
    let s1Count = 0
    for (var i = 0; i < 100; i++) {
      const nc = NATS.connect({
        noRandomize: true,
        servers: [s1Url, s2Url]
      })
      conns.push(nc)
      const nurl = url.format(nc.url)
      if (nurl === s1Url) {
        s1Count++
      }
    }
    for (i = 0; i < 100; i++) {
      conns[i].close()
    }
    s1Count.should.equal(100)
    done()
  })

  it('should fail after maxReconnectAttempts when servers killed', done => {
    const nc = NATS.connect({
      noRandomize: true,
      servers: [s1Url, s2Url],
      reconnectTimeWait: WAIT,
      maxReconnectAttempts: ATTEMPTS
    })
    let startTime
    let numAttempts = 0
    nc.on('connect', () => {
      nsc.stopServer(s1, () => {
        s1 = null
        startTime = new Date()
      })
    })
    nc.on('reconnect', () => {
      nsc.stopServer(s2, () => {
        s2 = null
      })
    })
    nc.on('reconnecting', () => {
      const elapsed = new Date() - startTime
      if (nc.currentServer.lastConnect !== 0) {
        elapsed.should.be.within(nc.currentServer.lastConnect - Date.now(), 2 * WAIT)
      }
      startTime = new Date()
      numAttempts += 1
    })
    nc.on('close', () => {
      numAttempts.should.equal(ATTEMPTS * 2)
      nc.close()
      done()
    })
  })
})
