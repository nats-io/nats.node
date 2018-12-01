"use strict";

var NATS = require('../lib/nats');
var nats = NATS.connect();
var fs = require('fs');

///////////////////////////////////////
// Publish Performance
///////////////////////////////////////

var loop = 1000000;
var hash = 2500;

console.log('Publish Performance Test');

nats.on('connect', function() {

    var start = new Date();

    var invalid2octet = Buffer.from('\xc3\x28', 'binary');

    for (var i = 0; i < loop; i++) {
        nats.publish('test', invalid2octet);
        //nats.publish('test', 'ok');
        if (i % hash === 0) {
            process.stdout.write('+');
        }
    }

    nats.flush(function() {
        var stop = new Date();
        var mps = parseInt(loop / ((stop - start) / 1000), 10);
        log("pub", loop, stop - start);
        console.log('\nPublished at ' + mps + ' msgs/sec');
    });

    function log(op, count, time) {
        if (process.argv.length === 2) {
            fs.appendFile('pub.csv', [op, count, time, new Date().toDateString(), NATS.version].join(",") + "\n", function(err) {
                if (err) {
                    console.log(err);
                }
                process.exit();
            });
        } else {
            // running for sub test, don't record
            process.exit();
        }
    }


});
