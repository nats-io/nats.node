var NATS = require ('../'),
    nsc = require('./support/nats_server_control'),
    should = require('should');

var PORT = 1421;
var uri = 'nats://localhost:' + PORT;

describe('Basic Connectivity', function() {

  var server;

  // Start up our own nats-server
  before(function(done) {
    server = nsc.start_server(PORT, done);
  });

  // Shutdown our server after we are done
  after(function(){
    server.kill();
  });


  it('should perform basic connect with port', function(){
    var nc = NATS.connect(PORT);
    should.exist(nc);
    nc.close();
  });

  it('should perform basic connect with uri', function(){
    var nc = NATS.connect(uri);
    should.exist(nc);
    nc.close();
  });

  it('should perform basic connect with options arg', function(){
    var options = { 'uri' : uri };
    var nc = NATS.connect(options);
    should.exist(nc);
    nc.close();
  });

  it('should emit a connect event', function(done){
    var nc = NATS.connect(PORT);
    nc.on('connect', function(client) {
      client.should.equal(nc);
      nc.close();
      done();
    });
  });

  it('should emit error if no server available', function(done){
    var nc = NATS.connect('nats://localhost:22222');
    nc.on('error', function() {
      nc.close();
      done();
    });
  });

});
