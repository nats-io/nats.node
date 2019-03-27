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

describe('Reconnect functionality', () => {

    const PORT = 1426;
    const WAIT = 20;
    const ATTEMPTS = 4;
    let server;

    // Start up our own nats-server
    beforeEach((done) => {
        server = nsc.start_server(PORT, done);
    });

    // Shutdown our server after we are done
    afterEach((done) => {
        nsc.stop_server(server, done);
    });

    it('should not emit a reconnecting event if suppressed', (done) => {
        const nc = NATS.connect({
            'port': PORT,
            'reconnect': false
        });
        should.exist(nc);
        nc.on('connect', () => {
            nsc.stop_server(server);
        });
        nc.on('reconnecting', (client) => {
            done(new Error('Reconnecting improperly called'));
        });
        nc.on('close', () => {
            nc.close();
            done();
        });
    });

    it('should emit a disconnect and a reconnecting event after proper delay', (done) => {
        const nc = NATS.connect({
            'port': PORT,
            'reconnectTimeWait': WAIT
        });
        let startTime;
        should.exist(nc);
        nc.on('connect', () => {
            nsc.stop_server(server, () => {
                startTime = new Date();
            });
        });
        nc.on('reconnecting', (client) => {
            const elapsed = new Date() - startTime;
            elapsed.should.be.within(WAIT, 5 * WAIT);
            nc.close();
            done();
        });
        nc.on('disconnect', () => {
            const elapsed = new Date() - startTime;
            elapsed.should.be.within(0, 5 * WAIT);
        });
    });


    it('disconnect should only fire if connection disconnected', (done) => {
        const nc = NATS.connect({
            'port': PORT,
            'reconnectTimeWait': 100,
            'maxReconnectAttempts': 5
        });

        nc.on('connect', () => {
           server.kill();
        });

        let reconnecting = 0;
        nc.on('reconnecting', () => {
            reconnecting++;
            if(reconnecting === 1) {
                server = nsc.start_server(PORT);
            }
        });

        let reconnect = 0;
        nc.on('reconnect', () => {
            reconnect++;
            server.kill();
        });

        let disconnects = 0;
        nc.on('disconnect', () => {
            disconnects++;
        });

        nc.on('close', () => {
            disconnects.should.be.equal(2);
            done();
        });
    }).timeout(10000);

    it('should emit multiple reconnecting events and fail after maxReconnectAttempts', (done) => {
        const nc = NATS.connect({
            'port': PORT,
            'reconnectTimeWait': WAIT,
            'maxReconnectAttempts': ATTEMPTS
        });
        let startTime;
        let numAttempts = 0;
        nc.on('connect', () => {
            nsc.stop_server(server, () => {
                startTime = new Date();
            });
        });
        nc.on('reconnecting', (client) => {
            const elapsed = new Date() - startTime;
            elapsed.should.be.within(WAIT, 5 * WAIT);
            startTime = new Date();
            numAttempts += 1;
        });
        nc.on('close', () => {
            numAttempts.should.equal(ATTEMPTS);
            nc.close();
            done();
        });
    });

    it('should emit reconnecting events indefinitely if maxReconnectAttempts is set to -1', (done) => {

        const nc = NATS.connect({
            'port': PORT,
            'reconnectTimeWait': WAIT,
            'maxReconnectAttempts': -1
        });
        let numAttempts = 0;

        // stop trying after an arbitrary amount of elapsed time
        const timeout = setTimeout(() => {
            // restart server and make sure next flush works ok
            if (server === null) {
                server = nsc.start_server(PORT);
            }
        }, 1000);

        nc.on('connect', () => {
            nsc.stop_server(server, () => {
                server = null;
            });
        });
        nc.on('reconnecting', (client) => {
            numAttempts += 1;
            // attempt indefinitely to reconnect
            nc.reconnects.should.equal(numAttempts);
            nc.connected.should.equal(false);
            nc.wasConnected.should.equal(true);
            nc.reconnecting.should.equal(true);
            // if maxReconnectAttempts is set to -1, the number of reconnects will always be greater
            nc.reconnects.should.be.above(nc.options.maxReconnectAttempts);
        });
        nc.on('reconnect', () => {
            nc.flush(() => {
                nc.close();
                done();
            });
        });
    });

    it('should succesfully reconnect to new server', (done) => {
        const nc = NATS.connect({
            'port': PORT,
            'reconnectTimeWait': 100
        });
        // Kill server after first successful contact
        nc.flush(() => {
            nsc.stop_server(server, () => {
                server = null;
            });
        });
        nc.on('reconnecting', (client) => {
            // restart server and make sure next flush works ok
            if (server === null) {
                server = nsc.start_server(PORT);
            }
        });
        nc.on('reconnect', () => {
            nc.flush(() => {
                nc.close();
                done();
            });
        });
    });

    it('should succesfully reconnect to new server with subscriptions', (done) => {
        const nc = NATS.connect({
            'port': PORT,
            'reconnectTimeWait': 100
        });
        // Kill server after first successful contact
        nc.flush(() => {
            nsc.stop_server(server, () => {
                server = null;
            });
        });
        nc.subscribe('foo', () => {
            nc.close();
            done();
        });
        nc.on('reconnecting', (client) => {
            // restart server and make sure next flush works ok
            if (server === null) {
                server = nsc.start_server(PORT);
            }
        });
        nc.on('reconnect', () => {
            nc.publish('foo');
        });
    });

    it('should succesfully reconnect to new server with queue subscriptions correctly', (done) => {
        const nc = NATS.connect({
            'port': PORT,
            'reconnectTimeWait': 100
        });
        // Kill server after first successful contact
        nc.flush(() => {
            nsc.stop_server(server, () => {
                server = null;
            });
        });
        let received = 0;
        // Multiple subscribers
        const cb = () => {
            received += 1;
        };
        for (let i = 0; i < 5; i++) {
            nc.subscribe('foo', {
                'queue': 'myReconnectQueue'
            }, cb);
        }
        nc.on('reconnecting', (client) => {
            // restart server and make sure next flush works ok
            if (server === null) {
                server = nsc.start_server(PORT);
            }
        });
        nc.on('reconnect', () => {
            nc.publish('foo', () => {
                received.should.equal(1);
                nc.close();
                done();
            });
        });
    });

    it('should properly resync with inbound buffer non-nil', (done) => {
        const nc = NATS.connect({
            'port': PORT,
            'reconnectTimeWait': 100
        });

        // Send lots of data to ourselves
        nc.on('connect', () => {
            const sid = nc.subscribe('foo', () => {
                // Kill server on first message, inbound should still be full.
                nsc.stop_server(server, () => {
                    nc.unsubscribe(sid);
                    server = nsc.start_server(PORT);
                });
            });
            const b = Buffer.alloc(4096).toString();
            for (let i = 0; i < 1000; i++) {
                nc.publish('foo', b);
            }
        });

        nc.on('reconnect', () => {
            nc.flush(() => {
                nc.close();
                done();
            });
        });
    });

    it('should not crash when sending a publish with a callback after connection loss', (done) => {
        const nc = NATS.connect({
            'port': PORT,
            'reconnectTimeWait': WAIT
        });
        let startTime;
        should.exist(nc);
        nc.on('connect', () => {
            nsc.stop_server(server, () => {
                startTime = new Date();
            });
        });
        nc.on('disconnect', () => {
            nc.publish('foo', 'bar', 'reply', () => {
                // fails to get here, but should not crash
            });
            server = nsc.start_server(PORT);
        });
        nc.on('reconnect', () => {
            nc.flush(() => {
                nc.close();
                done();
            });
        });
    });

    it('should execute callbacks if published during reconnect', (done) => {
        const nc = NATS.connect({
            'port': PORT,
            'reconnectTimeWait': 100
        });
        nc.on('reconnecting', (client) => {
            // restart server
            if (server === null) {
                nc.publish('foo', () => {
                    nc.close();
                    done();
                });
                server = nsc.start_server(PORT);
            }
        });
        nc.on('connect', () => {
            const s = server;
            server = null;
            nsc.stop_server(s);
        });
    });

    it('should not lose messages if published during reconnect', (done) => {
        // This checks two things if the client publishes while reconnecting:
        // 1) the message is published when the client reconnects
        // 2) the client's subscriptions are synced before the message is published
        const nc = NATS.connect({
            'port': PORT,
            'reconnectTimeWait': 100
        });
        nc.subscribe('foo', () => {
            nc.close();
            done();
        });
        nc.on('reconnecting', (client) => {
            // restart server
            if (server === null) {
                nc.publish('foo');
                server = nsc.start_server(PORT);
            }
        });
        nc.on('connect', () => {
            const s = server;
            server = null;
            nsc.stop_server(s);
        });
    });

    it('should emit reconnect before flush callbacks are called', (done) => {
        const nc = NATS.connect({
            'port': PORT,
            'reconnectTimeWait': 100
        });
        let reconnected = false;
        nc.on('reconnecting', () => {
            // restart server
            if (server === null) {
                nc.flush(() => {
                    nc.close();
                    if (!reconnected) {
                        done(new Error('Flush callback called before reconnect emitted'));
                    }
                    done();
                });
                server = nsc.start_server(PORT);
            }
        });
        nc.on('reconnect', () => {
            reconnected = true;
        });
        nc.on('connect', () => {
            const s = server;
            server = null;
            nsc.stop_server(s);
        });
    });
});
