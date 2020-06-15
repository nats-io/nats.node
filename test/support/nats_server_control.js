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

const spawn = require('child_process').spawn
const net = require('net')
const sync = require('child_process').execSync

const SERVER = (process.env.CI) ? 'nats-server/nats-server' : 'nats-server'
const DEFAULT_PORT = 4222

function serverVersionFn () {
  return sync(SERVER + ' -v', {
    timeout: 1000
  }).toString()
}

function startServerFn (port, optFlags, done) {
  if (!port) {
    port = DEFAULT_PORT
  }
  if (typeof optFlags === 'function') {
    done = optFlags
    optFlags = null
  }
  let flags = ['-p', port, '-a', '127.0.0.1']

  if (optFlags) {
    flags = flags.concat(optFlags)
  }

  if (process.env.PRINT_LAUNCH_CMD) {
    console.log(flags.join(' '))
  }

  const server = spawn(SERVER, flags)

  const start = new Date()
  let wait = 0
  const maxWait = 5 * 1000 // 5 secs
  const delta = 250
  let socket
  let timer

  const resetSocket = () => {
    if (socket !== undefined) {
      socket.removeAllListeners()
      socket.destroy()
      socket = undefined
    }
  }

  const finish = err => {
    resetSocket()
    if (timer !== undefined) {
      clearInterval(timer)
      timer = undefined
    }
    if (done) {
      done(err)
    }
  }

  // Test for when socket is bound.
  timer = setInterval(() => {
    resetSocket()

    wait = new Date() - start
    if (wait > maxWait) {
      finish(new Error('Can\'t connect to server on port: ' + port))
    }

    // Try to connect to the correct port.
    socket = net.createConnection(port)

    // Success
    socket.on('connect', () => {
      if (server.pid === null) {
        // We connected but not to our server..
        finish(new Error('Server already running on port: ' + port))
      } else {
        finish()
      }
    })

    // Wait for next try..
    socket.on('error', error => {
      finish(new Error('Problem connecting to server on port: ' + port + ' (' + error + ')'))
    })
  }, delta)

  // Other way to catch another server running.
  server.on('exit', (code, signal) => {
    if (code === 1) {
      finish(new Error('Server exited with bad code, already running? (' + code + ' / ' + signal + ')'))
    }
  })

  // Server does not exist..
  server.stderr.on('data', data => {
    if ((/^execvp\(\)/).test(data)) {
      clearInterval(timer)
      finish(new Error('Can\'t find the ' + SERVER))
    }
  })

  return server
}

exports.startServer = startServerFn
exports.serverVersion = serverVersionFn

function waitStopFn (server, done) {
  if (server.killed) {
    if (done) {
      done()
    }
  } else {
    setTimeout(() => {
      waitStopFn(server, done)
    })
  }
}

function stopServerFn (server, done) {
  if (server) {
    server.kill()
    waitStopFn(server, done)
  } else if (done) {
    done()
  }
}

exports.stopServer = stopServerFn

// starts a number of servers in a cluster at the specified ports.
// must call with at least one port.
function startClusterFn (ports, routePort, optFlags, done) {
  if (typeof optFlags === 'function') {
    done = optFlags
    optFlags = null
  }
  const servers = []
  let started = 0
  const server = addMemberFn(ports[0], routePort, routePort, optFlags, () => {
    started++
    servers.push(server)
    if (started === ports.length) {
      done()
    }
  })

  const others = ports.slice(1)
  others.forEach(p => {
    const s = addMemberFn(p, routePort, p + 1000, optFlags, () => {
      started++
      servers.push(s)
      if (started === ports.length) {
        done()
      }
    })
  })
  return servers
}

// adds more cluster members, if more than one server is added additional
// servers are added after the specified delay.
function addMemberWithDelayFn (ports, routePort, delay, optFlags, done) {
  if (typeof optFlags === 'function') {
    done = optFlags
    optFlags = null
  }
  const servers = []
  ports.forEach((p, i) => {
    setTimeout(() => {
      const s = addMemberFn(p, routePort, p + 1000, optFlags, () => {
        servers.push(s)
        if (servers.length === ports.length) {
          done()
        }
      })
    }, i * delay)
  })

  return servers
}
exports.addMemberWithDelay = addMemberWithDelayFn

function addMemberFn (port, routePort, clusterPort, optFlags, done) {
  if (typeof optFlags === 'function') {
    done = optFlags
    optFlags = null
  }
  optFlags = optFlags || []
  const opts = JSON.parse(JSON.stringify(optFlags))
  opts.push('--routes', 'nats://localhost:' + routePort)
  opts.push('--cluster', 'nats://localhost:' + clusterPort)

  return startServerFn(port, opts, done)
}

exports.startCluster = startClusterFn
exports.addMember = addMemberFn

exports.stopCluster = (servers, done) => {
  let count = servers.length

  function latch () {
    count--
    if (count === 0) {
      done()
    }
  }
  servers.forEach(s => {
    stopServerFn(s, latch)
  })
}

exports.findServer = (port, servers) => servers.find(s => s.spawnargs[2] === port)
