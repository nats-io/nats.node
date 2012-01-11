var NATS = require ('../'),
    nsc = require('./support/nats_server_control');

describe('UTF8', function() {

  var PORT = 1421;
  var server;

  // Start up our own nats-server
  before(function(done) {
    server = nsc.start_server(PORT, done);
  });

  // Shutdown our server
  after(function() {
    server.kill();
  });

  it('should do publish and subscribe with UTF8 payloads', function(done) {
    var nc = NATS.connect(PORT);
    var data = '\u00bd + \u00bc = \u00be';
    data.length.should.equal(9);

    Buffer.byteLength(data).should.equal(12);
    nc.subscribe('utf8', function(msg) {
      msg.should.equal(data);
      done();
    });

    nc.publish('utf8', data);
  });

});