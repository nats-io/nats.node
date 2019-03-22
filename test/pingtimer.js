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

/* eslint-env node, es6 */
/* global describe: false, before: false, after: false, it: false */
/* jshint -W030 */

'use strict';

const NATS = require('../'),
    mockserver = require('./support/mock_server'),
    should = require('should');

describe('Ping Timer', function() {
    this.timeout(10000);
    const PORT = 1966;
    let server;

    before(function(done) {
        // default server simply sends connect and responds to one ping
        server = new mockserver.ScriptedServer(PORT);
        server.on('listening', done);
        server.start();
    });

    after(function(done) {
        server.stop(done);
    });

    it('should reconnect if server doesnt ping', function(done) {
        const nc = NATS.connect({
            port: PORT,
            pingInterval: 200,
            maxReconnectAttempts: 1
        });
        nc.on('reconnect', () => {
            nc.close();
            done();
        });
    });

    it('timer pings are sent', function(done) {
        const nc = NATS.connect({
            port: PORT,
            pingInterval: 200,
            maxPingOut: 5,
            maxReconnectAttempts: 1
        });

        let pingTimerFired = false;
        nc.on('pingtimer', () => {
            pingTimerFired = true;
        });

        nc.on('reconnect', () => {
            nc.close();
            should(pingTimerFired).be.true();
            done();
        });
    });


    it('configured number of missed pings is honored', function(done) {
        const nc = NATS.connect({
            port: PORT,
            pingInterval: 200,
            maxPingOut: 5,
            maxReconnectAttempts: 1
        });

        let maxOut = 0;
        nc.on('pingcount', (c) => {
            maxOut = Math.max(maxOut, c);
        });

        nc.on('reconnect', () => {
            should(maxOut).be.equal(5);
            nc.close();
            done();
        });
    });
});
