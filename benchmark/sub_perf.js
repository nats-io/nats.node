
var nats = require('../lib/nats').connect();

///////////////////////////////////////
// Subscribe Performance
///////////////////////////////////////

var start;
var loop = 500000;
var hash = 2500;
var received = 0;

console.log('Subscribe Performance Test');
console.log("Waiting on %d messages", loop);

nats.subscribe('test', function() {
  received += 1;
  if (received === 1) { start = new Date(); }
  if (received === loop) {
    var stop = new Date();
    console.log('\nDone test');
    var mps = parseInt(loop/((stop-start)/1000));
    console.log('Received at ' + mps + ' msgs/sec');
    process.exit();
  } else if (received % hash === 0) {
    process.stdout.write('+');
  }

});

