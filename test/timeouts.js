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
/* global describe: false, before: false, after: false, it: false */
'use strict'

const NATS = require('../')
const nsc = require('./support/nats_server_control')
const should = require('should')
const net = require('net')

const PORT = 1428

describe('Timeout and max received events for subscriptions', function () {
  let server

  // Start up our own nats-server
  before(function (done) {
    server = nsc.startServer(PORT, done)
  })

  // Shutdown our server after we are done
  after(function (done) {
    nsc.stopServer(server, done)
  })

  // connect to a server that never sends data
  it('conn timeout - socket timeout', (done) => {
    const srv = net.createServer((c) => {})
    srv.listen(0, () => {
      const p = srv.address().port
      const nc = NATS.connect({ port: p, timeout: 1000 })
      nc.on('connect', () => {
        done(new Error('should have failed'))
      })
      nc.on('error', (err) => {
        err.should.be.instanceof(NATS.NatsError)
        err.chainedError.should.be.instanceof(NATS.NatsError)
        err.chainedError.should.have.property('code', NATS.CONN_TIMEOUT)
        srv.close(done)
      })
    })
  }, 15000)

  it('connection timeout - fail to connect quickly enough', (done) => {
    // this is not expecting to have enough time to connect
    const nc = NATS.connect('nats://connect.ngs.global', { timeout: 1 })
    nc.on('error', (err) => {
      err.should.be.instanceof(NATS.NatsError)
      err.chainedError.should.be.instanceof(NATS.NatsError)
      err.chainedError.should.have.property('code', NATS.CONN_TIMEOUT)
      done()
    })

    nc.on('connect', () => {
      done(new Error('should have failed'))
    })
  })

  // connect to a server that never sends data
  it('conn timeout - reconnects work', (done) => {
    const srv = net.createServer((c) => {})
    srv.listen(0, () => {
      const p = srv.address().port
      const nc = NATS.connect('nats://localhost:' + p, {
        timeout: 1000,
        servers: ['nats://localhost:' + PORT]
      })
      nc.on('connect', () => {
        nc.currentServer.url.host.should.be.equal('localhost:' + PORT)
        nc.close()
        srv.close(done)
      })
      nc.on('error', (err) => {
        done(new Error('shouldnt have failed: ' + err))
      })
    })
  }, 15000)

  it('connection timeout doesnt trigger', (done) => {
    const nc = NATS.connect({ port: PORT, timeout: 1000 })
    nc.on('error', (err) => {
      // shouldn't fail
      done(err)
    })
    setTimeout(() => {
      nc.connected.should.be.true()
      nc.close()
      done()
    }, 1500)
  })

  it('should perform simple timeouts on subscriptions', function (done) {
    const nc = NATS.connect(PORT)
    nc.on('connect', function () {
      const startTime = new Date()
      const sid = nc.subscribe('foo')
      nc.timeout(sid, 50, 1, function () {
        const elapsed = new Date() - startTime
        should.exists(elapsed)
        elapsed.should.be.within(45, 75)
        nc.close()
        done()
      })
    })
  })

  it('should not timeout if exepected has been received', function (done) {
    const nc = NATS.connect(PORT)
    nc.on('connect', function () {
      const sid = nc.subscribe('foo')
      nc.timeout(sid, 50, 1, function () {
        done(new Error('Timeout improperly called'))
      })
      nc.publish('foo', function () {
        nc.close()
        done()
      })
    })
  })

  it('should not timeout if unsubscribe is called', function (done) {
    const nc = NATS.connect(PORT)
    nc.on('connect', function () {
      let count = 0
      const sid = nc.subscribe('bar', function (m) {
        count++
        if (count === 1) {
          nc.unsubscribe(sid)
        }
      })
      nc.timeout(sid, 1000, 2, function () {
        done(new Error('Timeout improperly called'))
      })
      nc.publish('bar', '')
      nc.flush()
      setTimeout(function () {
        // terminate the test
        nc.close()
        done()
      }, 1500)
    })
  })

  it('timeout should unsubscribe', function (done) {
    const nc = NATS.connect(PORT)
    nc.on('connect', function () {
      let count = 0
      const sid = nc.subscribe('bar', function (m) {
        count++
      })
      nc.timeout(sid, 250, 2, function () {
        process.nextTick(function () {
          nc.publish('bar', '')
          nc.flush()
        })
      })
      setTimeout(function () {
        nc.close()
        should(count).equal(0)
        done()
      }, 1000)
    })
  })

  it('should perform simple timeouts on requests', function (done) {
    const nc = NATS.connect(PORT)
    nc.on('connect', function () {
      nc.request('foo', null, {
        max: 1,
        timeout: 1000
      }, function (err) {
        err.should.be.instanceof(NATS.NatsError)
        err.should.have.property('code', NATS.REQ_TIMEOUT)
        nc.close()
        done()
      })
    })
  })

  it('should perform simple timeouts on requests without specified number of messages', function (done) {
    const nc = NATS.connect(PORT)
    nc.on('connect', function () {
      nc.subscribe('foo', function (msg, reply) {
        nc.publish(reply)
      })

      let responses = 0
      nc.request('foo', null, {
        max: 2,
        timeout: 1000
      }, function (err) {
        if (!Object.hasOwnProperty.call(err, 'code')) {
          responses++
          return
        }
        responses.should.be.equal(1)
        err.should.be.instanceof(NATS.NatsError)
        err.should.have.property('code', NATS.REQ_TIMEOUT)
        nc.close()
        done()
      })
    })
  })

  it('should override request autoset timeouts', function (done) {
    const nc = NATS.connect(PORT)
    let calledOnRequestHandler = false
    nc.on('connect', function () {
      const sid = nc.request('foo', null, {
        max: 2,
        timeout: 1000
      }, () => {
        calledOnRequestHandler = true
      })

      nc.timeout(sid, 1500, 2, function (v) {
        calledOnRequestHandler.should.be.false()
        v.should.be.equal(sid)
        nc.close()
        done()
      })
    })
  })
})
