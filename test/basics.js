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
const ErrorCode = require('../').ErrorCode
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
    const sub = nc.subscribe('foo', () => {})
    should.exist(sub)
    sub.unsubscribe()
    nc.flush(() => {
      nc.close()
      done()
    })
  })

  it('should do count subscriptions', done => {
    const nc = NATS.connect(PORT)
    nc.numSubscriptions().should.be.equal(0)
    const sub = nc.subscribe('foo', () => {})
    nc.numSubscriptions().should.be.equal(1)
    sub.unsubscribe()
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
    nc.publishRequest('foo', inbox, data)
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
      m.respond(replyMsg)
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
    nc.subscribe('foo', (_, m) => {
      m.respond(replyMsg)
    })

    nc.subscribe('foo', (_, m) => {
      m.respond(replyMsg)
    })

    const req = nc.request('foo', _ => {
      nc.flush(() => {
        received.should.equal(expected)
        nc.close()
        done()
      })

      received += 1
      req.cancel()
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
    const sub = nc.subscribe('foo', () => {})
    nc.close()
    sub.unsubscribe()
    done()
  })

  it('should not receive data after unsubscribe call', (done) => {
    const nc = NATS.connect(PORT)
    let received = 0
    const expected = 1

    const sub = nc.subscribe('foo', () => {
      sub.unsubscribe()
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
    const sub = nc.subscribe('foo', (_, m) => {
      sub.sid.should.equal(m.sid)
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
    const nc = NATS.connect(PORT)
    nc.on('error', err => {
      done(err)
    })
    nc.on('connect', () => {
      const s1 = nc.subscribe(subj, () => {
        if (s1.received === 1) {
          s1.drain()
        }
      }, { queue: 'q1' })

      const s2 = nc.subscribe(subj, () => {
      }, { queue: 'q1' })

      nc.flush(() => {
        start()
      })

      function start () {
        for (let i = 0; i < 10000; i++) {
          nc.publish(subj)
        }
        s2.drain(finish)
      }

      function finish () {
        should(s1.received + s2.received).be.equal(10000, `s1: ${s1.received}  s2: ${s2.received}`)
        should(s1.received >= 1).be.true('c1 got more than one message')
        should(s2.received >= 1).be.true('c2 got more than one message')
        done()
        nc.close()
      }
    })
  })

  it('publish after drain fails', done => {
    const subj = NATS.createInbox()
    const nc1 = NATS.connect(PORT)

    nc1.flush(() => {
      nc1.drain()
      try {
        nc1.publish(subj)
      } catch (err) {
        if (err.code === ErrorCode.CONN_CLOSED || err.code === ErrorCode.CONN_DRAINING) {
          done()
        } else {
          done(err)
        }
      }
    })
  })

  it('publish a request after drain fails', done => {
    const subj = NATS.createInbox()
    const nc1 = NATS.connect(PORT)

    nc1.flush(() => {
      nc1.drain()
      try {
        nc1.publishRequest(subj, nc1.createInbox())
      } catch (err) {
        if (err.code === ErrorCode.CONN_CLOSED || err.code === ErrorCode.CONN_DRAINING) {
          done()
        } else {
          done(err)
        }
      }
    })
  })

  it('publish a request after drain fails routes through callback', done => {
    const subj = NATS.createInbox()
    const nc1 = NATS.connect(PORT)

    nc1.flush(() => {
      nc1.drain()
      nc1.publishRequest(subj, nc1.createInbox(), '', (err) => {
        if (err.code === ErrorCode.CONN_CLOSED || err.code === ErrorCode.CONN_DRAINING) {
          done()
        } else {
          done(err)
        }
      })
    })
  })

  it('publish after drain fails routes through callback', done => {
    const subj = NATS.createInbox()
    const nc1 = NATS.connect(PORT)

    nc1.flush(() => {
      nc1.drain()
      nc1.publish(subj, '', (err) => {
        if (err.code === ErrorCode.CONN_CLOSED || err.code === ErrorCode.CONN_DRAINING) {
          done()
        } else {
          done(err)
        }
      })
    })
  })

  it('request after drain errors callback', done => {
    const subj = NATS.createInbox()
    const nc1 = NATS.connect(PORT)

    nc1.flush(() => {
      nc1.drain()
      nc1.request(subj, (err) => {
        if (err.code === ErrorCode.CONN_CLOSED || err.code === ErrorCode.CONN_DRAINING) {
          done()
        } else {
          done(err)
        }
      })
    })
  })

  it('reject drain after close calls callback', done => {
    const nc1 = NATS.connect(PORT)
    nc1.on('connect', () => {
      nc1.close()
      nc1.drain((err) => {
        if (err.code === ErrorCode.CONN_CLOSED || err.code === ErrorCode.CONN_DRAINING) {
          done()
        } else {
          done(err)
        }
      })
    })
  })

  it('reject drain after close without callback tosses', done => {
    const nc1 = NATS.connect(PORT)
    nc1.on('connect', () => {
      nc1.close()
      try {
        nc1.drain()
      } catch (err) {
        if (err.code === ErrorCode.CONN_CLOSED || err.code === ErrorCode.CONN_DRAINING) {
          done()
        } else {
          done(err)
        }
      }
    })
  })

  it('reject drain subscription after close', done => {
    const nc = NATS.connect(PORT)
    nc.on('connect', () => {
      const sub = nc.subscribe(nc.createInbox(), () => {})
      nc.close()
      sub.drain((err) => {
        if (err.code === ErrorCode.CONN_CLOSED || err.code === ErrorCode.CONN_DRAINING) {
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
      nc1.subscribe(NATS.createInbox(), (err) => {
        if (err.code === ErrorCode.CONN_CLOSED || err.code === ErrorCode.CONN_DRAINING) {
          done()
        } else {
          done(err)
        }
      })
    })
  })

  it('reject drain on draining', done => {
    const nc1 = NATS.connect(PORT)
    nc1.on('connect', () => {
      nc1.drain()
      nc1.drain((err) => {
        if (err.code === ErrorCode.CONN_CLOSED || err.code === ErrorCode.CONN_DRAINING) {
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
      const sub = nc1.subscribe(NATS.createInbox(), () => {}, { timeout: 250, expected: 1000 })
      sub.drain(() => {
        should(sub.timeout).is.null()
        nc1.close()
        done()
      })
    })
  })

  it('empty json', done => {
    const nc = NATS.connect({ port: PORT, json: true })

    nc.subscribe('q', (_, m) => {
      m.respond(m.data)
    })

    nc.request('q', (_, m) => {
      m.data.should.be.an.Object()
      m.data.should.be.empty()
    }, {})

    nc.flush(() => {
      done()
    })
  })

  it('json requests', done => {
    const nc = NATS.connect({ port: PORT, json: true })
    nc.on('connect', () => {
      let c = 0
      const subj = NATS.createInbox()
      nc.subscribe(subj, (_, m) => {
        m.respond(m.data)
      })

      let str = 0
      let obj = 0
      let num = 0
      const h = (_, m) => {
        switch (typeof m.data) {
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
        if (c === 3) {
          str.should.be.equal(1)
          obj.should.be.equal(1)
          num.should.be.equal(1)
          nc.close()
          done()
        }
      }

      nc.flush(() => {
        // subj, payload, timeout, handler
        nc.request(subj, h, 'a', { timeout: 1000 })
        nc.request(subj, h, {}, { timeout: 1000 })
        nc.request(subj, h, 10, { timeout: 1000 })
      })
    })
  })

  it('reject non-tls server', (done) => {
    const nc = NATS.connect({ port: PORT, tls: true })
    nc.on('error', (err) => {
      nc.close()
      err.should.be.instanceof(NATS.NatsError)
      err.should.have.property('code', ErrorCode.NON_SECURE_CONN_REQ)
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

  it('subs require subject', (done) => {
    const nc = NATS.connect(PORT)
    nc.subscribe('', (err) => {
      err.code.should.be.equal(NATS.ErrorCode.BAD_SUBJECT)
      nc.close()
      done()
    })
  })

  it('reqs require subject', (done) => {
    const nc = NATS.connect(PORT)
    nc.request('', (err) => {
      err.code.should.be.equal(NATS.ErrorCode.BAD_SUBJECT)
      nc.close()
      done()
    })
  })

  it('subs require callback', (done) => {
    const nc = NATS.connect(PORT)
    try {
      nc.subscribe('q')
      done(new Error('should have not subscribed'))
    } catch (err) {
      err.code.should.be.equal(NATS.ErrorCode.API_ERROR)
      nc.close()
      done()
    }
  })

  it('reqs require callback', (done) => {
    const nc = NATS.connect(PORT)
    try {
      nc.request('q')
      done(new Error('should have not requested'))
    } catch (err) {
      err.code.should.be.equal(NATS.ErrorCode.API_ERROR)
      nc.close()
      done()
    }
  })

  it('subs require valid opts', (done) => {
    const nc = NATS.connect(PORT)
    nc.subscribe('q', (err) => {
      err.code.should.be.equal(NATS.ErrorCode.BAD_OPTIONS)
      nc.close()
      done()
    }, 'string')
  })

  it('reqs require valid opts', (done) => {
    const nc = NATS.connect(PORT)
    nc.request('q', (err) => {
      err.code.should.be.equal(NATS.ErrorCode.BAD_OPTIONS)
      nc.close()
      done()
    }, '', 'string')
  })

  it('sub ids should start at 1', (done) => {
    const nc = NATS.connect({ port: PORT, json: true })
    nc.on('connect', () => {
      const sub = nc.subscribe(nc.createInbox(), () => {})
      sub.sid.should.be.equal(1)
      nc.close()
      done()
    })
  })

  it('msg has a sid', (done) => {
    const nc = NATS.connect(PORT)
    const subj = nc.createInbox()
    nc.subscribe(subj, (_, m) => {
      should.exist(m.sid)
      nc.close()
      done()
    })
    nc.publish(subj, 'hello')
  })

  it('requests can be cancelled', (done) => {
    const nc = NATS.connect(PORT)
    const subj = nc.createInbox()
    const req = nc.request(subj, () => {
      nc.close()
      done(new Error('should have not gotten a response'))
    }, '', { timeout: 100 })
    req.cancel()
    setTimeout(() => {
      done()
    }, 150)
  })

  it('error passes to callback', (done) => {
    const pc = NATS.connect(PORT)
    const nc = NATS.connect({ port: PORT, json: true })
    const subj = nc.createInbox()
    nc.subscribe(subj, (err, m) => {
      should.exist(err)
      should.exist(m)
      nc.close()
      pc.close()
      done()
    })

    pc.flush(() => {
      nc.flush()
      // this is some bad json, so the error should be captured
      // eslint-disable-next-line no-useless-escape
      pc.publish(subj, '{"p": "bad \"json\""')
    })
  })

  function rr (noMuxRequests, input, opts, delay) {
    return (done) => {
      const opts = { noMuxRequests: noMuxRequests, port: PORT }
      const nc = NATS.connect(opts)
      nc.on('connect', () => {
        const sub = nc.createInbox()
        nc.subscribe(sub, (_, m) => {
          setTimeout(() => {
            m.respond(input)
            const tokens = m.reply.split('.')
            if (noMuxRequests) {
              tokens.length.should.be.equal(2, m.reply)
            } else {
              tokens.length.should.be.equal(3, m.reply)
            }
          }, delay)
        })

        const req = nc.request(sub, (err, m) => {
          if (delay && opts.timeout && delay > opts.timeout) {
            should.exist(err)
            err.code.should.be.equal(NATS.ErrorCode.TIMEOUT_ERR)
          } else {
            should.not.exist(err)
            should.exist(m)
            m.data.should.equal(input)
          }
          if (noMuxRequests) {
            nc.numSubscriptions().should.be.equal(1)
          } else {
            nc.numSubscriptions().should.be.equal(2)
          }

          nc.close()
          done()
        }, '', opts)
        if (noMuxRequests) {
          req.sid.should.be.greaterThan(0)
        } else {
          req.sid.should.be.lessThan(0)
        }
      })
    }
  }

  it('should rr with muxsub', rr(false, 'A', {}, 0))
  it('should rr without muxsub', rr(true, 'B', {}, 0))
  it('should rr with muxsub with delay', rr(false, 'C', { timeout: 1000 }, 500))
  it('should rr without muxsub with delay', rr(true, 'D', { timeout: 1000 }, 500))
  it('should rr with muxsub can timeout', rr(false, 'E', { timeout: 100 }, 250))
  it('should rr without muxsub can timeout', rr(true, 'F', { timeout: 100 }, 250))
})
