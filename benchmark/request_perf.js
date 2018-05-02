"use strict";
var fs = require('fs');
var NATS = require('../lib/nats');
var nc1 = NATS.connect();
var nc2 = NATS.connect();

///////////////////////////////////////
// Request Performance
///////////////////////////////////////

var loop = 100000;
var hash = 1000;
var received = 0;

console.log('Request Performance Test');

nc1.on('connect', function() {

    var start = new Date();

    nc1.subscribe('request.test', function(msg, reply) {
        nc1.publish(reply, 'ok');
    });

    // Need to flush here since using separate connections.
    nc1.flush(function() {

        for (var i = 0; i < loop; i++) {
            nc2.request('request.test', 'help', {
                'max': 1
            }, function() {
                received += 1;
                if (received === loop) {
                    var stop = new Date();
                    var rps = parseInt(loop / ((stop - start) / 1000), 10);
                    console.log('\n' + rps + ' request-responses/sec');
                    var latmicros = ((stop - start) * 1000) / (loop * 2);
                    var lat = parseInt(latmicros, 10); // Request=2, Reponse=2 RTs
                    console.log('Avg roundtrip latency: ' + lat + ' microseconds');
                    log("rr", loop, stop-start, latmicros);
                } else if (received % hash === 0) {
                    process.stdout.write('+');
                }
            });
        }
    });

  function log(op, count, time, latmicros) {
    fs.appendFile('rr.csv', [op, count, time, new Date().toDateString(), NATS.version, latmicros].join(",") + "\n", function(err) {
      if(err) {
        console.log(err);
      }
      process.exit();
    });
  }

});
