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

describe('Authorization', function () {
  const PORT = 1421
  const flags = ['--user', 'derek', '--pass', 'foobar']
  const authUrl = 'nats://derek:foobar@localhost:' + PORT
  const noAuthUrl = 'nats://localhost:' + PORT
  let server

  // Start up our own nats-server
  before(function (done) {
    server = nsc.startServer(PORT, flags, done)
  })

  // Shutdown our server after we are done
  after(function (done) {
    nsc.stopServer(server, done)
  })

  it('should fail to connect with no credentials ', function (done) {
    const nc = NATS.connect(PORT)
    nc.on('error', function (err) {
      should.exist(err)
      should.exist((/Authorization/).exec(err))
      nc.close()
      done()
    })
  })

  it('should connect with proper credentials in url', function (done) {
    const nc = NATS.connect(authUrl)
    nc.on('connect', function (nc) {
      setTimeout(function () {
        nc.close()
        done()
      }, 100)
    })
  })

  it('should connect with proper credentials as options', function (done) {
    const nc = NATS.connect({
      url: noAuthUrl,
      user: 'derek',
      pass: 'foobar'
    })
    nc.on('connect', function (nc) {
      setTimeout(function () {
        nc.close()
        done()
      }, 100)
    })
  })

  it('should connect with proper credentials as server url', function (done) {
    const nc = NATS.connect({
      servers: [authUrl]
    })
    nc.on('connect', function (nc) {
      nc.close()
      setTimeout(done, 100)
    })
  })
})

describe('Token Authorization', function () {
  const PORT = 1421
  const flags = ['--auth', 'token1']
  const authUrl = 'nats://token1@localhost:' + PORT
  const noAuthUrl = 'nats://localhost:' + PORT
  let server

  // Start up our own nats-server
  before(function (done) {
    server = nsc.startServer(PORT, flags, done)
  })

  // Shutdown our server after we are done
  after(function (done) {
    nsc.stopServer(server, done)
  })

  it('should fail to connect with no credentials ', function (done) {
    const nc = NATS.connect(PORT)
    nc.on('error', function (err) {
      should.exist(err)
      should.exist((/Authorization/).exec(err))
      nc.close()
      done()
    })
  })

  it('should connect with proper credentials in url', function (done) {
    const nc = NATS.connect(authUrl)
    nc.on('connect', function (nc) {
      setTimeout(function () {
        nc.close()
        done()
      }, 100)
    })
  })

  it('should connect with proper credentials as options', function (done) {
    const nc = NATS.connect({
      url: noAuthUrl,
      token: 'token1'
    })
    nc.on('connect', function (nc) {
      setTimeout(function () {
        nc.close()
        done()
      }, 100)
    })
  })

  it('should connect with proper credentials as server url', function (done) {
    const nc = NATS.connect({
      servers: [authUrl]
    })
    nc.on('connect', function (nc) {
      nc.close()
      setTimeout(done, 100)
    })
  })
})

