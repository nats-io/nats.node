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
    should = require('should');

describe('Double SUBS', function() {

    var PORT = 1922;
    var flags = ['-DV'];
    var server;

    // Start up our own nats-server
    before(function(done) {
        server = nsc.start_server(PORT, flags, done);
    });

    // Shutdown our server after we are done
    after(function(done) {
        nsc.stop_server(server, done);
    });

    it('should not send multiple subscriptions on startup', function(done) {
        var subsSeen = 0;
        var subRe = /(\[SUB foo \d\])+/g;

        // Capture log output from nats-server and check for double SUB protos.
        server.stderr.on('data', function(data) {
            var m;
            while ((m = subRe.exec(data)) !== null) {
                subsSeen++;
            }
        });

        var nc = NATS.connect(PORT);
        nc.subscribe('foo');
        nc.on('connect', function(nc) {
            setTimeout(function() {
                nc.close();
                subsSeen.should.equal(1);
                done();
            }, 100);
        });
    });

});
