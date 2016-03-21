
var nats = require('../lib/nats'),
    nsc = require('../test/support/nats_server_control');


///////////////////////////////////////
// Reconnect Performance
///////////////////////////////////////

var loop = 2000000;
var hash = 2500;
var PORT = 1426;
var server;
var start;

console.log('Reconnect Performance Test');

server = nsc.start_server(PORT, function() {
  var nc = nats.connect({'port':PORT});
  nc.on('connect', function() {
    var fun = function() { };
    for (var i=0; i<loop; i++) {
      nc.subscribe('test' + i, fun);
      if (i % hash === 0) {
        process.stdout.write('+');
      }
    }
    server.kill();
    server = nsc.start_server(PORT);
  });
  nc.on('reconnecting', function() {
    start = new Date();
  });
  nc.on('reconnect', function() {
    nc.flush(function() {
      var stop = new Date();
      var t = stop - start;
      console.log('\nReconnected in ' + t + ' ms');
      nc.close();
      server.kill();
      process.exit();
    });
  });
});
