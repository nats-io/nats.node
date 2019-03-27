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
/* jshint -W030 */
'use strict';

const NATS = require('../'),
    nsc = require('./support/nats_server_control'),
    should = require('should'),
    url = require('url');

describe('Cluster', function() {

    const WAIT = 20;
    const ATTEMPTS = 4;

    const PORT1 = 15621;
    const PORT2 = 15622;

    const s1Url = 'nats://localhost:' + PORT1;
    const s2Url = 'nats://localhost:' + PORT2;

    let s1;
    let s2;

    // Start up our own nats-server
    before(function(done) {
        s1 = nsc.start_server(PORT1, function() {
            s2 = nsc.start_server(PORT2, function() {
                done();
            });
        });
    });

    // Shutdown our server
    after(function(done) {
        nsc.stop_cluster([s1, s2], done);
    });

    it('should accept servers options', function(done) {
        const nc = NATS.connect({
            'servers': [s1Url, s2Url]
        });
        should.exists(nc);
        nc.should.have.property('options');
        nc.options.should.have.property('servers');
        nc.should.have.property('servers');
        nc.servers.should.be.a.Array;
        nc.should.have.property('url');
        nc.flush(function() {
            nc.close();
            done();
        });
    });

    it('should randomly connect to servers by default', function(done) {
        const conns = [];
        let s1Count = 0;
        for (var i = 0; i < 100; i++) {
            const nc = NATS.connect({
                'servers': [s1Url, s2Url]
            });
            conns.push(nc);
            const nurl = url.format(nc.url);
            if (nurl === s1Url) {
                s1Count++;
            }
        }
        for (i = 0; i < 100; i++) {
            conns[i].close();
        }
        s1Count.should.be.within(35, 65);
        done();
    });

    it('should connect to first valid server', function(done) {
        const nc = NATS.connect({
            'servers': ['nats://localhost:' + 21022, s1Url, s2Url]
        });
        nc.on('error', function(err) {
            done(err);
        });
        nc.on('connect', function() {
            nc.close();
            done();
        });
    });

    it('should emit error if no servers are available', function(done) {
        const nc = NATS.connect({
            'servers': ['nats://localhost:' + 21022, 'nats://localhost:' + 21023]
        });
        nc.on('error', function(err) {
            nc.close();
            done();
        });
        nc.on('reconnecting', function(err) {
            // This is an error
            done('Should not receive a reconnect event');
        });
    });

    it('should not randomly connect to servers if noRandomize is set', function(done) {
        const conns = [];
        let s1Count = 0;
        for (var i = 0; i < 100; i++) {
            const nc = NATS.connect({
                'noRandomize': true,
                'servers': [s1Url, s2Url]
            });
            conns.push(nc);
            const nurl = url.format(nc.url);
            if (nurl === s1Url) {
                s1Count++;
            }
        }
        for (i = 0; i < 100; i++) {
            conns[i].close();
        }
        s1Count.should.equal(100);
        done();
    });

    it('should not randomly connect to servers if dontRandomize is set', function(done) {
        const conns = [];
        let s1Count = 0;
        for (var i = 0; i < 100; i++) {
            const nc = NATS.connect({
                'dontRandomize': true,
                'servers': [s1Url, s2Url]
            });
            conns.push(nc);
            const nurl = url.format(nc.url);
            if (nurl == s1Url) {
                s1Count++;
            }
        }
        for (i = 0; i < 100; i++) {
            conns[i].close();
        }
        s1Count.should == 100;
        done();
    });

    it('should fail after maxReconnectAttempts when servers killed', function(done) {
        const nc = NATS.connect({
            'noRandomize': true,
            'servers': [s1Url, s2Url],
            'reconnectTimeWait': WAIT,
            'maxReconnectAttempts': ATTEMPTS
        });
        let startTime;
        let numAttempts = 0;
        nc.on('connect', function() {
            nsc.stop_server(s1, function() {
                s1 = null;
                startTime = new Date();
            });
        });
        nc.on('reconnect', function() {
            nsc.stop_server(s2, function() {
                s2 = null;
            });
        });
        nc.on('reconnecting', function(client) {
            const elapsed = new Date() - startTime;
            elapsed.should.be.within(WAIT, 5 * WAIT);
            startTime = new Date();
            numAttempts += 1;
        });
        nc.on('close', function() {
            numAttempts.should.equal(ATTEMPTS);
            nc.close();
            done();
        });
    });

});
