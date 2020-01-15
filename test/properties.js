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
/* global describe: false, it: false */
/* jshint -W030 */
'use strict'

const NATS = require('../')
const should = require('should')

describe('Base Properties', function () {
  it('should have a version property', function () {
    NATS.version.should.match(/[0-9]+\.[0-9]+\.[0-9]+/)
  })

  it('should have the same version as package.json', function () {
    const v = require('../package.json').version
    NATS.version.should.equal(v)
  })

  it('should have a connect function', function () {
    NATS.connect.should.be.a.Function()
  })

  it('should have a createInbox function', function () {
    NATS.createInbox.should.be.a.Function()
  })
})

describe('Connection Properties', function () {
  let nc = NATS.connect()
  should.exist(nc)

  it('should have a publish function', function () {
    nc.publish.should.be.a.Function()
  })

  it('should have a subscribe function', function () {
    nc.subscribe.should.be.a.Function()
  })

  it('should have an unsubscribe function', function () {
    nc.unsubscribe.should.be.a.Function()
  })

  it('should have a request function', function () {
    nc.request.should.be.a.Function()
  })

  it('should have an options hash with proper fields', function () {
    nc.should.have.property('options')
    nc.options.should.have.property('url')
    nc.options.should.have.property('verbose')
    nc.options.should.have.property('pedantic')
    nc.options.should.have.property('reconnect')
    nc.options.should.have.property('maxReconnectAttempts')
    nc.options.should.have.property('reconnectTimeWait')
    nc.options.should.have.property('useOldRequestStyle')
    nc.options.useOldRequestStyle.should.equal(false)
    nc.options.noEcho.should.be.false()
  })

  it('should have an parsed url', function () {
    nc.should.have.property('url')
    nc.url.should.be.an.Object()
    nc.url.should.have.property('protocol')
    nc.url.should.have.property('host')
    nc.url.should.have.property('port')
  })

  nc.close()

  it('should allow options to be overridden', function () {
    const options = {
      url: 'nats://localhost:22421',
      verbose: true,
      pedantic: true,
      reconnect: false,
      maxReconnectAttempts: 22,
      reconnectTimeWait: 11,
      useOldRequestStyle: true
    }

    nc = NATS.connect(options)
    nc.on('error', function () {}) // Eat error

    nc.options.url.should.equal('nats://localhost:22421')
    nc.options.verbose.should.equal(true)
    nc.options.pedantic.should.equal(true)
    nc.options.reconnect.should.equal(false)
    nc.options.maxReconnectAttempts.should.equal(22)
    nc.options.reconnectTimeWait.should.equal(11)
    nc.options.useOldRequestStyle.should.equal(true)
    nc.close()
  })
})
