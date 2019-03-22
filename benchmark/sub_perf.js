/*
 * Copyright 2013-2019 The NATS Authors
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

"use strict";

const fs = require('fs');
const NATS = require('../lib/nats');
const nats = NATS.connect();

///////////////////////////////////////
// Subscribe Performance
///////////////////////////////////////

let start;
const loop = 1000000;
const hash = 2500;
let received = 0;

console.log('Subscribe Performance Test');
console.log("Waiting on %d messages", loop);

nats.subscribe('test', function() {
    received += 1;
    if (received === 1) {
        start = new Date();
    }
    if (received === loop) {
        const stop = new Date();
        console.log('\nDone test');
        const mps = parseInt(loop / ((stop - start) / 1000), 10);
        console.log('Received at ' + mps + ' msgs/sec');
        log("sub", loop, stop - start);
    } else if (received % hash === 0) {
        process.stdout.write('+');
    }

    function log(op, count, time) {
        fs.appendFile('sub.csv', [op, count, time, new Date().toDateString(), NATS.version].join(",") + "\n", function(err) {
            if (err) {
                console.log(err);
            }
            process.exit();
        });
    }
});
