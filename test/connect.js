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

describe('Basic Connectivity', () => {
  const PORT = 1424
  const u = 'nats://localhost:' + PORT
  let server

  // Start up our own nats-server
  before(done => {
    server = nsc.startServer(PORT, done)
  })

  // Shutdown our server after we are done
  after(done => {
    nsc.stopServer(server, done)
  })

  it('should perform basic connect with port', () => {
    const nc = NATS.connect(PORT)
    should.exist(nc)
    nc.close()
  })

  it('should perform basic connect with uri', () => {
    const nc = NATS.connect(u)
    should.exist(nc)
    nc.close()
  })

  it('should perform basic connect with options arg', () => {
    const options = {
      url: u
    }
    const nc = NATS.connect(options)
    should.exist(nc)
    nc.close()
  })

  it('should emit a connect event', done => {
    const nc = NATS.connect(PORT)
    nc.on('connect', client => {
      client.should.equal(nc)
      nc.close()
      done()
    })
  })

  it('should emit error if no server available', done => {
    const nc = NATS.connect('nats://localhost:22222')
    nc.on('error', () => {
      nc.close()
      done()
    })
  })

  it('should emit connecting events and try repeatedly if configured and no server available', done => {
    const nc = NATS.connect({
      url: 'nats://localhost:22222',
      waitOnFirstConnect: true,
      reconnectTimeWait: 100,
      maxReconnectAttempts: 20
    })
    let connectingEvents = 0
    nc.on('error', () => {
      nc.close()
      done('should not have produced error')
    })
    nc.on('reconnecting', () => {
      connectingEvents++
    })
    setTimeout(() => {
      connectingEvents.should.be.within(5, 7)
      nc.close()
      done()
    }, 550)
  })

  it('should still receive publish when some servers are invalid', done => {
    const natsServers = ['nats://localhost:22222', u, 'nats://localhost:22223']
    const ua = NATS.connect({
      servers: natsServers
    })
    const ub = NATS.connect({
      servers: natsServers
    })
    let recvMsg = ''
    ua.subscribe('topic1', (_, msg) => {
      recvMsg = msg.msg
    })
    setTimeout(() => {
      ub.publish('topic1', 'hello')
    }, 100)
    setTimeout(() => {
      recvMsg.should.equal('hello')
      ua.close()
      ub.close()
      done()
    }, 100 * 2)
  })

  it('should still receive publish when some servers[noRandomize] are invalid', done => {
    const natsServers = ['nats://localhost:22222', u, 'nats://localhost:22223']
    const ua = NATS.connect({
      servers: natsServers,
      noRandomize: true
    })
    const ub = NATS.connect({
      servers: natsServers,
      noRandomize: true
    })
    let recvMsg
    ua.subscribe('topic1', (_, m) => {
      recvMsg = m.msg
    })
    setTimeout(() => {
      ub.publish('topic1', 'hello')
    }, 100)
    setTimeout(() => {
      recvMsg.should.equal('hello')
      ua.close()
      ub.close()
      done()
    }, 100 * 2)
  })

  it('should add a new cluster server', done => {
    const servers = [u, 'nats://localhost:22223']
    const nc = NATS.connect({
      servers: new Array(servers[0])
    })
    let contains = 0

    nc.on('connect', client => {
      client.addServer(servers[1])
      client.servers.forEach(_server => {
        if (servers.indexOf(_server.url.href) !== -1) {
          contains++
        }
      })
      contains.should.equal(servers.length)
      nc.close()
      done()
    })
  })
})
