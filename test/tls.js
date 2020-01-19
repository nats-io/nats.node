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
const fs = require('fs')

describe('TLS', function () {
  const PORT = 1442
  const TLSPORT = 1443
  const TLSVERIFYPORT = 1444

  let server
  let tlsServer
  let tlsVerifyServer

  // Start up our own nats-server for each test
  // We will start a plain, a no client cert, and a client cert required.
  before(function (done) {
    server = nsc.startServer(PORT, function () {
      const flags = ['--tls', '--tlscert', './test/certs/server.pem',
        '--tlskey', './test/certs/key.pem'
      ]
      tlsServer = nsc.startServer(TLSPORT, flags, function () {
        const flags = ['--tlsverify', '--tlscert', './test/certs/server.pem',
          '--tlskey', './test/certs/key.pem',
          '--tlscacert', './test/certs/ca.pem'
        ]
        tlsVerifyServer = nsc.startServer(TLSVERIFYPORT, flags, done)
      })
    })
  })

  // Shutdown our server after each test.
  after(function (done) {
    nsc.stopCluster([server, tlsServer, tlsVerifyServer], done)
  })

  it('should error if server does not support TLS', function (done) {
    const nc = NATS.connect({
      port: PORT,
      tls: true
    })
    nc.on('error', function (err) {
      should.exist(err)
      should.exist((/Server does not support a secure/).exec(err))
      nc.close()
      done()
    })
  })

  it('should reject without proper CA', function (done) {
    const nc = NATS.connect({
      port: TLSPORT,
      tls: true
    })
    nc.on('error', function (err) {
      should.exist(err)
      should.exist((/unable to verify the first certificate/).exec(err))
      nc.close()
      done()
    })
  })

  it('should connect if authorized is overridden', function (done) {
    const tlsOptions = {
      rejectUnauthorized: false
    }
    const nc = NATS.connect({
      port: TLSPORT,
      tls: tlsOptions
    })
    should.exist(nc)
    nc.on('connect', function (client) {
      client.should.equal(nc)
      nc.stream.authorized.should.equal(false)
      nc.close()
      done()
    })
  })

  it('should connect with proper ca and be authorized', function (done) {
    const tlsOptions = {
      ca: [fs.readFileSync('./test/certs/ca.pem')]
    }
    const nc = NATS.connect({
      port: TLSPORT,
      tls: tlsOptions
    })
    should.exist(nc)
    nc.on('connect', function (client) {
      client.should.equal(nc)
      nc.stream.authorized.should.equal(true)
      nc.close()
      done()
    })
  })

  it('should reject without proper cert if required by server', function (done) {
    const nc = NATS.connect({
      port: TLSVERIFYPORT,
      tls: true
    })
    nc.on('error', function (err) {
      should.exist(err)
      should.exist((/Server requires a client certificate/).exec(err))
      nc.close()
      done()
    })
  })

  it('should be authorized with proper cert', function (done) {
    const tlsOptions = {
      key: fs.readFileSync('./test/certs/client-key.pem'),
      cert: fs.readFileSync('./test/certs/client-cert.pem'),
      ca: [fs.readFileSync('./test/certs/ca.pem')]
    }
    const nc = NATS.connect({
      port: TLSPORT,
      tls: tlsOptions
    })
    nc.on('connect', function (client) {
      client.should.equal(nc)
      nc.stream.authorized.should.equal(true)
      nc.close()
      done()
    })
  })

  describe('OpenSSL preflight verification errors', function () {
    const testTable = [
      {
        errorCode: 'ERR_OSSL_X509_KEY_VALUES_MISMATCH',
        regex: /key values mismatch/i,
        tls: {
          key: fs.readFileSync('./test/certs/client-key.pem'),
          cert: fs.readFileSync('./test/certs/ca.pem'),
          ca: [fs.readFileSync('./test/certs/server.pem')]
        }
      },
      {
        errorCode: 'ERR_OSSL_PEM_NO_START_LINE',
        regex: /no start line/i,
        tls: {
          key: fs.readFileSync('./test/certs/client-cert.pem'),
          cert: fs.readFileSync('./test/certs/client-key.pem'),
          ca: [fs.readFileSync('./test/certs/ca.pem')]
        }
      }
    ]

    testTable.forEach(({ errorCode, regex, tls }) => {
      it(`should handle ${errorCode}`, function (done) {
        const nc = NATS.connect({
          port: TLSPORT,
          tls
        })
        nc.once('connect', function (done) {
          done(new Error(`was expecting a ${errorCode} OpenSSL error`))
        })
        nc.once('error', function (error) {
          should.exist(error)
          should(error.code).equal('OPENSSL_ERR')
          should.exist(regex.exec(error.chainedError.message))
          nc.close()
          done()
        })
      })
    })
  })
})
