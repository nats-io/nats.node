var NATS = require ('../'),
    nsc = require('./support/nats_server_control'),
    should = require('should');

var PORT1 = 2421;
var PORT2 = 2422;
var uri1 = 'nats://localhost:' + PORT1;
var uri2 = 'nats://localhost:' + PORT2;

describe('Cluster support', function() {

  var server1, server2;

  // Start up our own nats-server
  before(function(done) {
    server1 = nsc.start_server(PORT1, function() {
      server2 = nsc.start_server(PORT2, done);
    });
  });

  // Shutdown our server after we are done
  after(function() {
    if (server1) {
      server1.kill();
    }
    server2.kill();
  });

  it('should perform basic connect with several servers', function(){
    var options = { uri: [ uri1, uri2 ] };
    var nc = NATS.connect(options);
    should.exist(nc);
    nc.close();
  });

  it('should succesfully reconnect to new server in the cluster', function(done) {
    var options = { uri: [ uri1, uri2 ], reconnectTimeWait: 50 };

    var nc = NATS.connect(options);

    nc.flush(function() {
      server1.kill();
      server1 = null;
    });

    nc.on('reconnect', function() {
      nc.close();
      done();
    });
  });
});
