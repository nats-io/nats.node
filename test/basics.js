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
const net = require('net')

describe('Basics', () => {
  const PORT = 1423
  let server

  // Start up our own nats-server
  before(done => {
    server = nsc.startServer(PORT, done)
  })

  // Shutdown our server
  after(done => {
    nsc.stopServer(server, done)
  })

  it('should do basic subscribe and unsubscribe', done => {
    const nc = NATS.connect(PORT)
    const sid = nc.subscribe('foo', () => {})
    should.exist(sid)
    nc.unsubscribe(sid)
    nc.flush(() => {
      nc.close()
      done()
    })
  })

  it('should do count subscriptions', done => {
    const nc = NATS.connect(PORT)
    nc.numSubscriptions().should.be.equal(0)
    const sid = nc.subscribe('foo', () => {})
    nc.numSubscriptions().should.be.equal(1)
    nc.unsubscribe(sid)
    nc.numSubscriptions().should.be.equal(0)
    nc.close()
    done()
  })

  it('url is sanitized', done => {
    const nc = NATS.connect('localhost:' + PORT)
    nc.on('connect', () => {
      nc.currentServer.toString().should.equal('nats://localhost:' + PORT)
      nc.close()
      done()
    })
  })

  it('should do basic publish', done => {
    const nc = NATS.connect(PORT)
    nc.publish('foo')
    nc.flush(() => {
      nc.close()
      done()
    })
  })

  it('should fire a callback for subscription', done => {
    const nc = NATS.connect(PORT)
    nc.subscribe('foo', () => {
      nc.close()
      done()
    })
    nc.publish('foo')
  })

  it('should include the correct message in the callback', done => {
    const nc = NATS.connect(PORT)
    const data = 'Hello World'
    nc.subscribe('foo', (_, msg) => {
      should.exist(msg)
      data.should.equal(msg.data)
      nc.close()
      done()
    })
    nc.publish('foo', data)
  })

  it('should include the correct reply in the callback', done => {
    const nc = NATS.connect(PORT)
    const data = 'Hello World'
    const inbox = nc.createInbox()
    nc.subscribe('foo', (_, m) => {
      should.exist(m)
      m.data.should.equal(data)
      should.exist(m.reply)
      m.reply.should.equal(inbox)
      nc.close()
      done()
    })
    nc.publish('foo', data, inbox)
  })

  it('should do request-reply', done => {
    const nc = NATS.connect(PORT)
    const initMsg = 'Hello World'
    const replyMsg = 'Hello Back!'

    nc.subscribe('foo', (_, m) => {
      should.exist(m)
      m.data.should.equal(initMsg)
      should.exist(m.reply)
      m.reply.should.match(/_INBOX\.*/)
      nc.publish(m.reply, replyMsg)
    })

    nc.request('foo', (_, m) => {
      should.exist(m)
      m.data.should.equal(replyMsg)
      nc.close()
      done()
    }, initMsg)
  })

  it('should return a sub id for requests', done => {
    const nc = NATS.connect(PORT)
    const initMsg = 'Hello World'
    const replyMsg = 'Hello Back!'
    const expected = 1
    let received = 0

    // Add two subscribers. We will only receive a reply from one.
    nc.subscribe('foo', (_, msg) => {
      nc.publish(msg.reply, replyMsg)
    })

    nc.subscribe('foo', (_, msg) => {
      nc.publish(msg.reply, replyMsg)
    })

    const sub = nc.request('foo', _ => {
      nc.flush(() => {
        received.should.equal(expected)
        nc.close()
        done()
      })

      received += 1
      nc.unsubscribe(sub)
    }, initMsg)
  })

  it('should do single partial wildcard subscriptions correctly', done => {
    const nc = NATS.connect(PORT)
    const expected = 3
    let received = 0
    nc.subscribe('*', () => {
      received += 1
      if (received === expected) {
        nc.close()
        done()
      }
    })
    nc.publish('foo.baz') // miss
    nc.publish('foo.baz.foo') // miss
    nc.publish('foo')
    nc.publish('bar')
    nc.publish('foo.bar.3') // miss
    nc.publish('baz')
  })

  it('should do partial wildcard subscriptions correctly', done => {
    const nc = NATS.connect(PORT)
    const expected = 3
    let received = 0
    nc.subscribe('foo.bar.*', () => {
      received += 1
      if (received === expected) {
        nc.close()
        done()
      }
    })
    nc.publish('foo.baz') // miss
    nc.publish('foo.baz.foo') // miss
    nc.publish('foo.bar.1')
    nc.publish('foo.bar.2')
    nc.publish('bar')
    nc.publish('foo.bar.3')
  })

  it('should do full wildcard subscriptions correctly', done => {
    const nc = NATS.connect(PORT)
    const expected = 5
    let received = 0
    nc.subscribe('foo.>', () => {
      received += 1
      if (received === expected) {
        nc.close()
        done()
      }
    })
    nc.publish('foo.baz')
    nc.publish('foo.baz.foo')
    nc.publish('foo.bar.1')
    nc.publish('foo.bar.2')
    nc.publish('bar') // miss
    nc.publish('foo.bar.3')
  })

  it('should pass exact subject to callback', (done) => {
    const nc = NATS.connect(PORT)
    const subject = 'foo.bar.baz'
    nc.subscribe('*.*.*', (_, m) => {
      should.exist(m.subject)
      m.subject.should.equal(subject)
      nc.close()
      done()
    })
    nc.publish(subject)
  })

  it('should do callback after publish is flushed', (done) => {
    const nc = NATS.connect(PORT)
    nc.publish('foo')
    nc.flush(() => {
      nc.close()
      done()
    })
  })

  it('should do callback after flush', (done) => {
    const nc = NATS.connect(PORT)
    nc.flush(() => {
      nc.close()
      done()
    })
  })

  it('should handle an unsubscribe after close of connection', (done) => {
    const nc = NATS.connect(PORT)
    const sid = nc.subscribe('foo', () => {})
    nc.close()
    nc.unsubscribe(sid)
    done()
  })

  it('should not receive data after unsubscribe call', (done) => {
    const nc = NATS.connect(PORT)
    let received = 0
    const expected = 1

    const sid = nc.subscribe('foo', () => {
      nc.unsubscribe(sid)
      received += 1
    })

    nc.publish('foo')
    nc.publish('foo')
    nc.publish('foo')
    nc.flush(() => {
      received.should.equal(expected)
      nc.close()
      done()
    })
  })

  it('should pass sid properly to a message callback if requested', (done) => {
    const nc = NATS.connect(PORT)
    const sid = nc.subscribe('foo', (_, m) => {
      sid.should.equal(m.sid)
      nc.close()
      done()
    })
    nc.publish('foo')
  })

  it('should parse json messages', (done) => {
    const config = {
      port: PORT,
      json: true
    }
    const nc = NATS.connect(config)
    const jsonMsg = {
      key: true
    }
    nc.subscribe('foo1', (_, m) => {
      m.data.should.have.property('key').and.be.a.Boolean()
      nc.close()
      done()
    })
    nc.publish('foo1', jsonMsg)
  })

  it('should parse UTF8 json messages', (done) => {
    const config = {
      port: PORT,
      json: true
    }
    const nc = NATS.connect(config)
    const utf8msg = {
      key: 'CEDILA-Ç'
    }
    nc.subscribe('foo2', (_, m) => {
      m.data.should.have.property('key')
      m.data.key.should.equal('CEDILA-Ç')
      nc.close()
      done()
    })
    nc.publish('foo2', utf8msg)
  })

  it('echo false is honored', done => {
    let nc1 = NATS.connect({
      port: PORT,
      noEcho: true,
      name: 'no echo client'
    })
    nc1.on('error', err => {
      if (err.code === NATS.NATS_PROTOCOL_ERR) {
        nc1 = null
        done()
      }
    })

    nc1.flush(() => {
      const subj = NATS.createInbox()

      let count = 0
      nc1.subscribe(subj, () => {
        count++
      })

      const nc2 = NATS.connect({
        port: PORT,
        name: 'default client'
      })
      nc2.on('connect', () => {
        nc2.subscribe(subj, () => {
          count++
        })
      })

      nc2.flush(() => {
        nc1.publish(subj)
        nc2.flush(() => {
          nc1.flush(() => {
            should(count).be.equal(1)
            nc1.close()
            nc2.close()
            done()
          })
        })
      })
    })
  })

  it('echo is on by default', done => {
    let nc1 = NATS.connect({
      port: PORT,
      name: 'echo client'
    })
    nc1.on('error', err => {
      if (err.code === NATS.NATS_PROTOCOL_ERR) {
        nc1 = null
        done()
      }
    })

    nc1.flush(() => {
      var subj = NATS.createInbox()

      var count = 0
      nc1.subscribe(subj, () => {
        count++
      })

      var nc2 = NATS.connect({
        port: PORT,
        name: 'default client'
      })
      nc2.on('connect', () => {
        nc2.subscribe(subj, () => {
          count++
        })
      })

      nc2.flush(() => {
        nc1.publish(subj)
        nc2.flush(() => {
          nc1.flush(() => {
            count.should.be.equal(2)
            nc1.close()
            nc2.close()
            done()
          })
        })
      })
    })
  })

  it('connection drains when no subs', done => {
    const nc = NATS.connect(PORT)
    nc.on('error', err => {
      done(err)
    })
    nc.on('connect', () => {
      nc.drain(() => {
        nc.closed.should.be.true()
        done()
      })
    })
  })

  it('connection drain', done => {
    const subj = NATS.createInbox()

    const nc1 = NATS.connect(PORT)
    let c1 = 0
    nc1.on('error', err => {
      done(err)
    })
    let drainCB = false
    nc1.on('connect', () => {
      nc1.subscribe(subj, () => {
        c1++
        if (c1 === 1) {
          nc1.drain(() => {
            drainCB = true
            finish()
          })
        }
      }, { queue: 'q1' })
    })
    nc1.flush(() => {
      start()
    })

    const nc2 = NATS.connect(PORT)
    let c2 = 0
    nc2.on('error', err => {
      done(err)
    })
    nc2.on('connect', () => {
      nc2.subscribe(subj, () => {
        c2++
      }, { queue: 'q1' })
    })
    nc2.flush(() => {
      start()
    })

    let startCount = 0
    function start () {
      startCount++
      if (startCount === 2) {
        for (let i = 0; i < 10000; i++) {
          nc2.publish(subj)
        }
        nc2.flush(finish)
      }
    }

    let finishCount = 0
    function finish () {
      finishCount++
      if (finishCount === 2) {
        should(drainCB).be.true()
        should(c1 + c2).be.equal(10000, `c1: ${c1}  c2: ${c2}`)
        should(c1 >= 1).be.true('c1 got more than one message')
        should(c2 >= 1).be.true('c2 got more than one message')
        done()
        nc2.close()
      }
    }
  })

  it('subscription drain', done => {
    const subj = NATS.createInbox()

    const nc1 = NATS.connect(PORT)
    let c1 = 0
    let c2 = 0

    nc1.on('error', err => {
      done(err)
    })
    let sid1 = 0
    nc1.on('connect', () => {
      sid1 = nc1.subscribe(subj, () => {
        c1++
        if (c1 === 1) {
          nc1.drainSubscription(sid1, () => {
            finish()
          })
        }
      }, { queue: 'q1' })

      nc1.subscribe(subj, () => {
        c2++
      }, { queue: 'q1' })
    })

    nc1.flush(() => {
      start()
    })

    function start () {
      for (let i = 0; i < 10000; i++) {
        nc1.publish(subj)
      }
      nc1.flush(finish)
    }

    function finish () {
      should(c1 + c2).be.equal(10000, `c1: ${c1}  c2: ${c2}`)
      should(c1 >= 1).be.true('c1 got more than one message')
      should(c2 >= 1).be.true('c2 got more than one message')
      done()
      nc1.close()
    }
  })

  it('publish after drain fails', done => {
    const subj = NATS.createInbox()
    const nc1 = NATS.connect(PORT)

    nc1.flush(() => {
      nc1.drain()
      try {
        nc1.publish(subj)
      } catch (err) {
        if (err.code === NATS.CONN_CLOSED || err.code === NATS.CONN_DRAINING) {
          done()
        } else {
          done(err)
        }
      }
    })
  })

  it('request after drain fails toss', done => {
    const subj = NATS.createInbox()
    const nc1 = NATS.connect(PORT)

    nc1.flush(() => {
      nc1.drain()
      try {
        nc1.request(subj)
      } catch (err) {
        if (err.code === NATS.CONN_CLOSED || err.code === NATS.CONN_DRAINING) {
          done()
        } else {
          done(err)
        }
      }
    })
  })

  it('request after drain fails callback', done => {
    const subj = NATS.createInbox()
    const nc1 = NATS.connect(PORT)

    nc1.flush(() => {
      nc1.drain()
      try {
        nc1.request(subj, () => {})
      } catch (err) {
        if (err.code === NATS.CONN_CLOSED || err.code === NATS.CONN_DRAINING) {
          done()
        } else {
          done(err)
        }
      }
    })
  })

  it('reject drain after close', done => {
    const nc1 = NATS.connect(PORT)
    nc1.on('connect', () => {
      nc1.close()
      nc1.drain((err) => {
        if (err.code === NATS.CONN_CLOSED || err.code === NATS.CONN_DRAINING) {
          done()
        } else {
          done(err)
        }
      })
    })
  })

  it('reject drain subscription after close', done => {
    const nc1 = NATS.connect(PORT)
    nc1.on('connect', () => {
      nc1.close()
      nc1.drainSubscription(100, (err) => {
        if (err.code === NATS.CONN_CLOSED || err.code === NATS.CONN_DRAINING) {
          done()
        } else {
          done(err)
        }
      })
    })
  })

  it('reject subscribe on draining', done => {
    const nc1 = NATS.connect(PORT)
    nc1.on('connect', () => {
      nc1.drain()
      try {
        nc1.subscribe(NATS.createInbox(), () => {})
      } catch (err) {
        if (err.code === NATS.CONN_CLOSED || err.code === NATS.CONN_DRAINING) {
          done()
        } else {
          done(err)
        }
      }
    })
  })

  it('reject drain on draining', done => {
    const nc1 = NATS.connect(PORT)
    nc1.on('connect', () => {
      nc1.drain()
      nc1.drain((err) => {
        if (err.code === NATS.CONN_CLOSED || err.code === NATS.CONN_DRAINING) {
          done()
        } else {
          done(err)
        }
      })
    })
  })

  it('drain cleared timeout', done => {
    const nc1 = NATS.connect(PORT)
    nc1.on('connect', () => {
      const sid = nc1.subscribe(NATS.createInbox(), () => {}, { timeout: 250, expected: 1000 })
      const sub = nc1.subs[sid]
      nc1.drainSubscription(sid, () => {
        should(sub.timeout).is.null()
        nc1.close()
        done()
      })
    })
  })

  it.skip('json requests', done => {
    const nc = NATS.connect({ port: PORT, json: true })
    nc.on('connect', () => {
      let c = 0
      const subj = NATS.createInbox()
      nc.subscribe(subj, (m, reply) => {
        nc.publish(reply, m)
      })

      let str = 0
      let obj = 0
      let num = 0
      const h = m => {
        switch (typeof m) {
          case 'number':
            num++
            break
          case 'string':
            str++
            break
          case 'object':
            obj++
            break
        }
        c++
        if (c === 11) {
          str.should.be.equal(4)
          obj.should.be.equal(4)
          num.should.be.equal(3)
          nc.close()
          done()
        }
      }

      nc.flush(() => {
        // simplest signature - empty resolves to ''
        nc.requestOne(subj, h, 1000)

        // subj, payload, timeout, handler
        nc.requestOne(subj, 'a', 1000, h)
        nc.requestOne(subj, {}, 1000, h)
        nc.requestOne(subj, 10, 1000, h)

        nc.requestOne(subj, 'a', 1000, h)
        nc.requestOne(subj, {}, 1000, h)
        nc.requestOne(subj, 10, 1000, h)

        // this one is misleading, the option is really a payload
        nc.requestOne(subj, { queue: 'bar' }, 1000, h)

        nc.requestOne(subj, 'a', { queue: 'worker' }, 1000, h)
        nc.requestOne(subj, {}, { queue: 'worker' }, 1000, h)
        nc.requestOne(subj, 10, { queue: 'worker' }, 1000, h)
      })
    })
  })

  it('reject non-tls server', (done) => {
    const nc = NATS.connect({ port: PORT, tls: true })
    nc.on('error', (err) => {
      nc.close()
      err.should.be.instanceof(NATS.NatsError)
      err.should.have.property('code', NATS.NON_SECURE_CONN_REQ)
      done()
    })
  })

  it('should resend unsubs', (done) => {
    let conn
    let unsubs = 0
    const srv = net.createServer((c) => {
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
            c.write('MSG test 1 11\r\nHello World\r\n')
          } else if (/^UNSUB\s+/i.test(line)) {
            unsubs++
            if (unsubs === 1) {
              const args = line.split(' ')
              args.length.should.equal(3)
              // number of messages to when to unsub
              args[2].should.equal('10')
              // kick the client
              c.destroy()
              return
            }
            if (unsubs === 2) {
              const args = line.split(' ')
              args.length.should.equal(3)
              args[2].should.equal('9')
              conn.close()
              srv.close(() => {
                done()
              })
            }
          } else if (/^MSG\s+/i.test(line)) {
          } else if (/^INFO\s+/i.test(line)) {
          } else {
            // unknown
          }
        })
      })
      c.on('error', () => {
        // we are messing with the server so this will raise connection reset
      })
    })
    srv.listen(0, () => {
      const p = srv.address().port
      const nc = NATS.connect('nats://localhost:' + p, {
        reconnect: true,
        reconnectTimeWait: 250
      })
      conn = nc
      nc.on('connect', () => {
        const opts = { max: 10 }
        nc.subscribe('test', () => {}, opts)
      })
    })
  })

  it('sub ids should start at 1', (done) => {
    const nc = NATS.connect({ port: PORT, json: true, useOldRequestStyle: true })
    nc.on('connect', () => {
      const ssid = nc.subscribe(nc.createInbox(), () => {})
      ssid.should.be.equal(1)
      nc.close()
      done()
    })
  })
})
