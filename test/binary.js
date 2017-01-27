/* jslint node: true */
/* global describe: false, before: false, after: false, it: false */
'use strict';

var NATS = require ('../'),
    nsc = require('./support/nats_server_control'),
    crypto = require('crypto'),
    should = require('should');

describe('Binary', function() {

  var PORT = 1432;
  var server;

  // Start up our own nats-server
  before(function(done) {
    server = nsc.start_server(PORT, done);
  });

  // Shutdown our server
  after(function() {
    server.kill();
  });


  function binaryDataTests(done, nc) {
    // try some invalid utf-8 byte sequences
    var invalid2octet = new Buffer('\xc3\x28', 'binary');
    var invalidsequenceidentifier = new Buffer('\xa0\xa1', 'binary');
    var invalid3octet = new Buffer('\xe2\x28\xa1', 'binary');
    var invalid4octet = new Buffer('\xf0\x90\x28\xbc', 'binary');
    var bigBuffer = crypto.randomBytes(128*1024);

    // make sure embedded nulls don't cause truncation
    var embeddednull = new Buffer('\x00\xf0\x00\x28\x00\x00\xf0\x9f\x92\xa9\x00', 'binary');

    var count = 6;
    var finished = function() {
      if (--count <= 0) {
        nc.close();
        done();
      }
    };

    nc.subscribe('invalid2octet', function(msg) {
      msg.length.should.equal(2);
      if(nc.options.preserveBuffers) {
        should.ok(invalid2octet.equals(msg));
      } else {
        msg.should.equal(invalid2octet.toString('binary'));
      }
      finished();
    });

    nc.subscribe('invalidsequenceidentifier', function(msg) {
      msg.length.should.equal(2);
      if(nc.options.preserveBuffers) {
        should.ok(invalidsequenceidentifier.equals(msg));
      } else {
        msg.should.equal(invalidsequenceidentifier.toString('binary'));
      }
      finished();
    });

    nc.subscribe('invalid3octet', function(msg) {
      msg.length.should.equal(3);
      if(nc.options.preserveBuffers) {
        should.ok(invalid3octet.equals(msg));
      } else {
        msg.should.equal(invalid3octet.toString('binary'));
      }
      finished();
    });

    nc.subscribe('invalid4octet', function(msg) {
      msg.length.should.equal(4);
      if(nc.options.preserveBuffers) {
        should.ok(invalid4octet.equals(msg));
      } else {
        msg.should.equal(invalid4octet.toString('binary'));
      }
      finished();
    });

    nc.subscribe('embeddednull', function(msg) {
      msg.length.should.equal(11);
      if(nc.options.preserveBuffers) {
        should.ok(embeddednull.equals(msg));
      } else {
        msg.should.equal(embeddednull.toString('binary'));
      }
      finished();
    });

    nc.subscribe('bigbuffer', function(msg) {
      msg.length.should.equal(bigBuffer.length);
      if(nc.options.preserveBuffers) {
        should.ok(bigBuffer.equals(msg));
      } else {
        msg.should.equal(bigBuffer.toString('binary'));
      }
      finished();
    });


    nc.publish('invalid2octet', invalid2octet);
    nc.publish('invalidsequenceidentifier', invalidsequenceidentifier);
    nc.publish('invalid3octet', invalid3octet);
    nc.publish('invalid4octet', invalid4octet);
    nc.publish('embeddednull', embeddednull);
    nc.publish('bigbuffer', bigBuffer);
  }

  it('should allow sending and receiving binary data', function(done) {
    var nc = NATS.connect({'url': 'nats://localhost:' + PORT, 'encoding': 'binary'});
    binaryDataTests(done, nc);
  });

  it('should allow sending binary buffers', function(done) {
    var nc = NATS.connect({'url': 'nats://localhost:' + PORT, 'preserveBuffers': true});
    binaryDataTests(done, nc);
  });

  it('should not append control characters on chunk processing', function(done) {
    var nc = NATS.connect({ 'url': 'nats://localhost:' + PORT, 'preserveBuffers': true });
    var buffer = crypto.randomBytes(1024);

    var count = 0;
    var finished = function () {
      
      if (++count == 100) {
        nc.close();
        done();
      }
    };
    
    nc.subscribe('trailingData', function (msg) {
      should.ok(msg.equals(buffer));
      finished();
    });

    for (var i = 0; i <= 100; i++) {
      
      nc.publish('trailingData', buffer);
    }

  });

});