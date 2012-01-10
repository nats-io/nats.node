
var nats = require('nats').connect();

///////////////////////////////////////
// Publish Performance
///////////////////////////////////////

var loop = 100000;
var hash = 2500;

console.log('Publish Performance Test');

nats.on('connect', function() {

  var start = new Date();

  for (var i=0; i<loop; i++) {
    nats.publish('test', 'ok');
    if (i % hash === 0) {
      process.stdout.write('+');
    }
  }

  nats.flush(function() {
    var stop = new Date();
    var mps = parseInt(loop/((stop-start)/1000));
    console.log('\nPublished at ' + mps + ' msgs/sec');
    process.exit();
  });

});
