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
const NATS = require('../lib/nats'),
    nsc = require('../test/support/nats_server_control');


///////////////////////////////////////
// Reconnect Performance
///////////////////////////////////////

const loop = 1000000;
const hash = 2500;
const PORT = 1426;
let server;
let start;

console.log('Reconnect Performance Test');

server = nsc.start_server(PORT, function() {
    const nc = NATS.connect({
        'port': PORT
    });
    nc.on('connect', function() {
        const fun = function () {
            //do nothing
        };
        for (let i = 0; i < loop; i++) {
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
            const stop = new Date();
            const t = stop - start;
            console.log('\nReconnected in ' + t + ' ms');
            nc.close();
            server.kill();
            log("reconnect", loop, stop - start);
        });
    });

    function log(op, count, time) {
        fs.appendFile('reconnect.csv', [op, count, time, new Date().toDateString(), NATS.version].join(",") + "\n", function(err) {
            if (err) {
                console.log(err);
            }
            process.exit();
        });
    }
});
