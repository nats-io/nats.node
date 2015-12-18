/* jslint node: true */
/* global describe: false, before: false, after: false, it: false */
'use strict';

var NATS = require ('../'),
    nsc = require('./support/nats_server_control'),
    should = require('should');

describe('Errors', function() {

  var PORT = 1491;
  var server;

  // Start up our own nats-server
  before(function(done) {
    server = nsc.start_server(PORT, done);
  });

  // Shutdown our server after we are done
  after(function(){
    server.kill();
  });

  it('should throw errors on publish', function(done) {
    var nc = NATS.connect(PORT);
    // No subject
    (function() { nc.publish(); }).should.throw(Error);
    // bad args
    (function() { nc.publish('foo', function(){}, 'bar'); }).should.throw(Error);
    (function() { nc.publish('foo', 'bar', function(){}, function(){}, 'bar'); }).should.throw(Error);
    // closed
    nc.close();
    (function() { nc.publish('foo'); }).should.throw(Error);
    done();
  });

  it('should throw errors on flush', function(done) {
    var nc = NATS.connect(PORT);
    nc.close();
    (function() { nc.flush(); }).should.throw(Error);
    done();
  });

  it('should emit errors on publish with err handlers', function(done) {
    var nc = NATS.connect(PORT);
    var expectedErrors = 3;
    var received = 0;

    nc.on('error', function(err) {
      should.exist(err);
      if (++received == expectedErrors) {
	done();
      }
    });

    // No subject
    nc.publish();
    // bad args
    nc.publish('foo', function(){}, 'bar');
    nc.publish('foo', 'bar', function(){}, function(){});

    // closed will still throw since we remove event listeners.
    nc.close();
    (function() { nc.publish('foo'); }).should.throw(Error);
  });

  it('should throw errors on subscribe', function(done) {
    var nc = NATS.connect(PORT);
    nc.close();
    // Closed
    (function() { nc.subscribe('foo'); }).should.throw(Error);
    done();
  });

});
