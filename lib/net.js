var util = require('util')
var EventEmitter = require('events').EventEmitter

function Socket(url) {
  EventEmitter.call(this)
  var self = this
  var ws = this.ws = new WebSocket(url)
  ws.binaryType = 'arraybuffer'
  // connect, close, error, data
  ws.onopen = function() {
    self.emit('connect')
  }
  ws.onclose = function() {
    self.emit('close')
  }
  ws.onerror = function(err) {
    self.emit('error', err)
  }
  ws.onmessage = function(message) {
    self.emit('data', new Buffer(message.data))
  }
}
util.inherits(Socket, EventEmitter)

Socket.prototype.end = function() {
  this.ws.close()
}

Socket.prototype.destroy = function() {
  this.ws.close()
}

Socket.prototype.write = function(data) {
  this.ws.send(data)
}

Socket.prototype.setNoDelay = function() {
}

exports.createConnection = function(port, host) {
  return new Socket('ws://' + host + ':' + port)
}
