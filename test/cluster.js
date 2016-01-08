/* jslint node: true */
/* global describe: false, before: false, after: false, it: false */
/* jshint -W030 */
'use strict';

var NATS = require ('../'),
    nsc = require('./support/nats_server_control'),
    should = require('should'),
    url    = require('url');

describe('Cluster', function() {

  var WAIT = 20;
  var ATTEMPTS = 4;

  var PORT1 = 15621;
  var PORT2 = 15622;

  var s1Url = 'nats://localhost:' + PORT1;
  var s2Url = 'nats://localhost:' + PORT2;

  var s1;
  var s2;

  // Start up our own nats-server
  before(function(done) {
    s1 = nsc.start_server(PORT1, function() {
      s2 = nsc.start_server(PORT2, function() {
        done();
      });
    });
  });

  // Shutdown our server
  after(function() {
    s1.kill();
    s2.kill();
  });

  it('should accept servers options', function(done) {
    var nc = NATS.connect({'servers':[s1Url, s2Url]});
    should.exists(nc);
    nc.should.have.property('options');
    nc.options.should.have.property('servers');
    nc.should.have.property('servers');
    nc.servers.should.be.a.Array;
    nc.should.have.property('url');
    nc.flush(function() {
      nc.close();
      done();
    });
  });

  it('should randomly connect to servers by default', function(done) {
    var conns = [];
    var s1Count = 0;
    for (var i=0; i<100; i++) {
      var nc = NATS.connect({'servers':[s1Url, s2Url]});
      conns.push(nc);
      var nurl = url.format(nc.url);
      if (nurl == s1Url) {
        s1Count++;
      }
    }
    for (i=0; i<100; i++) {
      conns[i].close();
    }
    s1Count.should.be.within(35, 65);
    done();
  });

  it('should connect to first valid server', function(done) {
    var nc = NATS.connect({'servers':['nats://localhost:' + 21022, s1Url, s2Url]});
    nc.on('error', function(err) {
      done(err);
    });
    nc.on('connect', function() {
      nc.close();
      done();
    });
  });

  it('should emit error if no servers are available', function(done) {
    var nc = NATS.connect({'servers':['nats://localhost:' + 21022, 'nats://localhost:' + 21023]});
    nc.on('error', function(/*err*/) {
      nc.close();
      done();
    });
    nc.on('reconnecting', function(/*err*/) {
      // This is an error
      done('Should not receive a reconnect event');
    });
  });

  it('should not randomly connect to servers if noRandomize is set', function(done) {
    var conns = [];
    var s1Count = 0;
    for (var i=0; i<100; i++) {
      var nc = NATS.connect({'noRandomize': true, 'servers':[s1Url, s2Url]});
      conns.push(nc);
      var nurl = url.format(nc.url);
      if (nurl == s1Url) {
        s1Count++;
      }
    }
    for (i=0; i<100; i++) {
      conns[i].close();
    }
    s1Count.should == 100;
    done();
  });

  it('should not randomly connect to servers if dontRandomize is set', function(done) {
    var conns = [];
    var s1Count = 0;
    for (var i=0; i<100; i++) {
      var nc = NATS.connect({'dontRandomize': true, 'servers':[s1Url, s2Url]});
      conns.push(nc);
      var nurl = url.format(nc.url);
      if (nurl == s1Url) {
        s1Count++;
      }
    }
    for (i=0; i<100; i++) {
      conns[i].close();
    }
    s1Count.should == 100;
    done();
  });

  it('should fail after maxReconnectAttempts when servers killed', function(done) {
    var nc = NATS.connect({'noRandomize': true, 'servers':[s1Url, s2Url], 'reconnectTimeWait':WAIT, 'maxReconnectAttempts':ATTEMPTS});
    var startTime;
    var numAttempts = 0;
    nc.on('connect', function() {
      s1.kill();
      startTime = new Date();
    });
    nc.on('reconnect', function() {
      s2.kill();
    });
    nc.on('reconnecting', function(/*client*/) {
      var elapsed = new Date() - startTime;
      elapsed.should.be.within(WAIT, 5*WAIT);
      startTime = new Date();
      numAttempts += 1;
    });
    nc.on('close', function() {
      numAttempts.should.equal(ATTEMPTS);
      nc.close();
      done();
    });
  });

});