describe('tokenHandler Authorization', function () {
  const PORT = 1421
  const flags = ['--auth', 'token1']
  const noAuthUrl = 'nats://localhost:' + PORT
  let server

  // Start up our own nats-server
  before(function (done) {
    server = nsc.startServer(PORT, flags, done)
  })

  // Shutdown our server after we are done
  after(function (done) {
    nsc.stopServer(server, done)
  })

  it('should connect using tokenHandler instead of plain old token', function (done) {
    const nc = NATS.connect({
      url: noAuthUrl,
      tokenHandler: () => 'token1'
    })
    nc.on('connect', (nc) => {
      setTimeout(() => {
        nc.close()
        done()
      }, 100)
    })
  })

  it('should fail to connect if tokenHandler is not a function', function (done) {
    (function () {
      NATS.connect({
        url: noAuthUrl,
        tokenHandler: 'token1'
      })
    }).should.throw(/tokenHandler must be a function returning a token/)
    done()
  })

  it('should fail to connect if both token and tokenHandler are provided', function (done) {
    (function () {
      NATS.connect({
        url: noAuthUrl,
        token: 'token1',
        tokenHandler: () => 'token1'
      })
    }).should.throw(/token and tokenHandler cannot both be provided/)
    done()
  })

  it('should NOT connect if tokenHandler fails to return a token', function (done) {
    const nc = NATS.connect({
      url: noAuthUrl,
      tokenHandler: () => {
        throw new Error('no token for you!')
      }
    })

    let totalErrorCount = 0
    let tokenHandlerErrorCount = 0
    let authorizationViolationErrorCount = 0
    let disconnectCount = 0
    nc.on('error', (err) => {
      totalErrorCount++
      if ((/^NatsError: tokenHandler call failed: .+$/).test(err.toString())) {
        tokenHandlerErrorCount++
      }
      if ((/^NatsError: 'Authorization Violation'$/).test(err.toString())) {
        authorizationViolationErrorCount++
      }
    })
    nc.on('disconnect', () => {
      disconnectCount++
    })
    nc.on('close', () => {
      tokenHandlerErrorCount.should.be.greaterThan(0)
      authorizationViolationErrorCount.should.equal(tokenHandlerErrorCount)
      totalErrorCount.should.be.greaterThanOrEqual(2 * tokenHandlerErrorCount)

      disconnectCount.should.equal(tokenHandlerErrorCount)
      done()
    })
  })

  it('tokenHandler errors can be recovered from', function (done) {
    this.timeout(10 * 1000)

    const RECONNECT_DELAY = 500
    const TOKEN_TTL = 2 * 1000
    const TOKEN_TTL_SAFETY_MARGIN = 500

    let token = 'token1'
    let tokenTimestamp = new Date().getTime()
    const getTokenAge = () => {
      const now = new Date().getTime()
      return now - tokenTimestamp
    }

    let tokenHandlerCallCount = 0
    const nc = NATS.connect({
      url: noAuthUrl,
      tokenHandler: () => {
        tokenHandlerCallCount++
        if (!token) {
          throw new Error('no token for you!')
        } else {
          return token
        }
      },
      reconnect: true,
      reconnectTimeWait: RECONNECT_DELAY
    })
    let refreshingToken = false
    nc.on('disconnect', () => {
      // refresh token if it might be too old before it's used again:
      if (!refreshingToken && (getTokenAge() + RECONNECT_DELAY + TOKEN_TTL_SAFETY_MARGIN > TOKEN_TTL)) {
        refreshingToken = true
        token = ''
        setTimeout(() => {
          token = 'token1'
          tokenTimestamp = new Date().getTime()
          refreshingToken = false
        }, 3 * RECONNECT_DELAY)
      }
    })

    let totalErrorCount = 0
    let tokenHandlerErrorCount = 0
    let authorizationViolationErrorCount = 0
    nc.on('error', (err) => {
      totalErrorCount++
      if ((/^NatsError: tokenHandler call failed: .+$/).test(err.toString())) {
        tokenHandlerErrorCount++
      }
      if ((/^NatsError: 'Authorization Violation'$/).test(err.toString())) {
        authorizationViolationErrorCount++
      }
    })
    nc.on('connect', () => {
      // restart server to initiate reconnects after the token has expired:
      setTimeout(() => {
        nsc.stopServer(server, () => {
          server = nsc.startServer(PORT, flags)
        })
      }, TOKEN_TTL)
    })
    nc.on('reconnect', (nc) => {
      setTimeout(() => {
        nc.close()
        tokenHandlerCallCount.should.be.greaterThanOrEqual(4)
        tokenHandlerCallCount.should.be.lessThanOrEqual(5)

        tokenHandlerErrorCount.should.greaterThanOrEqual(2)
        tokenHandlerErrorCount.should.lessThanOrEqual(3)

        authorizationViolationErrorCount.should.equal(tokenHandlerErrorCount)
        totalErrorCount.should.equal(tokenHandlerErrorCount + authorizationViolationErrorCount)

        done()
      }, 100)
    })
  })
})
