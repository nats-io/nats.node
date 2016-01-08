/* jslint node: true */
/* global describe: false, before: false, after: false, it: false */
'use strict';

var NATS = require ('../'),
    nsc = require('./support/nats_server_control'),
    should = require('should');

describe('Subscription Events', function() {

  var PORT = 9422;
  var server;

  // Start up our own nats-server
  before(function(done) {
    server = nsc.start_server(PORT, done);
  });

  // Shutdown our server after we are done
  after(function(){
    server.kill();
  });


  it('should generate subscribe events', function(done) {
    var nc = NATS.connect(PORT);
    var subj = 'sub.event';
    nc.on('subscribe', function(sid, subject) {
      should.exist(sid);
      should.exist(subject);
      subject.should.equal(subj);
      nc.close();
      done();
    });
    nc.subscribe(subj);
  });

  it('should generate subscribe events with opts', function(done) {
    var nc = NATS.connect(PORT);
    var subj = 'sub.event';
    var queuegroup = 'bar';
    nc.on('subscribe', function(sid, subject, opts) {
      should.exist(sid);
      should.exist(subject);
      subject.should.equal(subj);
      should.exist(opts);
      should.exist(opts.queue);
      opts.queue.should.equal(queuegroup);
      nc.close();
      done();
    });
    nc.subscribe(subj, {queue:queuegroup});
  });

  it('should generate unsubscribe events', function(done) {
    var nc = NATS.connect(PORT);
    var subj = 'sub.event';
    nc.on('unsubscribe', function(sid, subject) {
      should.exist(sid);
      should.exist(subject);
      subject.should.equal(subj);
      nc.close();
      done();
    });
    var sid = nc.subscribe(subj);
    nc.unsubscribe(sid);
  });

  it('should generate unsubscribe events on auto-unsub', function(done) {
    var nc = NATS.connect(PORT);
    var subj = 'autounsub.event';
    nc.on('unsubscribe', function(sid, subject) {
      should.exist(sid);
      should.exist(subject);
      subject.should.equal(subj);
      nc.close();
      done();
    });
    nc.subscribe(subj, {max:1});
    nc.publish(subj);
  });

  it('should generate only unsubscribe events on auto-unsub', function(done) {
    var nc = NATS.connect(PORT);
    var subj = 'autounsub.event';
    var eventsReceived = 0;
    var want = 5;

    nc.on('unsubscribe', function(sid, subject) {
      eventsReceived++;
    });
    var sid = nc.subscribe(subj);
    nc.unsubscribe(sid, want);
    for (var i=0; i<want; i++) {
      nc.publish(subj);
    }
    nc.flush(function() {
      eventsReceived.should.equal(1);
      nc.close();
      done();
    });
  });

});
