var NATS = require ('../'),
    nsc = require('./support/nats_server_control');

var PORT = 1422;
var flags = ['--user', 'derek', '--pass', 'foobar'];
var authUrl = 'nats://derek:foobar@localhost:' + PORT;
var noAuthUrl = 'nats://localhost:' + PORT;

describe('Authorization', function() {

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
    nc.on('connect', function(nc) {
      setTimeout(done, 100);
    });
  });

  it('should connect with proper credentials as options', function(done) {
    var nc = NATS.connect({'url':noAuthUrl, 'user':'derek', 'pass':'foobar'});
    nc.on('connect', function(nc) {
      setTimeout(done, 100);
    });
  });

});