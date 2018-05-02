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

describe('Reconnect functionality', function() {

    var PORT = 1426;
    var WAIT = 20;
    var ATTEMPTS = 4;
    var server;

    // Start up our own nats-server
    before(function(done) {
        server = nsc.start_server(PORT, done);
    });

    // Shutdown our server after we are done
    after(function(done) {
        nsc.stop_server(server, done);
    });

    it('should not emit a reconnecting event if suppressed', function(done) {
        var nc = NATS.connect({
            'port': PORT,
            'reconnect': false
        });
        should.exist(nc);
        nc.on('connect', function() {
            nsc.stop_server(server);
        });
        nc.on('reconnecting', function(client) {
            done(new Error('Reconnecting improperly called'));
        });
        nc.on('close', function() {
            nc.close();
            server = nsc.start_server(PORT, done);
        });
    });

    it('should emit a disconnect and a reconnecting event after proper delay', function(done) {
        var nc = NATS.connect({
            'port': PORT,
            'reconnectTimeWait': WAIT
        });
        var startTime;
        should.exist(nc);
        nc.on('connect', function() {
            nsc.stop_server(server, function(){
                startTime = new Date();
            });
        });
        nc.on('reconnecting', function(client) {
            var elapsed = new Date() - startTime;
            elapsed.should.be.within(WAIT, 5 * WAIT);
            nc.close();
            server = nsc.start_server(PORT, done);
        });
        nc.on('disconnect', function() {
            var elapsed = new Date() - startTime;
            elapsed.should.be.within(0, 5 * WAIT);
        });
    });

    it('should emit multiple reconnecting events and fail after maxReconnectAttempts', function(done) {
        var nc = NATS.connect({
            'port': PORT,
            'reconnectTimeWait': WAIT,
            'maxReconnectAttempts': ATTEMPTS
        });
        var startTime;
        var numAttempts = 0;
        nc.on('connect', function() {
            nsc.stop_server(server, function(){
                startTime = new Date();
            });
        });
        nc.on('reconnecting', function(client) {
            var elapsed = new Date() - startTime;
            elapsed.should.be.within(WAIT, 5 * WAIT);
            startTime = new Date();
            numAttempts += 1;
        });
        nc.on('close', function() {
            numAttempts.should.equal(ATTEMPTS);
            nc.close();
            server = nsc.start_server(PORT, done);
        });
    });

    it('should emit reconnecting events indefinitely if maxReconnectAttempts is set to -1', function(done) {

        var nc = NATS.connect({
            'port': PORT,
            'reconnectTimeWait': WAIT,
            'maxReconnectAttempts': -1
        });
        var numAttempts = 0;

        // stop trying after an arbitrary amount of elapsed time
        var timeout = setTimeout(function() {
            // restart server and make sure next flush works ok
            if (server === null) {
                server = nsc.start_server(PORT);
            }
        }, 1000);

        nc.on('connect', function() {
            nsc.stop_server(server, function(){
                server = null;
            });
        });
        nc.on('reconnecting', function(client) {
            numAttempts += 1;
            // attempt indefinitely to reconnect
            nc.reconnects.should.equal(numAttempts);
            nc.connected.should.equal(false);
            nc.wasConnected.should.equal(true);
            nc.reconnecting.should.equal(true);
            // if maxReconnectAttempts is set to -1, the number of reconnects will always be greater
            nc.reconnects.should.be.above(nc.options.maxReconnectAttempts);
        });
        nc.on('reconnect', function() {
            nc.flush(function() {
                nc.close();
                done();
            });
        });
    });

    it('should succesfully reconnect to new server', function(done) {
        var nc = NATS.connect({
            'port': PORT,
            'reconnectTimeWait': 100
        });
        // Kill server after first successful contact
        nc.flush(function() {
            nsc.stop_server(server, function(){
                server = null;
            });
        });
        nc.on('reconnecting', function(client) {
            // restart server and make sure next flush works ok
            if (server === null) {
                server = nsc.start_server(PORT);
            }
        });
        nc.on('reconnect', function() {
            nc.flush(function() {
                nc.close();
                done();
            });
        });
    });

    it('should succesfully reconnect to new server with subscriptions', function(done) {
        var nc = NATS.connect({
            'port': PORT,
            'reconnectTimeWait': 100
        });
        // Kill server after first successful contact
        nc.flush(function() {
            nsc.stop_server(server, function(){
                server = null;
            });
        });
        nc.subscribe('foo', function() {
            nc.close();
            done();
        });
        nc.on('reconnecting', function(client) {
            // restart server and make sure next flush works ok
            if (server === null) {
                server = nsc.start_server(PORT);
            }
        });
        nc.on('reconnect', function() {
            nc.publish('foo');
        });
    });

    it('should succesfully reconnect to new server with queue subscriptions correctly', function(done) {
        var nc = NATS.connect({
            'port': PORT,
            'reconnectTimeWait': 100
        });
        // Kill server after first successful contact
        nc.flush(function() {
            nsc.stop_server(server, function(){
                server = null;
            });
        });
        var received = 0;
        // Multiple subscribers
        var cb = function() {
            received += 1;
        };
        for (var i = 0; i < 5; i++) {
            nc.subscribe('foo', {
                'queue': 'myReconnectQueue'
            }, cb);
        }
        nc.on('reconnecting', function(client) {
            // restart server and make sure next flush works ok
            if (server === null) {
                server = nsc.start_server(PORT);
            }
        });
        nc.on('reconnect', function() {
            nc.publish('foo', function() {
                received.should.equal(1);
                nc.close();
                done();
            });
        });
    });

    it('should properly resync with inbound buffer non-nil', function(done) {
        var nc = NATS.connect({
            'port': PORT,
            'reconnectTimeWait': 100
        });

        // Send lots of data to ourselves
        nc.on('connect', function() {
            var sid = nc.subscribe('foo', function() {
                // Kill server on first message, inbound should still be full.
                nsc.stop_server(server, function(){
                    nc.unsubscribe(sid);
                    server = nsc.start_server(PORT);
                });
            });
            var b = Buffer.alloc(4096).toString();
            for (var i = 0; i < 1000; i++) {
                nc.publish('foo', b);
            }
        });

        nc.on('reconnect', function() {
            nc.flush(function() {
                nc.close();
                done();
            });
        });
    });

    it('should not crash when sending a publish with a callback after connection loss', function(done) {
        var nc = NATS.connect({
            'port': PORT,
            'reconnectTimeWait': WAIT
        });
        var startTime;
        should.exist(nc);
        nc.on('connect', function() {
            nsc.stop_server(server, function(){
                startTime = new Date();
            });
        });
        nc.on('disconnect', function() {
            nc.publish('foo', 'bar', 'reply', function() {
                // fails to get here, but should not crash
            });
            server = nsc.start_server(PORT);
        });
        nc.on('reconnect', function() {
            nc.flush(function() {
                nc.close();
                done();
            });
        });
    });

    it('should execute callbacks if published during reconnect', function(done) {
        var nc = NATS.connect({
            'port': PORT,
            'reconnectTimeWait': 100
        });
        nc.on('reconnecting', function(client) {
            // restart server
            if (server === null) {
                nc.publish('foo', function() {
                    nc.close();
                    done();
                });
                server = nsc.start_server(PORT);
            }
        });
        nc.on('connect', function() {
            var s = server;
            server = null;
            nsc.stop_server(s);
        });
    });

    it('should not lose messages if published during reconnect', function(done) {
        // This checks two things if the client publishes while reconnecting:
        // 1) the message is published when the client reconnects
        // 2) the client's subscriptions are synced before the message is published
        var nc = NATS.connect({
            'port': PORT,
            'reconnectTimeWait': 100
        });
        nc.subscribe('foo', function() {
            nc.close();
            done();
        });
        nc.on('reconnecting', function(client) {
            // restart server
            if (server === null) {
                nc.publish('foo');
                server = nsc.start_server(PORT);
            }
        });
        nc.on('connect', function() {
            var s = server;
            server = null;
            nsc.stop_server(s);
        });
    });

    it('should emit reconnect before flush callbacks are called', function(done) {
        var nc = NATS.connect({
            'port': PORT,
            'reconnectTimeWait': 100
        });
        var reconnected = false;
        nc.on('reconnecting', function() {
            // restart server
            if (server === null) {
                nc.flush(function() {
                    nc.close();
                    if (!reconnected) {
                        done(new Error('Flush callback called before reconnect emitted'));
                    }
                    done();
                });
                server = nsc.start_server(PORT);
            }
        });
        nc.on('reconnect', function() {
            reconnected = true;
        });
        nc.on('connect', function() {
            var s = server;
            server = null;
            nsc.stop_server(s);
        });
    });
});
