/* jslint node: true */
/* global describe: false, it: false */
/* jshint -W030 */
'use strict';

var NATS = require ('../'),
    should = require('should');

describe('Base Properties', function() {

  it('should have a version property', function() {
    NATS.version.should.match(/[0-9]+\.[0-9]+\.[0-9]+/);
  });

  it ('should have the same version as package.json', function() {
    var pkg = require('../package.json');
    NATS.version.should.equal(pkg.version);
  });

  it('should have a connect function', function() {
    NATS.connect.should.be.a.Function;
  });

  it('should have a createInbox function', function() {
    NATS.createInbox.should.be.a.Function;
  });

});

describe('Connection Properties', function() {

  var nc = NATS.connect();
  nc.should.exist;

  it('should have a publish function', function() {
    nc.publish.should.be.a.Function;
  });

  it('should have a subscribe function', function() {
    nc.subscribe.should.be.a.Function;
  });

  it('should have an unsubscribe function', function() {
    nc.unsubscribe.should.be.a.Function;
  });

  it('should have a request function', function() {
    nc.request.should.be.a.Function;
  });

  it('should have an options hash with proper fields', function() {
    nc.should.have.property('options');
    nc.options.should.have.property('url');
    nc.options.should.have.property('verbose');
    nc.options.should.have.property('pedantic');
    nc.options.should.have.property('reconnect');
    nc.options.should.have.property('maxReconnectAttempts');
    nc.options.should.have.property('reconnectTimeWait');
  });

  it('should have an parsed url', function() {
    nc.should.have.property('url');
    nc.url.should.be.an.Object;
    nc.url.should.have.property('protocol');
    nc.url.should.have.property('host');
    nc.url.should.have.property('port');
  });

  nc.close();

  it('should allow options to be overridden', function() {
    var options = {
      'url'       : 'nats://localhost:22421',
      'verbose'   : true,
      'pedantic'  : true,
      'reconnect' : false,
      'maxReconnectAttempts' : 22,
      'reconnectTimeWait' : 11
    };

    nc = NATS.connect(options);
    nc.on('error', function() {}); // Eat error

    nc.options.url.should.equal('nats://localhost:22421');
    nc.options.verbose.should.equal(true);
    nc.options.pedantic.should.equal(true);
    nc.options.reconnect.should.equal(false);
    nc.options.maxReconnectAttempts.should.equal(22);
    nc.options.reconnectTimeWait.should.equal(11);
    nc.close();
  });

});