/* jslint node: true */
/* global describe: false, before: false, after: false, it: false */
'use strict';

var NATS = require ('../'),
    nsc = require('./support/nats_server_control'),
    should = require('should');

describe('UTF8', function() {

  var PORT = 1430;
  var server;

  // Start up our own nats-server
  before(function(done) {
    server = nsc.start_server(PORT, done);
  });

  // Shutdown our server
  after(function() {
    server.kill();
  });

  it('should do publish and subscribe with UTF8 payloads by default', function(done) {
    var nc = NATS.connect(PORT);
    // ½ + ¼ = ¾: 9 characters, 12 bytes
    var data = '\u00bd + \u00bc = \u00be';
    data.length.should.equal(9);
    Buffer.byteLength(data).should.equal(12);

    nc.subscribe('utf8', function(msg) {
      should.exists(msg);
      msg.should.equal(data);
      nc.close();
      done();
    });

    nc.publish('utf8', data);
  });

  it('should allow encoding override with the encoding option', function(done) {
    var nc = NATS.connect({'url': 'nats://localhost:' + PORT, 'encoding': 'ascii'});
    // ½ + ¼ = ¾: 9 characters, 12 bytes
    var utf8_data = '\u00bd + \u00bc = \u00be';
    var plain_data = 'Hello World';

    nc.subscribe('utf8', function(msg) {
      // Should be all 12 bytes..
      msg.length.should.equal(12);
      // Should not be a proper utf8 string.
      msg.should.not.equal(utf8_data);
    });

    nc.subscribe('plain', function(msg) {
      msg.should.equal(plain_data);
      nc.close();
      done();
    });

    nc.publish('utf8', utf8_data);
    nc.publish('plain', plain_data);
  });

  it('should not allow unsupported encodings', function(done) {
    try {
      NATS.connect({'url': 'nats://localhost:' + PORT, 'encoding': 'foobar'});
      done('No error thrown, wanted Invalid Encoding Exception');
    } catch(err) {
      if (err.toString().indexOf('Invalid Encoding') < 0) {
        done('Bad Error, wanted Invalid Encoding');
      } else {
        done();
      }
    }
  });

});
