/* jslint node: true */
/* global describe: false, before: false, after: false, it: false */
'use strict';

var NATS = require ('../'),
    nsc = require('./support/nats_server_control'),
    should = require('should'),
    fs = require('fs');

describe('TLS', function() {

  var PORT = 1442;
  var TLSPORT = 1443;
  var TLSVERIFYPORT = 1444;
  var flags = [];

  var server;
  var tlsServer;
  var tlsVerifyServer;

  // Start up our own nats-server for each test
  // We will start a plain, a no client cert, and a client cert required.
  before(function(done) {
    server = nsc.start_server(PORT, function() {
      var flags = ['--tls', '--tlscert', './test/certs/server-cert.pem',
		   '--tlskey', './test/certs/server-key.pem'];
      tlsServer = nsc.start_server(TLSPORT, flags, function() {
	var flags = ['--tlsverify', '--tlscert', './test/certs/server-cert.pem',
		     '--tlskey', './test/certs/server-key.pem',
		     '--tlscacert', './test/certs/ca.pem'];
	tlsVerifyServer = nsc.start_server(TLSVERIFYPORT, flags, done);
      });
    });
  });


  // Shutdown our server after each test.
  after(function() {
    server.kill();
    tlsServer.kill();
    tlsVerifyServer.kill();
  });

  it('should error if server does not support TLS', function(done) {
    var nc = NATS.connect({port: PORT, tls: true});
    nc.on('error', function(err) {
      should.exist(err);
      should.exist(/Server does not support a secure/.exec(err));
      nc.close();
      done();
    });
  });

  it('should error if server requires TLS', function(done) {
    var nc = NATS.connect(TLSPORT);
    nc.on('error', function(err) {
      should.exist(err);
      should.exist(/Server requires a secure/.exec(err));
      nc.close();
      done();
    });
  });

  it('should reject without proper CA', function(done) {
    var nc = NATS.connect({port: TLSPORT, tls: true});
    nc.on('error', function(err) {
      should.exist(err);
      should.exist(/unable to verify the first certificate/.exec(err));
      nc.close();
      done();
    });
  });

  it('should connect if authorized is overridden', function(done) {
    var tlsOptions = {
      rejectUnauthorized: false,
    };
    var nc = NATS.connect({port: TLSPORT, tls: tlsOptions});
    should.exist(nc);
    nc.on('connect', function(client) {
      client.should.equal(nc);
      nc.stream.authorized.should.equal(false);
      nc.close();
      done();
    });
  });

  it('should connect with proper ca and be authorized', function(done) {
    var tlsOptions = {
      ca: [ fs.readFileSync('./test/certs/ca.pem') ]
    };
    var nc = NATS.connect({port: TLSPORT, tls: tlsOptions});
    should.exist(nc);
    nc.on('connect', function(client) {
      client.should.equal(nc);
      nc.stream.authorized.should.equal(true);
      nc.close();
      done();
    });
  });

  it('should reject without proper cert if required by server', function(done) {
    var nc = NATS.connect({port: TLSVERIFYPORT, tls: true});
    nc.on('error', function(err) {
      should.exist(err);
      should.exist(/Server requires a client certificate/.exec(err));
      nc.close();
      done();
    });
  });


  it('should be authrorized with proper cert', function(done) {
    var tlsOptions = {
      key: fs.readFileSync('./test/certs/client-key.pem'),
      cert: fs.readFileSync('./test/certs/client-cert.pem'),
      ca: [ fs.readFileSync('./test/certs/ca.pem') ]
    };
    var nc = NATS.connect({port: TLSPORT, tls: tlsOptions});
    nc.on('connect', function(client) {
      client.should.equal(nc);
      nc.stream.authorized.should.equal(true);
      nc.close();
      done();
    });
  });

});
