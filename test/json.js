/* jslint node: true */
/* global describe: false, before: false, after: false, it: false */
'use strict';


var NATS = require ('../'),
nsc = require('./support/nats_server_control'),
should = require('should');

describe('JSON payloads', function() {

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


  it('should pub/sub with json', function(done){
    var nc = NATS.connect({json: true, port: PORT});
    nc.subscribe('foo', function(msg, reply, subj, sid){
      should.ok(typeof msg !== 'string');
      should.exist(msg.field);
      msg.field.should.be.equal('hello');
      should.exist(msg.body);
      msg.body.should.be.equal('world');
      nc.unsubscribe(sid);
      nc.close();
      done();
    });

    nc.publish('foo', {field:'hello', body:'world'});
  });

  it('should pub/sub fail not json', function(done){
    var nc = NATS.connect({json: true, port: PORT});
    try {
      nc.publish('foo', 'hi');
    } catch(err) {
      nc.close();
      err.message.should.be.equal('Message should be a JSON object');
      done();
    }
  });

  it('should pub/sub array with json', function(done){
    var nc = NATS.connect({json: true, port: PORT});
    nc.subscribe('foo', function(msg, reply, subj, sid){
      should.ok(typeof msg !== 'string');
      msg.should.be.instanceof(Array).and.have.lengthOf(3);
      nc.unsubscribe(sid);
      nc.close();
      done();
    });

    nc.publish('foo', ['one', 'two', 'three']);
  });
});