"use strict";

var fs = require('fs');
var NATS = require('../lib/nats');
var nats = NATS.connect();

///////////////////////////////////////
// Subscribe Performance
///////////////////////////////////////

var start;
var loop = 1000000;
var hash = 2500;
var received = 0;

console.log('Subscribe Performance Test');
console.log("Waiting on %d messages", loop);

nats.subscribe('test', function () {
  received += 1;
  if (received === 1) {
    start = new Date();
  }
  if (received === loop) {
    var stop = new Date();
    console.log('\nDone test');
    var mps = parseInt(loop / ((stop - start) / 1000), 10);
    console.log('Received at ' + mps + ' msgs/sec');
    log("sub", loop, stop-start);
  } else if (received % hash === 0) {
    process.stdout.write('+');
  }

  function log(op, count, time) {
      fs.appendFile('sub.csv', [op, count, time, new Date().toDateString(), NATS.version].join(",") + "\n", function (err) {
        if (err) {
          console.log(err);
        }
        process.exit();
      });
  }
});
