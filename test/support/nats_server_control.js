/* jslint node: true */
'use strict';

var spawn = require('child_process').spawn;
var net = require('net');

var SERVER = (process.env.TRAVIS) ? 'gnatsd/gnatsd' : 'gnatsd';
var DEFAULT_PORT = 4222;

exports.start_server = function(port, opt_flags, done) {
  if (!port) {
    port = DEFAULT_PORT;
  }
  if (typeof opt_flags == 'function') {
    done = opt_flags;
    opt_flags = null;
  }
  var flags = ['-p', port];

  if (opt_flags) {
    flags = flags.concat(opt_flags);
  }

  var server = spawn(SERVER, flags);

  var start   = new Date();
  var wait    = 0;
  var maxWait = 5 * 1000; // 5 secs
  var delta   = 250;
  var socket;
  var timer;

  var resetSocket = function() {
    if (socket !== undefined) {
      socket.removeAllListeners();
      socket.destroy();
      socket = undefined;
    }
  };

  var finish = function(err) {
    resetSocket();
    if (timer !== undefined) {
      clearInterval(timer);
      timer = undefined;
    }
    if (done) {
      done(err);
    }
  };

  // Test for when socket is bound.
  timer = setInterval(function() {
    resetSocket();

    wait = new Date() - start;
    if (wait > maxWait) {
      finish(new Error('Can\'t connect to server on port: ' + port));
    }

    // Try to connect to the correct port.
    socket = net.createConnection(port);

    // Success
    socket.on('connect', function() {
      if (server.pid === null) {
        // We connected but not to our server..
        finish(new Error('Server already running on port: ' + port));
      } else {
        finish();
      }
    });

    // Wait for next try..
    socket.on('error', function(error) {
      finish(new Error("Problem connecting to server on port: " + port + " (" + error + ")"));
    });

  }, delta);

  // Other way to catch another server running.
  server.on('exit', function(code, signal) {
    if (code === 1) {
      finish(new Error('Server exited with bad code, already running? (' + code + ' / ' + signal + ')'));
    }
  });

  // Server does not exist..
  server.stderr.on('data', function(data) {
    if (/^execvp\(\)/.test(data)) {
      clearInterval(timer);
      finish(new Error('Can\'t find the ' + SERVER));
    }
  });

  return server;
};

exports.stop_server = function(server) {
  if (server !== undefined) {
    server.kill();
  }
};
