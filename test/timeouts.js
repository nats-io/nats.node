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
const net = require('net')
const after = require('mocha').after
const before = require('mocha').before
const describe = require('mocha').describe
const it = require('mocha').it

const PORT = 1428

describe('Timeout and max received events for subscriptions', () => {
  let server

  // Start up our own nats-server
  before(done => {
    server = nsc.startServer(PORT, done)
  })

  // Shutdown our server after we are done
  after(done => {
    nsc.stopServer(server, done)
  })

  // connect to a server that never sends data
  it('conn timeout - socket timeout', (done) => {
    const srv = net.createServer(() => {})
    srv.listen(0, () => {
      const p = srv.address().port
      const nc = NATS.connect({ port: p, timeout: 1000 })
      nc.on('connect', () => {
        done(new Error('should have failed'))
      })
      nc.on('error', (err) => {
        err.should.be.instanceof(NATS.NatsError)
        err.chainedError.should.be.instanceof(NATS.NatsError)
        err.chainedError.should.have.property('code', NATS.ErrorCode.CONN_TIMEOUT)
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
      err.chainedError.should.have.property('code', NATS.ErrorCode.CONN_TIMEOUT)
      done()
    })

    nc.on('connect', () => {
      done(new Error('should have failed'))
    })
  })

  // connect to a server that never sends data
  it('conn timeout - reconnects work', (done) => {
    const srv = net.createServer(() => {})
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

  it('should perform simple timeouts on subscriptions', done => {
    const nc = NATS.connect(PORT)
    nc.on('connect', () => {
      const startTime = new Date()
      nc.subscribe('foo', (err) => {
        if (err) {
          const elapsed = new Date() - startTime
          should.exists(elapsed)
          elapsed.should.be.within(45, 75)
          nc.close()
          done()
        }
      }, { timeout: 50, expected: 1 })
    })
  })

  it('should not timeout if exepected has been received', done => {
    const nc = NATS.connect(PORT)
    nc.on('connect', () => {
      nc.subscribe('foo', (_, m) => {
        m.data.should.be.equal('foo')
      }, { timeout: 50, expected: 1 })
      nc.publish('foo', 'foo')
      nc.flush(() => {
        nc.close()
        done()
      })
    })
  })

  it('should not timeout if unsubscribe is called', done => {
    const nc = NATS.connect(PORT)
    nc.on('connect', () => {
      let count = 0
      const sid = nc.subscribe('bar', (m) => {
        if (m === 'timeout') {
          done('got a timeout')
        }
        count++
        if (count === 1) {
          nc.unsubscribe(sid)
        }
      }, { timeout: 1000, expected: 2 })
      nc.publish('bar', '')
      nc.flush()
      setTimeout(() => {
        // terminate the test
        nc.close()
        done()
      }, 1500)
    })
  })

  it('timeout should unsubscribe', done => {
    const nc = NATS.connect(PORT)
    nc.on('connect', () => {
      let count = 0
      let err
      nc.subscribe('bar', (e) => {
        if (typeof err !== 'string') {
          err = e
        } else {
          count++
        }
      }, { timeout: 250, expected: 2 })
      setTimeout(() => {
        nc.publish('bar', '')
        nc.flush()
        nc.close()
        count.should.be.equal(0)
        should.exist(err)
        err.code.should.be.equal(NATS.ErrorCode.TIMEOUT_ERR)
        done()
      }, 1000)
    })
  })

  it('should perform simple timeouts on requests', done => {
    const nc = NATS.connect(PORT)
    nc.on('connect', () => {
      nc.request('foo', (err) => {
        err.should.be.instanceof(NATS.NatsError)
        err.should.have.property('code', NATS.ErrorCode.REQ_TIMEOUT)
        nc.close()
        done()
      }, null, { max: 1, timeout: 1000 })
    })
  })

  it('should perform simple timeouts on requests without specified number of messages', done => {
    const nc = NATS.connect(PORT)
    nc.on('connect', () => {
      nc.subscribe('foo', (_, m) => {
        nc.publish(m.reply)
      })

      let responses = 0
      nc.request('foo', (err) => {
        if (err) {
          responses.should.be.equal(1)
          err.should.be.instanceof(NATS.NatsError)
          err.should.have.property('code', NATS.ErrorCode.REQ_TIMEOUT)
          nc.close()
          done()
        }
        responses++
      }, null, { max: 2, timeout: 1000 })
    })
  })
})
