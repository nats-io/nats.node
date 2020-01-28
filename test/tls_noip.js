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
const describe = require('mocha').describe
const afterEach = require('mocha').afterEach
const it = require('mocha').it

describe('TLS No IPs', function () {
  this.timeout(5000)

  // this to enable per test cleanup
  let servers

  // Shutdown our servers
  afterEach(function (done) {
    nsc.stopCluster(servers, function () {
      servers = []
      done()
    })
  })

  it('should reconnect via tls with discovered server ip only', function (done) {
    const routePort = 55220
    const port = 54222
    const ports = [port, port + 1, port + 2]
    const flags = ['--tls', '--tlscert', './test/certs/server_noip.pem',
      '--tlskey', './test/certs/key_noip.pem'
    ]
    servers = nsc.startCluster(ports, routePort, flags, function () {
      should(servers.length).be.equal(3)
      const nc = NATS.connect({
        url: 'tls://localhost:' + port,
        noRandomize: true,
        reconnectTimeWait: 100,
        tls: {
          ca: [fs.readFileSync('./test/certs/ca.pem')]
        }
      })

      nc.on('connect', function () {
        const s = nsc.findServer(port, servers)
        nsc.stopServer(s)
      })
      nc.on('reconnect', function () {
        nc.close()
        done()
      })
      nc.on('close', function () {
        done('Did not reconnect')
      })
      nc.on('error', () => {
        nc.close()
        done()
      })
    })
  })
})
