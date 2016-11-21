/* jslint node: true */
/* global describe: false, before: false, after: false, it: false */
'use strict';

var NATS = require ('../'),
    nsc = require('./support/nats_server_control'),
    sleep = require('./support/sleep'),
    should = require('should');

describe('Yield', function() {
  var PORT = 1469;
  var server;

  // Start up our own nats-server
  before(function(done) {
    server = nsc.start_server(PORT, done);
  });

  // Shutdown our server
  after(function() {
    server.kill();
  });

  it('should yield to other events', function(done) {
    var nc = NATS.connect({port: PORT, yieldTime: 5});

    var start = Date.now();

    var timer = setInterval(function() {
      var delta = Date.now() - start;
      nc.close();
      clearTimeout(timer);
      delta.should.within(10, 25);
      done();
    }, 10);

    nc.subscribe('foo', function() {
      sleep.sleep(1);
    });

    for (var i = 0; i < 256; i++) {
      nc.publish('foo', 'hello world');
    }
  });
});
