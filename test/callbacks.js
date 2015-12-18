/* jslint node: true */
/* global describe: false, before: false, after: false, it: false */
'use strict';

var NATS = require ('../'),
    nsc = require('./support/nats_server_control'),
    should = require('should');

describe('Callbacks', function() {

  var PORT = 1429;
  var server;

  // Start up our own nats-server
  before(function(done) {
    server = nsc.start_server(PORT, done);
  });

  // Shutdown our server
  after(function() {
    server.kill();
  });

  it('should properly do a publish callback after connection is closed', function(done) {
    var nc = NATS.connect(PORT);
    nc.close();
    nc.publish('foo', function(err) {
      should.exist(err);
      done();
    });
  });

  it('should properly do a flush callback after connection is closed', function(done) {
    var nc = NATS.connect(PORT);
    nc.close();
    nc.flush(function(err) {
      should.exist(err);
      done();
    });
  });

});
