
var nc1 = require('../lib/nats').connect();
var nc2 = require('../lib/nats').connect();

///////////////////////////////////////
// Request Performance
///////////////////////////////////////

var start;
var loop = 100000;
var hash = 1000;
var received = 0;

console.log('Request Performance Test');

nc1.on('connect', function(){

  var start = new Date();

  nc1.subscribe('request.test', function(msg, reply) {
    nc1.publish(reply, 'ok');
  });

  // Need to flush here since using separate connections.
  nc1.flush(function() {

    for (var i=0; i<loop; i++) {
      nc2.request('request.test', 'help', {'max':1}, function() {
	received += 1;
	if (received === loop) {
	  var stop = new Date();
	  var rps = parseInt(loop/((stop-start)/1000));
	  console.log('\n' + rps + ' request-responses/sec');
	  var lat = parseInt(((stop-start)*1000)/(loop*2)); // Request=2, Reponse=2 RTs
	  console.log('Avg roundtrip latency: ' + lat + ' microseconds');
	  process.exit();
	} else if (received % hash === 0) {
	  process.stdout.write('+');
	}
      });
    }

  });

});
