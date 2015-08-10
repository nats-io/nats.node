/* jslint node: true */
/* global describe: false, before: false, after: false, it: false */
'use strict';

var NATS = require ('../'),
    nsc = require('./support/nats_server_control'),
    should = require('should');

var PORT = 1428;

describe('Timeout and max received events for subscriptions', function() {

  var server;

  // Start up our own nats-server
  before(function(done) {
    server = nsc.start_server(PORT, done);
  });

  // Shutdown our server after we are done
  after(function(){
    server.kill();
  });

  it('should perform simple timeouts on subscriptions', function(done) {
    var nc = NATS.connect(PORT);
    nc.on('connect', function() {
      var startTime = new Date();
      var sid = nc.subscribe('foo');
      nc.timeout(sid, 50, 1, function() {
        var elapsed = new Date() - startTime;
        should.exists(elapsed);
        elapsed.should.be.within(45, 75);
        done();
      });
    });
  });

  it('should not timeout if exepected has been received', function(done) {
    var nc = NATS.connect(PORT);
    nc.on('connect', function() {
      var sid = nc.subscribe('foo');
      nc.timeout(sid, 50, 1, function() {
        done(new Error('Timeout improperly called'));
      });
      nc.publish('foo', done);
    });
  });

});
