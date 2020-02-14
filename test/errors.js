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

describe('Errors', () => {
  const PORT = 1491
  let server

  // Start up our own nats-server
  before(done => {
    server = nsc.startServer(PORT, done)
  })

  // Shutdown our server after we are done
  after(done => {
    nsc.stopServer(server, done)
  })

  it('should throw errors on connect', done => {
    (() => {
      NATS.connect({
        url: 'nats://localhost:' + PORT,
        token: 'token1',
        user: 'foo'
      })
    }).should.throw(Error)
    done()
  })

  it('should throw errors on publish', done => {
    const nc = NATS.connect(PORT);
    // No subject
    (() => {
      nc.publish()
    }).should.throw(Error);
    // bad args
    (() => {
      nc.publish('foo', () => {}, 'bar')
    }).should.throw(Error);
    (() => {
      nc.publish('foo', 'bar', () => {}, 'bar')
    }).should.throw(Error)
    // closed
    nc.close();
    (() => {
      nc.publish('foo')
    }).should.throw(Error)
    done()
  })

  it('should throw errors on flush', done => {
    const nc = NATS.connect(PORT)
    nc.close();
    (() => {
      nc.flush()
    }).should.throw(Error)
    done()
  })

  it.skip('should pass errors on publish with callbacks', done => {
    const nc = NATS.connect(PORT)
    const expectedErrors = 4
    let received = 0

    const cb = err => {
      should.exist(err)
      if (++received === expectedErrors) {
        done()
      }
    }

    // No subject
    nc.publish(cb)
    // bad args
    nc.publish('foo', () => {}, 'bar', cb)
    nc.publish('foo', 'bar', () => {}, cb)

    // closed will still throw since we remove event listeners.
    nc.close()
    nc.publish('foo', cb)
  })

  it('should throw errors on subscribe', done => {
    const nc = NATS.connect(PORT)
    nc.close();
    // Closed
    (() => {
      nc.subscribe('foo')
    }).should.throw(Error)
    done()
  })

  it('NatsErrors have code', () => {
    const err = new NATS.NatsError('hello', 'helloid')
    should.equal(err.message, 'hello')
    should.equal(err.code, 'helloid')
  })

  it('NatsErrors can chain an error', () => {
    const srcErr = new Error('foo')
    const err = new NATS.NatsError('hello', 'helloid', srcErr)
    should.equal(err.message, 'hello')
    should.equal(err.code, 'helloid')
    should.equal(err.chainedError, srcErr)
    should.equal(err.name, 'NatsError')
  })

  it('should emit error on exception during handler', done => {
    const nc = NATS.connect(PORT)
    nc.on('error', err => {
      err.message.should.equal('die')
      nc.close()
      done()
    })
    nc.subscribe('*', () => {
      throw new Error('die')
    })
    nc.publish('baz')
  })
})
