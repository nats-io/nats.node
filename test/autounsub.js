/* jslint node: true */
/* global describe: false, before: false, after: false, it: false */
'use strict';

var NATS = require ('../'),
    nsc = require('./support/nats_server_control'),
    should = require('should');

describe('Max responses and Auto-unsub', function() {

  var PORT = 1422;
  var server;

  // Start up our own nats-server
  before(function(done) {
    server = nsc.start_server(PORT, done);
  });

  // Shutdown our server after we are done
  after(function(){
    server.kill();
  });

  it('should only received max responses requested', function(done) {
    var nc = NATS.connect(PORT);
    var WANT = 10;
    var SEND = 20;
    var received = 0;

    nc.subscribe('foo', {'max':WANT}, function() {
      received += 1;
    });
    for (var i=0; i<SEND; i++) {
      nc.publish('foo');
    }
    nc.flush(function() {
      should.exists(received);
      received.should.equal(WANT);
      nc.close();
      done();
    });
  });

  it('should only received max responses requested (client support)', function(done) {
    var nc = NATS.connect(PORT);
    var WANT = 10;
    var SEND = 20;
    var received = 0;

    var sid = nc.subscribe('foo', function() {
      received += 1;
    });
    for (var i=0; i<SEND; i++) {
      nc.publish('foo');
    }
    nc.unsubscribe(sid, WANT);

    nc.flush(function() {
      should.exists(received);
      received.should.equal(WANT);
      nc.close();
      done();
    });
  });

  it('should not complain when unsubscribing an auto-unsubscribed sid', function(done) {
    var nc = NATS.connect(PORT);
    var SEND = 20;
    var received = 0;

    var sid = nc.subscribe('foo', {'max':1}, function() {
      received += 1;
    });
    for (var i=0; i<SEND; i++) {
      nc.publish('foo');
    }

    nc.flush(function() {
      nc.unsubscribe(sid);
      should.exists(received);
      received.should.equal(1);
      nc.close();
      done();
    });
  });

  it('should allow proper override to a lesser value ', function(done) {
    var nc = NATS.connect(PORT);
    var SEND = 20;
    var received = 0;

    var sid = nc.subscribe('foo', function() {
      received += 1;
      nc.unsubscribe(sid, 1);
    });
    nc.unsubscribe(sid, SEND);

    for (var i=0; i<SEND; i++) {
      nc.publish('foo');
    }

    nc.flush(function() {
      should.exists(received);
      received.should.equal(1);
      nc.close();
      done();
    });
  });

  it('should allow proper override to a higher value', function(done) {
    var nc = NATS.connect(PORT);
    var WANT = 10;
    var SEND = 20;
    var received = 0;

    var sid = nc.subscribe('foo', function() {
      received += 1;
    });
    nc.unsubscribe(sid, 1);
    nc.unsubscribe(sid, WANT);

    for (var i=0; i<SEND; i++) {
      nc.publish('foo');
    }

    nc.flush(function() {
      should.exists(received);
      received.should.equal(WANT);
      nc.close();
      done();
    });
  });

  it('should only receive N msgs in request mode with multiple helpers', function(done) {
    /* jshint loopfunc: true */
    var nc = NATS.connect(PORT);
    var received = 0;

    // Create 5 helpers
    for (var i=0; i<5; i++) {
      nc.subscribe('help', function(msg, reply) {
        nc.publish(reply, 'I can help!');
      });
    }

    nc.request('help', null, {'max':1}, function() {
      received += 1;
      nc.flush(function() {
        should.exists(received);
        received.should.equal(1);
        nc.close();
        done();
      });
    });

  });

  it('should not leak subscriptions when using max', function(done) {
    /* jshint loopfunc: true */
    var nc = NATS.connect(PORT);
    var received = 0;

    nc.subscribe('help', function(msg, reply) {
      nc.publish(reply, 'I can help!');
    });

    // Create 5 requests
    for (var i=0; i<5; i++) {
      nc.request('help', null, {'max':1}, function() {
	received += 1;
      });
    }
    nc.flush(function() {
      setTimeout(function() {
	received.should.equal(5);
	Object.keys(nc.subs).length.should.equal(1);
	nc.close();
	done();
      }, 100);
    });

  });

});