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
const after = require('mocha').after
const before = require('mocha').before
const describe = require('mocha').describe
const it = require('mocha').it
const should = require('should')

describe('Double SUBS', () => {
  const PORT = 1922
  const TLSPORT = 2292
  let server
  let tlsServer

  // Start up our own nats-server
  before(done => {
    const flags = ['-DV', '--tls', '--tlscert', './test/certs/server.pem',
      '--tlskey', './test/certs/key.pem']
    server = nsc.startServer(PORT, ['-DV'], () => {
      tlsServer = nsc.startServer(TLSPORT, flags, done)
    })
  })

  // Shutdown our server after we are done
  after(done => {
    nsc.stopServer(server, () => {
      nsc.stopServer(tlsServer, done)
    })
  })

  it('should not send multiple subscriptions on startup', done => {
    let subsSeen = 0
    const subRe = /(\[SUB foo \d])+/g

    // Capture log output from nats-server and check for double SUB protos.
    server.stderr.on('data', data => {
      while (subRe.exec(data) !== null) {
        subsSeen++
      }
    })

    const nc = NATS.connect(PORT)
    nc.subscribe('foo')
    nc.on('connect', nc => {
      setTimeout(() => {
        nc.close()
        should.equal(subsSeen, 1)
        done()
      }, 400)
    })
  })

  it('should not send multiple subscriptions on tls startup', done => {
    let subsSeen = 0
    const subRe = /(\[SUB foo \d])+/g

    // Capture log output from nats-server and check for double SUB protos.
    tlsServer.stderr.on('data', data => {
      while (subRe.exec(data) !== null) {
        subsSeen++
      }
    })

    const nc = NATS.connect({ port: TLSPORT, tls: { rejectUnauthorized: false } })
    nc.subscribe('foo')
    nc.on('connect', nc => {
      setTimeout(() => {
        nc.close()
        should.equal(subsSeen, 1)
        done()
      }, 400)
    })
  })
})
