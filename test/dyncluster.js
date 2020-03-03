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
/* jshint -W030 */
'use strict'

const NATS = require('../')
const nsc = require('./support/nats_server_control')
const should = require('should')
const afterEach = require('mocha').afterEach
const describe = require('mocha').describe
const it = require('mocha').it

describe('Dynamic Cluster - Connect URLs', function () {
  this.timeout()

  // this to enable per test cleanup
  let servers
  // Shutdown our servers
  afterEach(done => {
    nsc.stopCluster(servers, () => {
      servers = []
      done()
    })
  })

  it('adding cluster performs update', done => {
    const routePort = 54220
    const port = 54221

    // start a new cluster with single server
    servers = nsc.startCluster([port], routePort, () => {
      should(servers.length).be.equal(1)

      // connect the client
      const nc = NATS.connect({
        url: 'nats://127.0.0.1:' + port,
        reconnectTimeWait: 100
      })
      nc.on('connect', () => {
        // start adding servers
        process.nextTick(() => {
          const others = nsc.addMemberWithDelay([port + 1, port + 2], routePort, 250, () => {
            // verify that 2 servers were added
            should(others.length).be.equal(2)
            others.forEach(o => {
              // add them so they can be reaped
              servers.push(o)
            })
            // give some time for the server to send infos
            setTimeout(() => {
              // we should know of 3 servers - the one we connected and the 2 we added
              nc.servers.length().should.be.equal(3)
              nc.close()
              done()
            }, 1000)
          })
        })
      })
    })
  })

  it('servers are shuffled', done => {
    const routePort = 54320
    const port = 54321
    // start a cluster of one server
    const ports = []
    for (let i = 0; i < 10; i++) {
      ports.push(port + i)
    }
    servers = nsc.startCluster(ports, routePort, () => {
      should(servers.length).be.equal(10)

      // added in order
      const uris = []
      ports.forEach(p => {
        uris.push('nats://127.0.0.1:' + p)
      })

      const nc = NATS.connect({
        reconnectTimeWait: 100,
        servers: uris
      })
      nc.on('connect', () => {
        const found = []
        nc.servers.getAll().forEach(s => {
          found.push(s.url.href)
        })

        should.notDeepEqual(found, ports, 'ports shouldnt be in the same order')
        should.equal(found.length, ports.length, 'ports count should match')
        nc.close()
        done()
      })
    })
  })

  it('added servers not shuffled when noRandomize is set', done => {
    const routePort = 54320
    const port = 54321
    // start a cluster of one server
    const ports = []
    for (var i = 0; i < 10; i++) {
      ports.push(port + i)
    }
    const map = {}
    servers = nsc.startCluster(ports, routePort, () => {
      should(servers.length).be.equal(10)

      let connectCount = 0

      function connectAndRecordPorts (check) {
        const nc = NATS.connect({
          port: port,
          reconnectTimeWait: 100,
          noRandomize: true
        })
        nc.on('connect', () => {
          const have = []
          nc.servers.getAll().forEach(s => {
            have.push(parseInt(s.url.port))
          })

          connectCount++
          should.ok(have[0] === port)
          const key = have.join('_')
          map[key] = map[key] ? map[key] + 1 : 1
          nc.close()
          if (connectCount === 10) {
            check()
          }
        })
      }

      // we should have more than one property if there was randomization
      function check () {
        const keys = Object.getOwnPropertyNames(map)
        should.ok(keys.length === 1)
        should.ok(map[keys[0]] === 10)
        done()
      }

      // connect several times...
      for (let i = 0; i < 10; i++) {
        connectAndRecordPorts(check)
      }
    })
  })

  it('joins url and servers', done => {
    const routePort = 54320
    const port = 54321
    // start a cluster of one server
    const ports = []
    for (var i = 0; i < 10; i++) {
      ports.push(port + i)
    }

    // Add 5 of the servers we know. One added in the 'uri'
    const urls = []
    for (i = 1; i < 4; i++) {
      urls.push('nats://127.0.0.1:' + (port + i))
    }
    servers = nsc.startCluster(ports, routePort, () => {
      const nc = NATS.connect({
        url: 'nats://127.0.0.1:' + port,
        reconnectTimeWait: 100,
        servers: urls
      })

      nc.on('connect', c => {
        c.servers.length().should.be.equal(10)
        setTimeout(() => {
          c.close()
        }, 0)
        done()
      })
    })
  })

  it('discovered servers', done => {
    const routePort = 12892
    const port = 14526
    const ports = [port, port + 1, port + 2]

    servers = nsc.startCluster(ports, routePort, () => {
      const nc = NATS.connect({
        url: 'nats://127.0.0.1:' + port,
        reconnectTimeWait: 100,
        servers: ['nats://127.0.0.1:' + (port + 1)]
      })

      function countImplicit (c) {
        let count = 0
        c.servers.getAll().forEach(s => {
          if (s.implicit) {
            count++
          }
        })
        return count
      }

      nc.on('serversChanged', (se) => {
        if (countImplicit(nc) === 1) {
          const ns = 'nats://127.0.0.1:' + (port + 3)
          se.added.length.should.be.equal(1)
          const all = nc.servers.getAll()
          const found = all.find(s => s.url.href === ns)
          if (found) {
            nc.close()
            done()
          }
        }
      })

      nc.on('connect', () => {
        if (!testVersion('1.0.7', nc)) {
          nc.close()
          done()
        }
        nc.servers.length().should.be.equal(3)
        countImplicit(nc).should.be.equal(1)

        // remove the implicit one
        process.nextTick(() => {
          const s2 = nsc.findServer(port + 2, servers)
          nsc.stopServer(s2, () => {
            // add another
            const added = nsc.addMember(port + 3, routePort, port + 1003)
            servers.push(added)
          })
        })
      })
    })
  })
})

function parseVersion (verstr) {
  // this will break
  const a = verstr.split('.')
  if (a.length > 3) {
    a.splice(3, a.length - 3)
  }
  a[0] *= 100
  a[1] *= 10

  return a[0] + a[1] + a[2]
}

function testVersion (required, nc) {
  const vers = parseVersion(nc.info.version)
  const req = parseVersion(required)

  return vers >= req
}
