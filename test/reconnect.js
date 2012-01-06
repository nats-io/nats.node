var NATS = require ('../'),
    nsc = require('./support/nats_server_control');

var PORT = 1421;
var uri = 'nats://localhost:' + PORT;

var WAIT = 20;
var ATTEMPTS = 4;

describe('Reconnect functionality', function() {

  var server;

  // Start up our own nats-server
  before(function(done) {
    server = nsc.start_server(PORT, done);
  });

  // Shutdown our server after we are done
  after(function(){
    server.kill();
  });

  it('should not emit a reconnecting event if suppressed', function(done) {
    var nc = NATS.connect({'port':PORT, 'reconnect':false});
    nc.should.exist;
    nc.on('connect', function() {
      server.kill();
    });
    nc.on('reconnecting', function(client) {
      done(new Error('Reconnecting improperly called'));
    });
    nc.on('disconnected', function() {
      nc.close();
      server = nsc.start_server(PORT, done);
    });
  });

  it('should emit a reconnecting event after proper delay', function(done) {
    var nc = NATS.connect({'port':PORT, 'reconnectTimeWait':WAIT});
    var startTime;
    nc.should.exist;
    nc.on('connect', function() {
      server.kill();
      startTime = new Date();
    });
    nc.on('reconnecting', function(client) {
      var elapsed = new Date() - startTime;
      elapsed.should.be.within(WAIT, 2*WAIT);
      nc.close();
      server = nsc.start_server(PORT, done);
    });
    nc.on('disconnected', function() {
      done(new Error('Disconnect improperly called'));
    });
  });

  it('should emit multiple reconnecting events and fail after maxReconnectAttempts', function(done) {
    var nc = NATS.connect({'port':PORT, 'reconnectTimeWait':WAIT, 'maxReconnectAttempts':ATTEMPTS});
    var startTime;
    var numAttempts = 0;
    nc.on('connect', function() {
      server.kill();
      startTime = new Date();
    });
    nc.on('reconnecting', function(client) {
      var elapsed = new Date() - startTime;
      elapsed.should.be.within(WAIT, 2*WAIT);
      startTime = new Date();
      numAttempts += 1;
    });
    nc.on('disconnected', function() {
      numAttempts.should.equal(ATTEMPTS);
      nc.close();
      done();
    });
  });

});
