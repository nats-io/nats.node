/* jslint node: true */
/* global describe: false, before: false, after: false, it: false */
'use strict';


var NATS = require ('../'),
nsc = require('./support/nats_server_control'),
should = require('should');

describe('raw buffer payloads', function() {

  var PORT = 1423;
  var server;

  // Start up our own nats-server
  before(function (done) {
    server = nsc.start_server(PORT, done);
  });

  // Shutdown our server
  after(function () {
    server.kill();
  });


  it('should pub/sub with raw buffers', function(done){
    var nc = NATS.connect({encoding: null, port: PORT});
    nc.subscribe('foo', function(msg, reply, subj, sid){
      should.ok(Buffer.isBuffer(msg));
      msg.toString('utf8', 0, 2).should.equal('hi');
      msg.length.should.equal(4);
      msg[2].should.equal(255);
      msg[3].should.equal(0);
      nc.unsubscribe(sid);
      nc.close();
      done();
    });

    var buf = new Buffer(4);
    buf[0] = 104;
    buf[1] = 105;
    buf[2] = 255;
    buf[3] = 0;
    nc.publish('foo', buf);
  });

  it('should pub/sub raw buffers even when given strings', function(done){
    var nc = NATS.connect({encoding: null, port: PORT});
    nc.subscribe('foo', function(msg, reply, subj, sid){
      should.ok(Buffer.isBuffer(msg));
      msg.toString('utf8', 0, 5).should.equal('hello');
      msg.length.should.equal(5);
      nc.unsubscribe(sid);
      nc.close();
      done();
    });

    nc.publish('foo', 'hello');
  });

});