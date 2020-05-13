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
const fs = require('fs')
const after = require('mocha').after
const before = require('mocha').before
const describe = require('mocha').describe
const it = require('mocha').it

describe('TLS', () => {
  const PORT = 1442
  const TLSPORT = 1443
  const TLSVERIFYPORT = 1444

  let server
  let tlsServer
  let tlsVerifyServer

  // Start up our own nats-server for each test
  // We will start a plain, a no client cert, and a client cert required.
  before(done => {
    server = nsc.startServer(PORT, () => {
      const flags = ['--tls', '--tlscert', './test/certs/server.pem',
        '--tlskey', './test/certs/key.pem'
      ]
      tlsServer = nsc.startServer(TLSPORT, flags, () => {
        const flags = ['--tlsverify', '--tlscert', './test/certs/server.pem',
          '--tlskey', './test/certs/key.pem',
          '--tlscacert', './test/certs/ca.pem'
        ]
        tlsVerifyServer = nsc.startServer(TLSVERIFYPORT, flags, done)
      })
    })
  })

  // Shutdown our server after each test.
  after(done => {
    nsc.stopCluster([server, tlsServer, tlsVerifyServer], done)
  })

  it('should error if server does not support TLS', done => {
    const nc = NATS.connect({
      port: PORT,
      tls: true
    })
    nc.on('error', err => {
      should.exist(err)
      should.exist((/Server does not support a secure/).exec(err))
      nc.close()
      done()
    })
  })

  it('should reject without proper CA', done => {
    const nc = NATS.connect({
      port: TLSPORT,
      tls: true
    })
    nc.on('error', err => {
      should.exist(err)
      should.exist((/unable to verify the first certificate/).exec(err))
      nc.close()
      done()
    })
  })

  it('should keep rejecting without proper CA', done => {
    const nc = NATS.connect({
      port: TLSPORT,
      tls: true,
      maxReconnectAttempts: 5,
      reconnectTimeWait: 100,
      reconnectDelayHandler: () => { return 0 },
      waitOnFirstConnect: true
    })
    let tries = 0
    nc.on('reconnecting', () => {
      tries++
    })
    nc.on('close', () => {
      tries.should.equal(nc.options.maxReconnectAttempts)
      done()
    })
  })

  it('should connect if authorized is overridden', done => {
    const tlsOptions = {
      rejectUnauthorized: false
    }
    const nc = NATS.connect({
      port: TLSPORT,
      tls: tlsOptions
    })
    should.exist(nc)
    nc.on('connect', client => {
      client.should.equal(nc)
      nc.stream.authorized.should.equal(false)
      nc.close()
      done()
    })
  })

  it('should connect with proper ca and be authorized', done => {
    const tlsOptions = {
      ca: [fs.readFileSync('./test/certs/ca.pem')]
    }
    const nc = NATS.connect({
      port: TLSPORT,
      tls: tlsOptions
    })
    should.exist(nc)
    nc.on('connect', client => {
      client.should.equal(nc)
      nc.stream.authorized.should.equal(true)
      nc.close()
      done()
    })
  })

  it('should not timeout when it tls connects', done => {
    const tlsOptions = {
      ca: [fs.readFileSync('./test/certs/ca.pem')]
    }
    const nc = NATS.connect({
      port: TLSPORT,
      tls: tlsOptions,
      timeout: 1000
    })
    let alive = false
    nc.on('connect', () => {
      setTimeout(() => {
        nc.flush((err) => {
          if (err) {
            done(err)
            return
          }
          alive = true
          nc.stream.destroy()
        })
      }, 1100)
    })
    nc.on('reconnect', () => {
      alive.should.be.true()
      nc.close()
      done()
    })
    nc.on('error', (err) => {
      done(err)
    })
  })

  it('should not timeout on multiple connection attempts', done => {
    const tlsOptions = {
      ca: [fs.readFileSync('./test/certs/ca.pem')]
    }
    const nc = NATS.connect({
      url: 'nats://localhost:1234',
      servers: ['nats://localhost:2345', `nats://localhost:${TLSPORT}`],
      noRandomize: true,
      tls: tlsOptions,
      timeout: 500
    })
    let alive = false
    nc.on('connect', () => {
      setTimeout(() => {
        nc.flush((err) => {
          if (err) {
            done(err)
            return
          }
          alive = true
          nc.stream.destroy()
        })
      }, 1100)
    })
    nc.on('reconnect', () => {
      alive.should.be.true()
      nc.close()
      done()
    })
    nc.on('error', (err) => {
      done(err)
    })
  }).timeout(5000)

  it('should reject without proper cert if required by server', done => {
    const nc = NATS.connect({
      port: TLSVERIFYPORT,
      tls: true
    })
    nc.on('error', err => {
      should.exist(err)
      should.exist((/Server requires a client certificate/).exec(err))
      nc.close()
      done()
    })
  })

  it('should be authorized with proper cert', done => {
    const tlsOptions = {
      key: fs.readFileSync('./test/certs/client-key.pem'),
      cert: fs.readFileSync('./test/certs/client-cert.pem'),
      ca: [fs.readFileSync('./test/certs/ca.pem')]
    }
    const nc = NATS.connect({
      port: TLSPORT,
      tls: tlsOptions
    })
    nc.on('connect', client => {
      client.should.equal(nc)
      nc.stream.authorized.should.equal(true)
      nc.close()
      done()
    })
  })

  describe('OpenSSL preflight verification errors', () => {
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
      it(`should handle ${errorCode}`, done => {
        const nc = NATS.connect({
          port: TLSPORT,
          tls
        })
        nc.once('connect', done => {
          done(new Error(`was expecting a ${errorCode} OpenSSL error`))
        })
        nc.once('error', error => {
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
