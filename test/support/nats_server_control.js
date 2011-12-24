
var spawn = require('child_process').spawn;
var net = require('net');

var SERVER = 'nats-server';
var DEFAULT_PORT = 4222;

exports.start_server = function(port, opt_flags, done) {
  if (port == undefined) {
    port = DEFAULT_PORT;
  }
  if (typeof opt_flags == 'function') {
    done = opt_flags;
    opt_flags = null;
  }
  // FIXME, add in other flags.
  var server = spawn(SERVER, ['-p', port]);

  var start   = new Date();
  var wait    = 0;
  var maxWait = 5 * 1000; // 5 secs
  var delta   = 200;

  // Test for when socket is bound.
  var timer = setInterval(function() {

    wait = new Date() - start;
    if (wait > maxWait) {
      if (typeof done == 'function') {
	done(new Error("Can't connect to server on port: " + port));
      }
    }

    // Try to connect to the correct port.
    var socket = net.createConnection(port);

    // Success
    socket.on('connect', function() {
      clearInterval(timer);
      socket.destroy();
      if (typeof done == 'function') { done() }
    });

    // Wait for next try..
    socket.on('error', function(error) {
      socket.destroy();
    });

  }, delta);

  // Server does not exist..
  server.stderr.on('data', function(data) {
    if (/^execvp\(\)/.test(data)) {
      clearInterval(timer);
      if (typeof done == 'function') {
	done(new Error("Can't find the " + SERVER + " (e.g. gem install nats)"));
      }
    }
  });

  return server;
}

exports.stop_server = function(server) {
  if (server != undefined) {
    server.kill();
  }
}
