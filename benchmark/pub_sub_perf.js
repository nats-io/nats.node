
var nc1 = require('../lib/nats').connect();
var nc2 = require('../lib/nats').connect();

///////////////////////////////////////
// Publish/Subscribe Performance
///////////////////////////////////////

var loop = 2000000;
var hash = 2500;

console.log('Publish/Subscribe Performance Test');

nc1.on('connect', function() {

  var received = 0;
  var start = new Date();

  nc1.subscribe('test', function() {
    received += 1;

    if (received === loop) {
      var stop = new Date();
      var mps = parseInt(loop/((stop-start)/1000));
      console.log('\nPublished/Subscribe at ' + mps + ' msgs/sec');
      console.log('Received ' + received + ' messages');
      process.exit();
    }
  });

  // Make sure sub is registered
  nc1.flush(function() {
    for (var i=0; i<loop; i++) {
      nc2.publish('test', 'ok');
      if (i % hash === 0) {
	process.stdout.write('+');
      }
    }
  });

});
