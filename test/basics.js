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

describe('Basics', function () {
  const PORT = 1423
  let server

  // Start up our own nats-server
  before(function (done) {
    server = nsc.startServer(PORT, done)
  })

  // Shutdown our server
  after(function (done) {
    nsc.stopServer(server, done)
  })

  it('should do basic subscribe and unsubscribe', function (done) {
    const nc = NATS.connect(PORT)
    const sid = nc.subscribe('foo')
    should.exist(sid)
    nc.unsubscribe(sid)
    nc.flush(function () {
      nc.close()
      done()
    })
  })

  it('should do basic publish', function (done) {
    const nc = NATS.connect(PORT)
    nc.publish('foo')
    nc.flush(function () {
      nc.close()
      done()
    })
  })

  it('should fire a callback for subscription', function (done) {
    const nc = NATS.connect(PORT)
    nc.subscribe('foo', function () {
      nc.close()
      done()
    })
    nc.publish('foo')
  })

  it('should include the correct message in the callback', function (done) {
    const nc = NATS.connect(PORT)
    const data = 'Hello World'
    nc.subscribe('foo', function (msg) {
      should.exist(msg)
      msg.should.equal(data)
      nc.close()
      done()
    })
    nc.publish('foo', data)
  })

  it('should include the correct reply in the callback', function (done) {
    const nc = NATS.connect(PORT)
    const data = 'Hello World'
    const inbox = nc.createInbox()
    nc.subscribe('foo', function (msg, reply) {
      should.exist(msg)
      msg.should.equal(data)
      should.exist(reply)
      reply.should.equal(inbox)
      nc.close()
      done()
    })
    nc.publish('foo', data, inbox)
  })

  it('should do request-reply', function (done) {
    const nc = NATS.connect(PORT)
    const initMsg = 'Hello World'
    const replyMsg = 'Hello Back!'

    nc.subscribe('foo', function (msg, reply) {
      should.exist(msg)
      msg.should.equal(initMsg)
      should.exist(reply)
      reply.should.match(/_INBOX\.*/)
      nc.publish(reply, replyMsg)
    })

    nc.request('foo', initMsg, function (reply) {
      should.exist(reply)
      reply.should.equal(replyMsg)
      nc.close()
      done()
    })
  })

  it('should return a sub id for requests', function (done) {
    const nc = NATS.connect(PORT)
    const initMsg = 'Hello World'
    const replyMsg = 'Hello Back!'
    const expected = 1
    let received = 0

    // Add two subscribers. We will only receive a reply from one.
    nc.subscribe('foo', function (msg, reply) {
      nc.publish(reply, replyMsg)
    })

    nc.subscribe('foo', function (msg, reply) {
      nc.publish(reply, replyMsg)
    })

    const sub = nc.request('foo', initMsg, function (reply) {
      nc.flush(function () {
        received.should.equal(expected)
        nc.close()
        done()
      })

      received += 1
      nc.unsubscribe(sub)
    })
  })

  it('should do single partial wildcard subscriptions correctly', function (done) {
    const nc = NATS.connect(PORT)
    const expected = 3
    let received = 0
    nc.subscribe('*', function () {
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

  it('should do partial wildcard subscriptions correctly', function (done) {
    const nc = NATS.connect(PORT)
    const expected = 3
    let received = 0
    nc.subscribe('foo.bar.*', function () {
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

  it('should do full wildcard subscriptions correctly', function (done) {
    const nc = NATS.connect(PORT)
    const expected = 5
    let received = 0
    nc.subscribe('foo.>', function () {
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
    nc.subscribe('*.*.*', function (msg, reply, subj) {
      should.exist(subj)
      subj.should.equal(subject)
      nc.close()
      done()
    })
    nc.publish(subject)
  })

  it('should do callback after publish is flushed', (done) => {
    const nc = NATS.connect(PORT)
    nc.publish('foo', function () {
      nc.close()
      done()
    })
  })

  it('should do callback after flush', (done) => {
    const nc = NATS.connect(PORT)
    nc.flush(function () {
      nc.close()
      done()
    })
  })

  it('should handle an unsubscribe after close of connection', (done) => {
    const nc = NATS.connect(PORT)
    const sid = nc.subscribe('foo')
    nc.close()
    nc.unsubscribe(sid)
    done()
  })

  it('should not receive data after unsubscribe call', (done) => {
    const nc = NATS.connect(PORT)
    let received = 0
    const expected = 1

    const sid = nc.subscribe('foo', function () {
      nc.unsubscribe(sid)
      received += 1
    })

    nc.publish('foo')
    nc.publish('foo')
    nc.publish('foo', function () {
      received.should.equal(expected)
      nc.close()
      done()
    })
  })

  it('should pass sid properly to a message callback if requested', (done) => {
    const nc = NATS.connect(PORT)
    const sid = nc.subscribe('foo', function (msg, reply, subj, lsid) {
      sid.should.equal(lsid)
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
    nc.subscribe('foo1', function (msg) {
      msg.should.have.property('key').and.be.a.Boolean()
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
    nc.subscribe('foo2', function (msg) {
      msg.should.have.property('key')
      msg.key.should.equal('CEDILA-Ç')
      nc.close()
      done()
    })
    nc.publish('foo2', utf8msg)
  })

  function requestOneGetsReply (nc, done) {
    const initMsg = 'Hello World'
    const replyMsg = 'Hello Back!'

    nc.subscribe('foo', function (msg, reply) {
      should.exist(msg)
      msg.should.equal(initMsg)
      should.exist(reply)
      reply.should.match(/_INBOX\.*/)
      nc.publish(reply, replyMsg)
    })

    let gotOne = false
    nc.requestOne('foo', initMsg, null, 1000, function (reply) {
      should.exist(reply)
      reply.should.equal(replyMsg)
      if (!gotOne) {
        gotOne = true
        nc.close()
        done()
      }
    })
  }

  it('should do requestone-get-reply', (done) => {
    const nc = NATS.connect(PORT)
    requestOneGetsReply(nc, done)
  })

  it('oldRequestOne should do requestone-get-reply', (done) => {
    const nc = NATS.connect({
      port: PORT,
      useOldRequestStyle: true
    })
    requestOneGetsReply(nc, done)
  })

  function requestOneWillUnsubscribe (nc, done) {
    const rsub = 'x.y.z'
    let count = 0

    nc.subscribe(rsub, function (msg, reply) {
      reply.should.match(/_INBOX\.*/)
      nc.publish(reply, 'y')
      nc.publish(reply, 'yy')
      nc.flush()
      setTimeout(function () {
        nc.publish(reply, 'z')
        nc.flush()
        nc.close()
        setTimeout(function () {
          count.should.equal(1)
          nc.close()
          done()
        }, 1000)
      }, 1500)
    })

    nc.requestOne(rsub, '', null, 1000, function (reply) {
      reply.should.not.be.instanceof(NATS.NatsError)
      should.exist(reply)
      count++
    })
  }

  it('should do requestone-will-unsubscribe', (done) => {
    // eslint-disable-next-line
        this.timeout(3000);
    const nc = NATS.connect(PORT)
    requestOneWillUnsubscribe(nc, done)
  })

  it('oldRequest: should do requestone-will-unsubscribe', (done) => {
    // eslint-disable-next-line
        this.timeout(3000);
    const nc = NATS.connect({
      port: PORT,
      useOldRequestStyle: true
    })
    requestOneWillUnsubscribe(nc, done)
  })

  function requestTimeoutTest (nc, done) {
    nc.requestOne('a.b.c', '', null, 1000, function (reply) {
      should.exist(reply)
      reply.should.be.instanceof(NATS.NatsError)
      reply.should.have.property('code', NATS.REQ_TIMEOUT)
      nc.close()
      done()
    })
  }

  it('should do requestone-can-timeout', function (done) {
    const nc = NATS.connect(PORT)
    requestTimeoutTest(nc, done)
  })

  it('old request one - should do requestone-can-timeout', function (done) {
    const nc = NATS.connect({
      port: PORT,
      useOldRequestStyle: true
    })
    requestTimeoutTest(nc, done)
  })

  function shouldUnsubscribeWhenRequestOneTimeout (nc, done) {
    let replies = 0
    let responses = 0
    // set a subscriber to respond to the request
    nc.subscribe('a.b.c', {
      max: 1
    }, function (msg, reply) {
      setTimeout(function () {
        nc.publish(reply, '')
        nc.flush()
        replies++
      }, 500)
    })

    // request one - we expect a timeout
    nc.requestOne('a.b.c', '', null, 250, function (reply) {
      reply.should.be.instanceof(NATS.NatsError)
      reply.should.have.property('code', NATS.REQ_TIMEOUT)
      if (!Object.hasOwnProperty.call(reply, 'code')) {
        responses++
      }
    })

    // verify reply was sent, but we didn't get it
    setTimeout(function () {
      should(replies).equal(1)
      should(responses).equal(0)
      nc.close()
      done()
    }, 1000)
  }

  it('should unsubscribe when request one timesout', function (done) {
    // eslint-disable-next-line
        this.timeout(3000);
    const nc = NATS.connect(PORT)
    shouldUnsubscribeWhenRequestOneTimeout(nc, done)
  })

  it('old requestOne should unsubscribe when request one timesout', function (done) {
    // eslint-disable-next-line
        this.timeout(3000);
    const nc = NATS.connect({
      port: PORT,
      useOldRequestStyle: true
    })
    shouldUnsubscribeWhenRequestOneTimeout(nc, done)
  })

  it('requestone has negative sids', (done) => {
    const nc = NATS.connect(PORT)
    nc.flush(function () {
      const sid = nc.requestOne('121.2.13.4', 1000, function (r) {
        should.fail("got message when it shouldn't have", r)
      })
      sid.should.be.type('number')
      sid.should.be.below(0)

      // this cancel returns the config
      const conf = nc.cancelMuxRequest(sid)

      // after cancel it shouldn't exit
      nc.respmux.requestMap.should.not.have.ownProperty(conf.token)
      nc.close()
      done()
    })
  })

  function paramTranspositions (nc, done) {
    let all = false
    let four = false
    let three = true
    let count = 0
    nc.flush(function () {
      nc.requestOne('a', NATS.EMPTY, {}, 1, function () {
        all = true
        called()
      })

      nc.requestOne('b', NATS.EMPTY, 1, function () {
        four = true
        called()
      })

      nc.requestOne('c', 1, function () {
        three = true
        called()
      })
    })

    function called () {
      count++
      if (count === 3) {
        all.should.be.true()
        four.should.be.true()
        three.should.be.true()
        nc.close()
        done()
      }
    }
  }

  it('requestOne: optional param transpositions', (done) => {
    const nc = NATS.connect(PORT)
    paramTranspositions(nc, done)
  })

  it('old requestOne: optional param transpositions', (done) => {
    const nc = NATS.connect({
      port: PORT,
      useOldRequestStyle: true
    })
    paramTranspositions(nc, done)
  })

  it('echo false is honored', function (done) {
    let nc1 = NATS.connect({
      port: PORT,
      noEcho: true,
      name: 'no echo client'
    })
    nc1.on('error', function (err) {
      if (err.code === NATS.NATS_PROTOCOL_ERR) {
        nc1 = null
        done()
      }
    })

    nc1.flush(function () {
      var subj = NATS.createInbox()

      var count = 0
      nc1.subscribe(subj, function () {
        count++
      })

      var nc2 = NATS.connect({
        port: PORT,
        name: 'default client'
      })
      nc2.on('connect', function () {
        nc2.subscribe(subj, function () {
          count++
        })
      })

      nc2.flush(function () {
        nc1.publish(subj)
        nc2.flush(function () {
          nc1.flush(function () {
            should(count).be.equal(1)
            nc1.close()
            nc2.close()
            done()
          })
        })
      })
    })
  })

  it('echo is on by default', function (done) {
    let nc1 = NATS.connect({
      port: PORT,
      name: 'echo client'
    })
    nc1.on('error', function (err) {
      if (err.code === NATS.NATS_PROTOCOL_ERR) {
        nc1 = null
        done()
      }
    })

    nc1.flush(function () {
      var subj = NATS.createInbox()

      var count = 0
      nc1.subscribe(subj, function () {
        count++
      })

      var nc2 = NATS.connect({
        port: PORT,
        name: 'default client'
      })
      nc2.on('connect', function () {
        nc2.subscribe(subj, function () {
          count++
        })
      })

      nc2.flush(function () {
        nc1.publish(subj)
        nc2.flush(function () {
          nc1.flush(function () {
            count.should.be.equal(2)
            nc1.close()
            nc2.close()
            done()
          })
        })
      })
    })
  })

  it('connection drains when no subs', function (done) {
    const nc = NATS.connect(PORT)
    nc.on('error', function (err) {
      done(err)
    })
    nc.on('connect', function () {
      nc.drain(() => {
        nc.closed.should.be.true()
        done()
      })
    })
  })

  it('connection drain', function (done) {
    const subj = NATS.createInbox()

    const nc1 = NATS.connect(PORT)
    let c1 = 0
    nc1.on('error', function (err) {
      done(err)
    })
    let drainCB = false
    nc1.on('connect', function () {
      nc1.subscribe(subj, { queue: 'q1' }, () => {
        c1++
        if (c1 === 1) {
          nc1.drain(() => {
            drainCB = true
            finish()
          })
        }
      })
    })
    nc1.flush(() => {
      start()
    })

    const nc2 = NATS.connect(PORT)
    let c2 = 0
    nc2.on('error', function (err) {
      done(err)
    })
    nc2.on('connect', function () {
      nc2.subscribe(subj, { queue: 'q1' }, () => {
        c2++
      })
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

  it('subscription drain', function (done) {
    const subj = NATS.createInbox()

    const nc1 = NATS.connect(PORT)
    let c1 = 0
    let c2 = 0

    nc1.on('error', function (err) {
      done(err)
    })
    let sid1 = 0
    nc1.on('connect', function () {
      sid1 = nc1.subscribe(subj, { queue: 'q1' }, () => {
        c1++
        if (c1 === 1) {
          nc1.drainSubscription(sid1, () => {
            finish()
          })
        }
      })

      nc1.subscribe(subj, { queue: 'q1' }, () => {
        c2++
      })
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

  it('publish after drain fails', function (done) {
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

  it('request after drain fails toss', function (done) {
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

  it('request after drain fails callback', function (done) {
    const subj = NATS.createInbox()
    const nc1 = NATS.connect(PORT)

    nc1.flush(() => {
      nc1.drain()
      nc1.request(subj, (err) => {
        if (err.code === NATS.CONN_CLOSED || err.code === NATS.CONN_DRAINING) {
          done()
        } else {
          done(err)
        }
      })
    })
  })

  it('oldrequest after drain fails callback', function (done) {
    const subj = NATS.createInbox()
    const nc1 = NATS.connect(PORT)

    nc1.flush(() => {
      nc1.drain()
      nc1.oldRequest(subj, (err) => {
        if (err.code === NATS.CONN_CLOSED || err.code === NATS.CONN_DRAINING) {
          done()
        } else {
          done(err)
        }
      })
    })
  })

  it('reject drain after close', function (done) {
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

  it('reject drainsubscription after close', function (done) {
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

  it('reject subscribe on draining', function (done) {
    const nc1 = NATS.connect(PORT)
    nc1.on('connect', () => {
      nc1.drain()
      nc1.subscribe(NATS.createInbox(), (err) => {
        if (err.code === NATS.CONN_CLOSED || err.code === NATS.CONN_DRAINING) {
          done()
        } else {
          done(err)
        }
      })
    })
  })

  it('reject drain on draining', function (done) {
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

  it('drain cleared timeout', function (done) {
    const nc1 = NATS.connect(PORT)
    nc1.on('connect', () => {
      const sid = nc1.subscribe(NATS.createInbox(), () => {})
      const sub = nc1.subs[sid]
      nc1.timeout(sid, 250, 1000, () => {
        done('timeout fired')
      })
      nc1.drainSubscription(sid, () => {
        should(sub.timeout).is.null()
        nc1.close()
        done()
      })
    })
  })

  it('json requests', function (done) {
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
      const h = function (m) {
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
        nc.requestOne(subj, 1000, h)

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

  it('json json old requests', function (done) {
    const nc = NATS.connect({ port: PORT, json: true, useOldRequestStyle: true })
    nc.on('connect', () => {
      let c = 0
      const subj = NATS.createInbox()
      nc.subscribe(subj, (m, reply) => {
        nc.publish(reply, m)
      })

      let str = 0
      let obj = 0
      let num = 0
      const h = function (m) {
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
        nc.requestOne(subj, 1000, h)

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
})
