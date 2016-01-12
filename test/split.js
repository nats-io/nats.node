/* jslint node: true */
/* global describe: false, before: false, after: false, it: false */
'use strict';

var NATS = require ('../'),
    nsc = require('./support/nats_server_control'),
    should = require('should');

describe('Split Messages', function() {

  var PORT = 1427;
  var server;

  // Start up our own nats-server
  before(function(done) {
    server = nsc.start_server(PORT, done);
  });

  // Shutdown our server
  after(function() {
    server.kill();
  });

  it('should properly handle large # of messages from split buffers', function(done) {
    var nc = NATS.connect(PORT);

    var data = 'Hello World!';
    var received = 0;
    var expected = 10000;

    nc.subscribe('foo', function(msg) {
      should.exists(msg);
      msg.should.equal(data);
      msg.length.should.equal(data.length);
      received += 1;
      if (received == expected) {
        nc.close();
        done();
      }
    });

    for (var i = 0; i < expected; i++) {
      nc.publish('foo', data);
    }
  });

  it('should properly handle large # of utf8 messages from split buffers', function(done) {
    var nc = NATS.connect(PORT);

    // Use utf8 string to make sure encoding works too.
    var data = '½ + ¼ = ¾';
    var received = 0;
    var expected = 10000;

    nc.subscribe('foo', function(msg) {
      msg.should.equal(data);
      msg.length.should.equal(data.length);
      received += 1;
      if (received == expected) {
        done();
      }
    });

    for (var i = 0; i < expected; i++) {
      nc.publish('foo', data);
    }
  });

});
