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
  
  it('should throw errors on connect', function(done) {
    (function() { var nc = NATS.connect({'url':'nats://localhost:' + PORT, 'token':'token1', 'user':'foo'}); }).should.throw(Error);
    done();
  });

  it('should throw errors on publish', function(done) {
    var nc = NATS.connect(PORT);
    // No subject
    (function() { nc.publish(); }).should.throw(Error);
    // bad args
    (function() { nc.publish('foo', function(){}, 'bar'); }).should.throw(Error);
    (function() { nc.publish('foo', 'bar', function(){}, 'bar'); }).should.throw(Error);
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

  it('should pass errors on publish with callbacks', function(done) {
    var nc = NATS.connect(PORT);
    var expectedErrors = 4;
    var received = 0;

    var cb = function(err) {
      should.exist(err);
      if (++received == expectedErrors) {
	done();
      }
    };

    // No subject
    nc.publish(cb);
    // bad args
    nc.publish('foo', function(){}, 'bar', cb);
    nc.publish('foo', 'bar', function(){}, cb);

    // closed will still throw since we remove event listeners.
    nc.close();
    nc.publish('foo', cb);
  });

  it('should throw errors on subscribe', function(done) {
    var nc = NATS.connect(PORT);
    nc.close();
    // Closed
    (function() { nc.subscribe('foo'); }).should.throw(Error);
    done();
  });

  it ('NatsErrors have code', function() {
    var err = new NATS.NatsError("hello", "helloid");
    should.equal(err.message, 'hello');
    should.equal(err.code, 'helloid');
  });

  it ('NatsErrors can chain an error', function() {
    var srcErr = new Error('foo');
    var err = new NATS.NatsError("hello", "helloid", srcErr);
    should.equal(err.message, 'hello');
    should.equal(err.code, 'helloid');
    should.equal(err.chainedError, srcErr);
    should.equal(err.name, 'NatsError');
  });

});
