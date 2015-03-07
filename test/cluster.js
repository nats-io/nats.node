var NATS = require ('../'),
    nsc = require('./support/nats_server_control'),
    should = require('should');

var PORT1 = 1421;
var PORT2 = 1422;
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
    nsc.stop_server(server1);
    nsc.stop_server(server2);
  });

  it('should succesfully reconnect a new server in the cluster', function(done) {
    var options = { uri: [ uri1, uri2, uri2 ], reconnectTimeWait: 100 };

    var nc = NATS.connect(options);
    should.exist(nc);

    nc.on('connect', function(client) {
      server1.kill();
      client.servers.shift(); // force reconnect to a valid server

      nc.on('reconnect', function() {
        nc.close();
        done();
      });
    });
  });
});
