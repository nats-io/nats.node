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

/* jslint node: true */
/* global describe: false, before: false, after: false, it: false */
'use strict';

const NATS = require('../'),
    nsc = require('./support/nats_server_control'),
    should = require('should');

describe('Authorization', function() {

    const PORT = 1421;
    const flags = ['--user', 'derek', '--pass', 'foobar'];
    const authUrl = 'nats://derek:foobar@localhost:' + PORT;
    const noAuthUrl = 'nats://localhost:' + PORT;
    let server;

    // Start up our own nats-server
    before(function(done) {
        server = nsc.start_server(PORT, flags, done);
    });

    // Shutdown our server after we are done
    after(function(done) {
        nsc.stop_server(server, done);
    });

    it('should fail to connect with no credentials ', function(done) {
        const nc = NATS.connect(PORT);
        nc.on('error', function(err) {
            should.exist(err);
            should.exist((/Authorization/).exec(err));
            nc.close();
            done();
        });
    });

    it('should connect with proper credentials in url', function(done) {
        const nc = NATS.connect(authUrl);
        nc.on('connect', function(nc) {
            setTimeout(function() {
                nc.close();
                done();
            }, 100);
        });
    });

    it('should connect with proper credentials as options', function(done) {
        const nc = NATS.connect({
            'url': noAuthUrl,
            'user': 'derek',
            'pass': 'foobar'
        });
        nc.on('connect', function(nc) {
            setTimeout(function() {
                nc.close();
                done();
            }, 100);
        });
    });

    it('should connect with proper credentials as server url', function(done) {
        const nc = NATS.connect({
            'servers': [authUrl]
        });
        nc.on('connect', function(nc) {
            nc.close();
            setTimeout(done, 100);
        });
    });

});

describe('Token Authorization', function() {

    const PORT = 1421;
    const flags = ['--auth', 'token1'];
    const authUrl = 'nats://token1@localhost:' + PORT;
    const noAuthUrl = 'nats://localhost:' + PORT;
    let server;

    // Start up our own nats-server
    before(function(done) {
        server = nsc.start_server(PORT, flags, done);
    });

    // Shutdown our server after we are done
    after(function(done) {
        server = nsc.stop_server(server, done);
    });

    it('should fail to connect with no credentials ', function(done) {
        const nc = NATS.connect(PORT);
        nc.on('error', function(err) {
            should.exist(err);
            should.exist((/Authorization/).exec(err));
            nc.close();
            done();
        });
    });

    it('should connect with proper credentials in url', function(done) {
        const nc = NATS.connect(authUrl);
        nc.on('connect', function(nc) {
            setTimeout(function() {
                nc.close();
                done();
            }, 100);
        });
    });

    it('should connect with proper credentials as options', function(done) {
        const nc = NATS.connect({
            'url': noAuthUrl,
            'token': 'token1'
        });
        nc.on('connect', function(nc) {
            setTimeout(function() {
                nc.close();
                done();
            }, 100);
        });
    });

    it('should connect with proper credentials as server url', function(done) {
        const nc = NATS.connect({
            'servers': [authUrl]
        });
        nc.on('connect', function(nc) {
            nc.close();
            setTimeout(done, 100);
        });
    });
});
