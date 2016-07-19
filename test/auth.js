/* jslint node: true */
/* global describe: false, before: false, after: false, it: false */
'use strict';

var NATS = require ('../'),
    nsc = require('./support/nats_server_control'),
    should = require('should');

describe('Authorization', function() {

  var PORT = 1421;
  var flags = ['--user', 'derek', '--pass', 'foobar'];
  var authUrl = 'nats://derek:foobar@localhost:' + PORT;
  var noAuthUrl = 'nats://localhost:' + PORT;
  var server;

  // Start up our own nats-server
  before(function(done) {
    server = nsc.start_server(PORT, flags, done);
  });

  // Shutdown our server after we are done
  after(function(){
    server.kill();
  });

  it('should fail to connect with no credentials ', function(done) {
    var nc = NATS.connect(PORT);
    nc.on('error', function(err) {
      should.exist(err);
      should.exist(/Authorization/.exec(err));
      nc.close();
      done();
    });
  });

  it('should connect with proper credentials in url', function(done) {
    var nc = NATS.connect(authUrl);
    nc.on('connect', function(/*nc*/) {
      setTimeout(function() {
          nc.close();
          done();
      }, 100);
    });
  });

  it('should connect with proper credentials as options', function(done) {
    var nc = NATS.connect({'url':noAuthUrl, 'user':'derek', 'pass':'foobar'});
    nc.on('connect', function(/*nc*/) {
        setTimeout(function() {
            nc.close();
            done();
        }, 100);
    });
  });

  it('should connect with proper credentials as server url', function(done) {
    var nc = NATS.connect({'servers':[authUrl]});
    nc.on('connect', function(/*nc*/) {
      setTimeout(done, 100);
    });
  });

});

describe('Token Authorization', function() {

  var PORT = 1421;
  var flags = ['--auth', 'token1'];
  var authUrl = 'nats://token1@localhost:' + PORT;
  var noAuthUrl = 'nats://localhost:' + PORT;
  var server;

  // Start up our own nats-server
  before(function(done) {
    server = nsc.start_server(PORT, flags, done);
  });

  // Shutdown our server after we are done
  after(function(){
    server.kill();
  });

  it('should fail to connect with no credentials ', function(done) {
    var nc = NATS.connect(PORT);
    nc.on('error', function(err) {
      should.exist(err);
      should.exist(/Authorization/.exec(err));
      nc.close();
      done();
    });
  });

  it('should connect with proper credentials in url', function(done) {
    var nc = NATS.connect(authUrl);
    nc.on('connect', function(/*nc*/) {
      setTimeout(function() {
          nc.close();
          done();
      }, 100);
    });
  });

  it('should connect with proper credentials as options', function(done) {
    var nc = NATS.connect({'url':noAuthUrl, 'token':'token1'});
    nc.on('connect', function(/*nc*/) {
        setTimeout(function() {
            nc.close();
            done();
        }, 100);
    });
  });

  it('should connect with proper credentials as server url', function(done) {
    var nc = NATS.connect({'servers':[authUrl]});
    nc.on('connect', function(/*nc*/) {
      setTimeout(done, 100);
    });
  });

});
