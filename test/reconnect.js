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
const afterEach = require('mocha').afterEach
const beforeEach = require('mocha').beforeEach
const describe = require('mocha').describe
const it = require('mocha').it
const net = require('net')

describe('Reconnect functionality', () => {
  const PORT = 1426
  const WAIT = 20
  const ATTEMPTS = 4
  let server

  // Start up our own nats-server
  beforeEach((done) => {
    server = nsc.startServer(PORT, done)
  })

  // Shutdown our server after we are done
  afterEach((done) => {
    nsc.stopServer(server, done)
  })

  it('should not emit a reconnecting event if suppressed', (done) => {
    const nc = NATS.connect({
      port: PORT,
      reconnect: false
    })
    should.exist(nc)
    nc.on('connect', () => {
      nsc.stopServer(server)
    })
    nc.on('reconnecting', () => {
      done(new Error('Reconnecting improperly called'))
    })
    nc.on('close', () => {
      nc.close()
      done()
    })
  })

  it('should emit a disconnect and a reconnecting event after proper delay', (done) => {
    const nc = NATS.connect({
      port: PORT,
      reconnectTimeWait: WAIT
    })
    let startTime
    should.exist(nc)
    nc.on('connect', () => {
      nsc.stopServer(server, () => {
        startTime = new Date()
      })
    })

    let first = true
    nc.on('reconnecting', () => {
      if (first) {
        first = false
        const elapsed = new Date() - startTime
        elapsed.should.be.within(WAIT, WAIT * 2)
        nc.close()
        done()
      }
    })
    nc.on('disconnect', () => {
      const elapsed = new Date() - startTime
      elapsed.should.be.within(0, 5 * WAIT)
    })
  })

  it('disconnect should only fire if connection disconnected', (done) => {
    const nc = NATS.connect({
      port: PORT,
      reconnectTimeWait: 100,
      maxReconnectAttempts: 5
    })

    nc.on('connect', () => {
      server.kill()
    })

    let reconnecting = 0
    nc.on('reconnecting', () => {
      reconnecting++
      if (reconnecting === 1) {
        server = nsc.startServer(PORT)
      }
    })

    nc.on('reconnect', () => {
      server.kill()
    })

    let disconnects = 0
    nc.on('disconnect', () => {
      disconnects++
    })

    nc.on('close', () => {
      disconnects.should.be.equal(2)
      done()
    })
  }).timeout(10000)

  it('should emit multiple reconnecting events and fail after maxReconnectAttempts', (done) => {
    const nc = NATS.connect({
      port: PORT,
      reconnectTimeWait: WAIT,
      maxReconnectAttempts: ATTEMPTS
    })
    let numAttempts = 0
    nc.on('connect', () => {
      nsc.stopServer(server, () => {})
    })
    nc.on('reconnecting', () => {
      numAttempts += 1
    })
    nc.on('close', () => {
      numAttempts.should.equal(ATTEMPTS)
      nc.close()
      done()
    })
  })

  it('should emit reconnecting events indefinitely if maxReconnectAttempts is set to -1', (done) => {
    const nc = NATS.connect({
      port: PORT,
      reconnectTimeWait: WAIT,
      maxReconnectAttempts: -1
    })
    let numAttempts = 0

    // stop trying after an arbitrary amount of elapsed time
    setTimeout(() => {
      // restart server and make sure next flush works ok
      if (server === null) {
        server = nsc.startServer(PORT)
      }
    }, 1000)

    nc.on('connect', () => {
      nsc.stopServer(server, () => {
        server = null
      })
    })
    nc.on('reconnecting', () => {
      numAttempts += 1
      // attempt indefinitely to reconnect
      nc.reconnects.should.equal(numAttempts)
      nc.connected.should.equal(false)
      nc.wasConnected.should.equal(true)
      nc.reconnecting.should.equal(true)
      // if maxReconnectAttempts is set to -1, the number of reconnects will always be greater
      nc.reconnects.should.be.above(nc.options.maxReconnectAttempts)
    })
    nc.on('reconnect', () => {
      nc.flush(() => {
        nc.close()
        done()
      })
    })
  })

  it('should succesfully reconnect to new server', (done) => {
    const nc = NATS.connect({
      port: PORT,
      reconnectTimeWait: 100
    })
    // Kill server after first successful contact
    nc.flush(() => {
      nsc.stopServer(server, () => {
        server = null
      })
    })
    nc.on('reconnecting', () => {
      // restart server and make sure next flush works ok
      if (server === null) {
        server = nsc.startServer(PORT)
      }
    })
    nc.on('reconnect', () => {
      nc.flush(() => {
        nc.close()
        done()
      })
    })
  })

  it('should succesfully reconnect to new server with subscriptions', (done) => {
    const nc = NATS.connect({
      port: PORT,
      reconnectTimeWait: 100
    })
    // Kill server after first successful contact
    nc.flush(() => {
      nsc.stopServer(server, () => {
        server = null
      })
    })
    nc.subscribe('foo', () => {
      nc.close()
      done()
    })
    nc.on('reconnecting', () => {
      // restart server and make sure next flush works ok
      if (server === null) {
        server = nsc.startServer(PORT)
      }
    })
    nc.on('reconnect', () => {
      nc.publish('foo')
    })
  })

  it('should succesfully reconnect to new server with queue subscriptions correctly', (done) => {
    const nc = NATS.connect({
      port: PORT,
      reconnectTimeWait: 100
    })
    // Kill server after first successful contact
    nc.flush(() => {
      nsc.stopServer(server, () => {
        server = null
      })
    })
    let received = 0
    // Multiple subscribers
    const cb = () => {
      received += 1
    }
    for (let i = 0; i < 5; i++) {
      nc.subscribe('foo', cb, {
        queue: 'myReconnectQueue'
      })
    }
    nc.on('reconnecting', () => {
      // restart server and make sure next flush works ok
      if (server === null) {
        server = nsc.startServer(PORT)
      }
    })
    nc.on('reconnect', () => {
      nc.publish('foo')
      nc.flush(() => {
        received.should.equal(1)
        nc.close()
        done()
      })
    })
  })

  it('should properly resync with inbound buffer non-nil', (done) => {
    const nc = NATS.connect({
      port: PORT,
      reconnectTimeWait: 100
    })

    // Send lots of data to ourselves
    nc.on('connect', () => {
      const sub = nc.subscribe('foo', () => {
        // Kill server on first message, inbound should still be full.
        nsc.stopServer(server, () => {
          sub.unsubscribe()
          server = nsc.startServer(PORT)
        })
      })
      const b = Buffer.alloc(4096).toString()
      for (let i = 0; i < 1000; i++) {
        nc.publish('foo', b)
      }
    })

    nc.on('reconnect', () => {
      nc.flush(() => {
        nc.close()
        done()
      })
    })
  })

  it('should not crash when sending a publish with a callback after connection loss', (done) => {
    const nc = NATS.connect({
      port: PORT,
      reconnectTimeWait: WAIT
    })
    should.exist(nc)
    nc.on('connect', () => {
      nsc.stopServer(server, () => {})
    })
    nc.on('disconnect', () => {
      nc.publishRequest('foo', 'reply', 'bar')
      nc.flush(() => {
        // fails to get here, but should not crash
      })
      server = nsc.startServer(PORT)
    })
    nc.on('reconnect', () => {
      nc.flush(() => {
        nc.close()
        done()
      })
    })
  })

  it('should execute callbacks if published during reconnect', (done) => {
    const nc = NATS.connect({
      port: PORT,
      reconnectTimeWait: 100
    })
    nc.on('reconnecting', () => {
      // restart server
      if (server === null) {
        nc.publish('foo')
        nc.flush(() => {
          nc.close()
          done()
        })
        server = nsc.startServer(PORT)
      }
    })
    nc.on('connect', () => {
      const s = server
      server = null
      nsc.stopServer(s)
    })
  })

  it('should not lose messages if published during reconnect', (done) => {
    // This checks two things if the client publishes while reconnecting:
    // 1) the message is published when the client reconnects
    // 2) the client's subscriptions are synced before the message is published
    const nc = NATS.connect({
      port: PORT,
      reconnectTimeWait: 100
    })
    nc.subscribe('foo', () => {
      nc.close()
      done()
    })
    nc.on('reconnecting', () => {
      // restart server
      if (server === null) {
        nc.publish('foo')
        server = nsc.startServer(PORT)
      }
    })
    nc.on('connect', () => {
      const s = server
      server = null
      nsc.stopServer(s)
    })
  })

  it('should emit reconnect before flush callbacks are called', (done) => {
    const nc = NATS.connect({
      port: PORT,
      reconnectTimeWait: 100
    })
    let reconnected = false
    nc.on('reconnecting', () => {
      // restart server
      if (server === null) {
        nc.flush(() => {
          nc.close()
          if (!reconnected) {
            done(new Error('Flush callback called before reconnect emitted'))
          }
          done()
        })
        server = nsc.startServer(PORT)
      }
    })
    nc.on('reconnect', () => {
      reconnected = true
    })
    nc.on('connect', () => {
      const s = server
      server = null
      nsc.stopServer(s)
    })
  })

  it('should preserve buffer between reconnect attempts', (done) => {
    let socket = null
    let msgs = 0
    const srv = net.createServer((c) => {
      socket = c
      c.write('INFO ' + JSON.stringify({
        server_id: 'TEST',
        version: '0.0.0',
        host: '127.0.0.1',
        port: srv.address.port,
        auth_required: false
      }) + '\r\n')
      c.on('data', (d) => {
        const r = d.toString()
        const lines = r.split('\r\n')
        lines.forEach((line) => {
          if (line === '\r\n') {
            return
          }
          if (/^CONNECT\s+/.test(line)) {
          } else if (/^PING/.test(line)) {
            c.write('PONG\r\n')
          } else if (/^SUB\s+/i.test(line)) {
          } else if (/^PUB\s+/i.test(line)) {
            msgs++
          } else if (/^UNSUB\s+/i.test(line)) {
          } else if (/^MSG\s+/i.test(line)) {
          } else if (/^INFO\s+/i.test(line)) {
          }
        })
      })
      c.on('error', () => {
        // we are messing with the server so this will raise connection reset
      })
    })
    let called = false
    let flushErr = false
    srv.listen(0, () => {
      const p = srv.address().port
      const nc = NATS.connect('nats://localhost:' + p, {
        reconnect: true,
        reconnectTimeWait: 250
      })
      nc.on('connect', () => {
        nc.pongs.push((err) => {
          if (err) {
            flushErr = true
          }
        })
        process.nextTick(() => {
          // this is going to fake an outstanding ping
          socket.destroy()
        })
      })
      nc.on('disconnect', () => {
        flushErr.should.be.true()
        nc.pending.length.should.be.equal(0)
        nc.pongs.length.should.be.equal(0)
        nc.publish('foo')
        nc.flush(() => {
          called = true
        })
      })
      nc.on('reconnecting', () => {
        should.exist(nc.pending)
        should.exist(nc.pongs)
        nc.pongs.length.should.be.equal(1)
      })
      nc.on('reconnect', () => {
        nc.flush()
        setTimeout(() => {
          msgs.should.be.equal(1)
          called.should.be.true()
          nc.close()
          srv.close(() => {
            done()
          }, 500)
        })
      })
    })
  })
})
