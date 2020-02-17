/*
 * Copyright 2013-2019 The NATS Authors
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
const describe = require('mocha').describe
const after = require('mocha').after
const before = require('mocha').before
const it = require('mocha').it

describe('UTF8', function () {
  const PORT = 1430
  let server

  // Start up our own nats-server
  before(function (done) {
    server = nsc.startServer(PORT, done)
  })

  // Shutdown our server
  after(function (done) {
    nsc.stopServer(server, done)
  })

  it('should do publish and subscribe with UTF8 payloads by default', function (done) {
    const nc = NATS.connect(PORT)
    // ½ + ¼ = ¾: 9 characters, 12 bytes
    const data = '\u00bd + \u00bc = \u00be'
    data.length.should.equal(9)
    Buffer.byteLength(data).should.equal(12)

    nc.subscribe('utf8', function (_, m) {
      should.exists(m)
      m.data.should.equal(data)
      nc.close()
      done()
    })

    nc.publish('utf8', data)
  })

  it('should allow encoding override with the encoding option', function (done) {
    const nc = NATS.connect({
      url: 'nats://localhost:' + PORT,
      encoding: 'ascii'
    })
    // ½ + ¼ = ¾: 9 characters, 12 bytes
    const utf8Data = '\u00bd + \u00bc = \u00be'
    const plainData = 'Hello World'

    nc.subscribe('utf8', function (_, m) {
      // Should be all 12 bytes..
      m.data.length.should.equal(12)
      // Should not be a proper utf8 string.
      m.data.should.not.equal(utf8Data)
    })

    nc.subscribe('plain', function (_, m) {
      m.data.should.equal(plainData)
      nc.close()
      done()
    })

    nc.publish('utf8', utf8Data)
    nc.publish('plain', plainData)
  })

  it('should not allow unsupported encodings', function (done) {
    try {
      NATS.connect({
        url: 'nats://localhost:' + PORT,
        encoding: 'foobar'
      })
      done('No error thrown, wanted Invalid Encoding Exception')
    } catch (err) {
      if (err.toString().indexOf('Invalid Encoding') < 0) {
        done('Bad Error, wanted Invalid Encoding')
      } else {
        done()
      }
    }
  })
})
