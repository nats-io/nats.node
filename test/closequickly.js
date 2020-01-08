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
/* global describe: false, beforeEach: false, afterEach: false, it: false */
'use strict'

const NATS = require('../')
const nsc = require('./support/nats_server_control')
const childProcess = require('child_process')
const should = require('should')

describe('Close functionality', function () {
  const PORT = 8459
  let server

  // Start up our own nats-server
  beforeEach(function (done) {
    server = nsc.startServer(PORT, done)
  })

  // Shutdown our server after we are done
  afterEach(function (done) {
    nsc.stopServer(server, done)
  })

  it('close quickly', function (done) {
    const nc = NATS.connect({
      port: PORT
    })

    let timer

    nc.flush(function () {
      nc.subscribe('started', function (m) {
        nc.publish('close')
      })
      timer = setTimeout(function () {
        done(new Error("process didn't exit quickly"))
      }, 10000)
    })

    const child = childProcess.execFile('node', ['./test/support/exiting_client.js', PORT], function (error) {
      if (error) {
        nc.close()
        done(error)
      }
    })

    child.on('exit', function (code, signal) {
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      nc.close()
      if (code !== 0) {
        done("Process didn't return a zero code: [" + code + ']', signal)
      } else {
        done()
      }
    })
  })

  it('ping timers are not left behind on socket close', (done) => {
    const nc = NATS.connect({
      port: PORT,
      reconnectTimeWait: 100,
      maxReconnectAttempts: 1
    })

    nc.on('connect', () => {
      process.nextTick(() => {
        server.kill()
      })
    })

    nc.on('close', () => {
      should.not.exist(nc.pingTimer)
      done()
    })
  })

  it('subscription timers are not left behind on socket close', (done) => {
    const nc = NATS.connect({
      port: PORT,
      reconnectTimeWait: 100,
      maxReconnectAttempts: 1
    })

    let subID = 0
    nc.on('connect', () => {
      subID = nc.subscribe('foo', () => {
        // nothing
      })
      nc.timeout(subID, 1000, 1, () => {
        throw new Error("shouldn't have timed out")
      })
      nc.flush(() => {
        server.kill()
      })
    })

    nc.on('close', () => {
      const conf = nc.subs[subID]
      should.exist(conf)
      should.not.exist(conf.timeout)
      done()
    })
  })

  it('request timers are not left behind on socket close', (done) => {
    const nc = NATS.connect({
      port: PORT,
      reconnectTimeWait: 100,
      maxReconnectAttempts: 1
    })

    nc.on('connect', () => {
      nc.request('foo', undefined, { timeout: 1000, max: 1 }, (err) => {
        throw err
      })
      nc.flush(() => {
        server.kill()
      })
    })

    nc.on('close', () => {
      let foundOne = false
      for (const p in nc.respmux.requestMap) {
        if (Object.hasOwnProperty.call(this.respmux.requestMap, p)) {
          foundOne = true
        }
      }
      foundOne.should.be.false()
      done()
    })
  })
})
