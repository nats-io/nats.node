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

/* eslint-env es6, node */
'use strict'

const net = require('net')
const nuid = require('nuid')
const events = require('events')
const util = require('util')

const MAX_CONTROL = 1048576

const PING = /^PING\r\n/i
const CONNECT = /^CONNECT\s+([^\r\n]+)\r\n/i

// default script handles a connect, and initial ping
function defaultScript () {
  const script = []
  script.push({
    re: CONNECT,
    h: sendOk,
    m: 'connect'
  })
  script.push({
    re: PING,
    h: sendPong,
    m: 'ping'
  })
  return script
}

function ScriptedServer (port, script) {
  events.EventEmitter.call(this)
  this.port = port
  this.id = nuid.next()
  this.sockets = []
  this.script = script || defaultScript()
}

exports.ScriptedServer = ScriptedServer

util.inherits(ScriptedServer, events.EventEmitter)

ScriptedServer.prototype.start = function () {
  const that = this
  this.stream = net.createServer(function (client) {
    that.emit('connect_request')
    sendInfo(that, client)
    client.script = Array.from(that.script)
    client.on('data', handleData(that, client))
  })

  this.stream.on('connection', (socket) => {
    this.sockets.push(socket)
  })

  this.stream.on('close', () => {
    this.emit('close')
  })

  this.stream.on('error', (ex) => {
    this.emit('error', ex)
  })

  this.stream.on('listening', () => {
    this.emit('listening')
  })

  this.stream.listen(that.port)
}

ScriptedServer.prototype.stop = function (cb) {
  this.stream.close(cb)
  this.sockets.forEach(function (socket) {
    if (!socket.destroyed) {
      socket.destroy()
    }
  })
}

function handleData (server, client) {
  return function (data) {
    // if we have a buffer append to it or make one
    if (client.buffer) {
      client.buffer = Buffer.concat([client.buffer, data])
    } else {
      client.buffer = data
    }

    // convert to string like node-nats does so we can test protocol
    const buf = client.buffer.toString('binary', 0, MAX_CONTROL)
    if (client.script.length) {
      const match = client.script[0].re.exec(buf)
      if (match) {
        // if we have a match, execute the handler
        client.script[0].h(client, match)

        // prune the buffer without the processed request
        const len = match[0].length
        if (len >= client.buffer.length) {
          delete client.buffer
        } else {
          client.buffer = client.buffer.slice(len)
        }

        // delete the script step
        client.script.shift()
      } else {
        server.emit('warn', 'no match:\n' + colorize(buf))
      }
    } else {
      server.emit('info', 'no more script handlers, ignoring:\n' + colorize(buf))
    }
  }
}

function colorize (str) {
  return str.replace(/(?:\r\n)/g, '\\r\\n\n')
}

function sendInfo (server, socket) {
  socket.write('INFO ' + JSON.stringify({
    server_id: 'TEST',
    version: '0.0.0',
    node: 'node0.0.0',
    host: '127.0.0.1',
    port: server.port,
    auth_required: false,
    ssl_required: false,
    tls_required: false,
    tls_verify: false,
    max_payload: MAX_CONTROL
  }) + '\r\n')
}

function sendOk (socket) {
  socket.write('+OK\r\n')
}

exports.sendOk = sendOk

function sendPing (socket) {
  socket.write('PING\r\n')
}

exports.sendPing = sendPing

function sendPong (socket) {
  socket.write('PONG\r\n')
}

exports.sendPong = sendPong
