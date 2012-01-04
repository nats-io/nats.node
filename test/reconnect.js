var NATS = require ('../'),
    nsc = require('./support/nats_server_control');

var PORT = 1421;
var uri = 'nats://localhost:' + PORT;

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

  it('should emit a reconnecting event', function(done) {
    var nc = NATS.connect(PORT);
    nc.should.exist;
    nc.on('reconnecting', function(client) {
      nc.close();
      server = nsc.start_server(PORT, done);
    });
    nc.on('disconnected', function() {
      done(new Error('Disconnect improperly called'));
    });
    nc.flush(function() {
      server.kill();
    });
  });

  it('should not emit a reconnecting event if suppressed', function(done) {
    var nc = NATS.connect({ 'port' : PORT, 'reconnect' : false });
    nc.should.exist;
    nc.on('reconnecting', function(client) {
      done(new Error('Reconnecting improperly called'));
    });
    nc.on('disconnected', function() {
      nc.close();
      server = nsc.start_server(PORT, done);
    });
    nc.flush(function() {
      server.kill();
    });
  });

});
