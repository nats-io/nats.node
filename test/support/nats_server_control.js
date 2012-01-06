
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
  var flags = ['-p', port];

  if (opt_flags != undefined) {
    flags = flags.concat(opt_flags);
  }

  var server = spawn(SERVER, flags);

  var start   = new Date();
  var wait    = 0;
  var maxWait = 5 * 1000; // 5 secs
  var delta   = 50;
  var socket;
  var timer;

  var resetSocket = function() {
    if (socket) {
      socket.removeAllListeners();
      socket.destroy();
      socket = null;
    }
  }

  var finish = function(err) {
    resetSocket();
    if (timer) { clearInterval(timer); }
    if (done) { done(err); }
  };

  // Test for when socket is bound.
  timer = setInterval(function() {
    wait = new Date() - start;
    if (wait > maxWait) {
      finish(new Error("Can't connect to server on port: " + port));
    }

    resetSocket();

    // Try to connect to the correct port.
    socket = net.createConnection(port);

    // Success
    socket.on('connect', function() {
      if (server.pid == null) {
        // We connected but not to our server..
        finish(new Error("Server already running on port: " + port));
      } else {
        finish();
      }
    });

    // Wait for next try..
    socket.on('error', function(error) {
//      finish(new Error("Problem connecting to server on port: " + port + " (" + error + ")"));
    });

  }, delta);

  // Server does not exist..
  server.stderr.on('data', function(data) {
    if (/^execvp\(\)/.test(data)) {
      clearInterval(timer);
      finish(new Error("Can't find the " + SERVER + " (e.g. gem install nats)"));
    }
  });

  return server;
}

exports.stop_server = function(server) {
  if (server != undefined) {
    server.kill();
  }
}
