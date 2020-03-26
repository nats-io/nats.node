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
const net = require('net')
const after = require('mocha').after
const before = require('mocha').before
const describe = require('mocha').describe
const it = require('mocha').it
const fs = require('fs')
const tls = require('tls')

const PORT = 1428
const TLSPORT = 12840

describe('Timeouts', () => {
  let server
  let tlsServer

  // Start up our own nats-server
  before(done => {
    server = nsc.startServer(PORT, () => {
      const flags = ['--tlscert', './test/certs/server.pem',
        '--tlskey', './test/certs/key.pem',
        '--tlscacert', './test/certs/ca.pem'
      ]
      tlsServer = nsc.startServer(TLSPORT, flags, done)
    })
  })

  // Shutdown our server after we are done
  after(done => {
    nsc.stopCluster([server, tlsServer], done)
  })

  // connect to a server that never sends data
  it('conn timeout - socket timeout', (done) => {
    const srv = net.createServer((c) => {})
    srv.listen(0, () => {
      const p = srv.address().port
      const nc = NATS.connect({ port: p, timeout: 1000 })
      nc.on('connect', () => {
        done(new Error('should have failed'))
      })
      nc.on('error', (err) => {
        err.should.be.instanceof(NATS.NatsError)
        err.chainedError.should.be.instanceof(NATS.NatsError)
        err.chainedError.should.have.property('code', NATS.CONN_TIMEOUT)
        srv.close(done)
      })
    })
  }, 15000)

  it('connection timeout - fail to connect quickly enough', (done) => {
    // this is not expecting to have enough time to connect
    const nc = NATS.connect('nats://connect.ngs.global', { timeout: 1 })
    nc.on('error', (err) => {
      err.should.be.instanceof(NATS.NatsError)
      err.chainedError.should.be.instanceof(NATS.NatsError)
      err.chainedError.should.have.property('code', NATS.CONN_TIMEOUT)
      done()
    })

    nc.on('connect', () => {
      done(new Error('should have failed'))
    })
  })

  // connect to a server that never sends data
  it('conn timeout - reconnects work', (done) => {
    const srv = net.createServer((c) => {})
    srv.listen(0, () => {
      const p = srv.address().port
      const nc = NATS.connect('nats://localhost:' + p, {
        timeout: 1000,
        servers: ['nats://localhost:' + PORT]
      })
      nc.on('connect', () => {
        nc.currentServer.url.host.should.be.equal('localhost:' + PORT)
        nc.close()
        srv.close(done)
      })
      nc.on('error', (err) => {
        done(new Error('shouldnt have failed: ' + err))
      })
    })
  }, 15000)

  it('connection timeout doesnt trigger', (done) => {
    const nc = NATS.connect({ port: PORT, timeout: 1000 })
    nc.on('error', (err) => {
      // shouldn't fail
      done(err)
    })
    setTimeout(() => {
      nc.connected.should.be.true()
      nc.close()
      done()
    }, 1500)
  })

  it('should perform simple timeouts on subscriptions', done => {
    const nc = NATS.connect(PORT)
    nc.on('connect', () => {
      const startTime = new Date()
      const sid = nc.subscribe('foo')
      nc.timeout(sid, 50, 1, () => {
        const elapsed = new Date() - startTime
        should.exists(elapsed)
        elapsed.should.be.within(45, 75)
        nc.close()
        done()
      })
    })
  })

  it('should not timeout if expected has been received', done => {
    const nc = NATS.connect(PORT)
    nc.on('connect', () => {
      const sid = nc.subscribe('foo')
      nc.timeout(sid, 50, 1, () => {
        done(new Error('Timeout improperly called'))
      })
      nc.publish('foo', () => {
        nc.close()
        done()
      })
    })
  })

  it('should not timeout if unsubscribe is called', done => {
    const nc = NATS.connect(PORT)
    nc.on('connect', () => {
      let count = 0
      const sid = nc.subscribe('bar', m => {
        count++
        if (count === 1) {
          nc.unsubscribe(sid)
        }
      })
      nc.timeout(sid, 1000, 2, () => {
        done(new Error('Timeout improperly called'))
      })
      nc.publish('bar', '')
      nc.flush()
      setTimeout(() => {
        // terminate the test
        nc.close()
        done()
      }, 1500)
    })
  })

  it('timeout should unsubscribe', done => {
    const nc = NATS.connect(PORT)
    nc.on('connect', () => {
      let count = 0
      const sid = nc.subscribe('bar', m => {
        count++
      })
      nc.timeout(sid, 250, 2, () => {
        process.nextTick(() => {
          nc.publish('bar', '')
          nc.flush()
        })
      })
      setTimeout(() => {
        nc.close()
        should(count).equal(0)
        done()
      }, 1000)
    })
  })

  it('should perform simple timeouts on requests', done => {
    const nc = NATS.connect(PORT)
    nc.on('connect', () => {
      nc.request('foo', null, {
        max: 1,
        timeout: 1000
      }, err => {
        err.should.be.instanceof(NATS.NatsError)
        err.should.have.property('code', NATS.REQ_TIMEOUT)
        nc.close()
        done()
      })
    })
  })

  it('should perform simple timeouts on requests without specified number of messages', done => {
    const nc = NATS.connect(PORT)
    nc.on('connect', () => {
      nc.subscribe('foo', (msg, reply) => {
        nc.publish(reply)
      })

      let responses = 0
      nc.request('foo', null, {
        max: 2,
        timeout: 1000
      }, err => {
        if (!Object.hasOwnProperty.call(err, 'code')) {
          responses++
          return
        }
        responses.should.be.equal(1)
        err.should.be.instanceof(NATS.NatsError)
        err.should.have.property('code', NATS.REQ_TIMEOUT)
        nc.close()
        done()
      })
    })
  })

  it('should not timeout on connection errors', done => {
    let ejected = false
    const srv = net.createServer((c) => {
      c.write('INFO ' + JSON.stringify({
        server_id: 'TEST',
        version: '0.0.0',
        host: '127.0.0.1',
        port: srv.address.port,
        auth_required: false
      }) + '\r\n')
      c.on('data', (d) => {
        const r = d.toString()
        const lines = r.split('\r\n')
        lines.forEach((line) => {
          if (line === '\r\n') {
            return
          }
          if (/^CONNECT\s+/.test(line)) {
            c.destroy()
            ejected = true
          } else {
            // ignored
          }
        })
      })
    })
    srv.listen(0, () => {
      const p = srv.address().port
      const opts = {
        servers: [`nats://localhost:${PORT}`],
        reconnectTimeWait: 250,
        noRandomize: true,
        timeout: 500
      }
      const nc = NATS.connect(`nats://localhost:${p}`, opts)
      nc.on('connect', () => {
        ejected.should.be.true()
        nc.currentServer.url.port.should.be.equal(String(PORT))
        setTimeout(() => {
          nc.flush(() => {
            nc.close()
            srv.close(() => {
              done()
            })
          })
        }, 1000)
      })
      nc.on('error', (err) => {
        done(err)
      })
    })
  })

  it('should not timeout on tls connection errors', done => {
    let ejected = false
    const srv = net.createServer((c) => {
      c.write('INFO ' + JSON.stringify({
        server_id: 'TEST',
        version: '0.0.0',
        host: '127.0.0.1',
        port: srv.address.port,
        auth_required: false,
        tls_required: true
      }) + '\r\n')

      const opts = {
        isServer: true,
        ca: fs.readFileSync('./test/certs/ca.pem'),
        key: fs.readFileSync('./test/certs/key.pem'),
        cert: fs.readFileSync('./test/certs/server.pem')
      }

      const tlssrv = new tls.TLSSocket(c, opts)
      tlssrv.on('error', (err) => {
        done(err)
      })
      tlssrv.on('readable', () => {
        const d = tlssrv.read()
        if (d) {
          const r = d.toString()
          const lines = r.split('\r\n')
          lines.forEach((line) => {
            if (line === '\r\n') {
              return
            }
            if (/^CONNECT\s+/.test(line)) {
              c.destroy()
              ejected = true
            } else {
              // ignored
            }
          })
        }
      })
    })
    srv.listen(0, () => {
      const p = srv.address().port
      const opts = {
        servers: [`nats://localhost:${TLSPORT}`],
        reconnectTimeWait: 250,
        noRandomize: true,
        timeout: 500,
        tls: {
          ca: fs.readFileSync('./test/certs/ca.pem')
        }
      }
      const nc = NATS.connect(`nats://localhost:${p}`, opts)
      nc.on('connect', () => {
        ejected.should.be.true()
        nc.currentServer.url.port.should.be.equal(String(TLSPORT))
        nc.stream.encrypted.should.be.true()
        setTimeout(() => {
          nc.flush(() => {
            nc.close()
            srv.close(() => {
              done()
            })
          })
        }, 1000)
      })
      nc.on('error', (err) => {
        done(err)
      })
    })
  })
})
