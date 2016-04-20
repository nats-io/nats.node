/* jslint node: true */
/* global describe: false, before: false, after: false, it: false */
'use strict';

var NATS = require ('../'),
    nsc = require('./support/nats_server_control'),
    should = require('should');

describe('Double SUBS', function() {

  var PORT = 1922;
  var flags = ['-DV'];
  var server;

  // Start up our own nats-server
  before(function(done) {
    server = nsc.start_server(PORT, flags, done);
  });

  // Shutdown our server after we are done
  after(function(){
    server.kill();
  });

  it('should not send multiple subscriptions on startup', function(done) {
    var subsSeen = 0;
    var subRe = /(\[SUB foo \d\])+/g;

    // Capture log output from nats-server and check for double SUB protos.
    server.stderr.on('data', function(data) {
      var m;
      while ((m = subRe.exec(data)) !== null) {
	subsSeen ++;
      }
    });

    var nc = NATS.connect(PORT);
    nc.subscribe('foo');
    nc.on('connect', function(/*nc*/) {
      setTimeout(function() {
        nc.close();
	subsSeen.should.equal(1);
        done();
      }, 100);
    });
  });

});
