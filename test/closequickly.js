/*
 * Copyright 2013-2018 The NATS Authors
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

/* jslint node: true */
/* global describe: false, before: false, after: false, it: false */
'use strict';

var NATS = require('../'),
    nsc = require('./support/nats_server_control'),
    child_process = require('child_process'),
    should = require('should');

describe('Close functionality', function() {

    var PORT = 8459;
    var server;

    // Start up our own nats-server
    before(function(done) {
        server = nsc.start_server(PORT, done);
    });

    // Shutdown our server after we are done
    after(function(done) {
        nsc.stop_server(server, done);
    });

    it('close quickly', function(done) {
        var nc = NATS.connect({
            port: PORT
        });


        var timer;

        nc.flush(function() {
           nc.subscribe("started", function(m) {
               nc.publish("close");
           });
            timer = setTimeout(function() {
                done(new Error("process didn't exit quickly"));
            }, 10000);
        });

        var child = child_process.execFile('node', ['./test/support/exiting_client.js', PORT], function(error) {
            if(error) {
                nc.close();
                done(error);
            }
        });

        child.on('exit', function(code, signal) {
            if(timer) {
                clearTimeout(timer);
                timer = null;
            }
            nc.close();
            if(code !== 0) {
                done("Process didn't return a zero code: [" + code + "]", signal);
            } else {
                done();
            }
        });
    });
});
