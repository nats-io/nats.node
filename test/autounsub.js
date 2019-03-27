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

describe('Max responses and Auto-unsub', function() {

    const PORT = 1422;
    let server;

    // Start up our own nats-server
    before(function(done) {
        server = nsc.start_server(PORT, done);
    });

    // Shutdown our server after we are done
    after(function(done) {
        nsc.stop_server(server, done);
    });

    it('should only received max responses requested', function(done) {
        const nc = NATS.connect(PORT);
        const WANT = 10;
        const SEND = 20;
        let received = 0;

        nc.subscribe('foo', {
            'max': WANT
        }, function() {
            received += 1;
        });
        for (let i = 0; i < SEND; i++) {
            nc.publish('foo');
        }
        nc.flush(function() {
            should.exists(received);
            received.should.equal(WANT);
            nc.close();
            done();
        });
    });

    it('should only received max responses requested (client support)', function(done) {
        const nc = NATS.connect(PORT);
        const WANT = 10;
        const SEND = 20;
        let received = 0;

        const sid = nc.subscribe('foo', function() {
            received += 1;
        });
        for (let i = 0; i < SEND; i++) {
            nc.publish('foo');
        }
        nc.unsubscribe(sid, WANT);

        nc.flush(function() {
            should.exists(received);
            received.should.equal(WANT);
            nc.close();
            done();
        });
    });

    it('should not complain when unsubscribing an auto-unsubscribed sid', function(done) {
        const nc = NATS.connect(PORT);
        const SEND = 20;
        let received = 0;

        const sid = nc.subscribe('foo', {
            'max': 1
        }, function () {
            received += 1;
        });
        for (let i = 0; i < SEND; i++) {
            nc.publish('foo');
        }

        nc.flush(function() {
            nc.unsubscribe(sid);
            should.exists(received);
            received.should.equal(1);
            nc.close();
            done();
        });
    });

    it('should allow proper override to a lesser value ', function(done) {
        const nc = NATS.connect(PORT);
        const SEND = 20;
        let received = 0;

        const sid = nc.subscribe('foo', function () {
            received += 1;
            nc.unsubscribe(sid, 1);
        });
        nc.unsubscribe(sid, SEND);

        for (let i = 0; i < SEND; i++) {
            nc.publish('foo');
        }

        nc.flush(function() {
            should.exists(received);
            received.should.equal(1);
            nc.close();
            done();
        });
    });

    it('should allow proper override to a higher value', function(done) {
        const nc = NATS.connect(PORT);
        const WANT = 10;
        const SEND = 20;
        let received = 0;

        const sid = nc.subscribe('foo', function () {
            received += 1;
        });
        nc.unsubscribe(sid, 1);
        nc.unsubscribe(sid, WANT);

        for (let i = 0; i < SEND; i++) {
            nc.publish('foo');
        }

        nc.flush(function() {
            should.exists(received);
            received.should.equal(WANT);
            nc.close();
            done();
        });
    });

    it('should only receive N msgs in request mode with multiple helpers', function(done) {
        /* jshint loopfunc: true */
        const nc = NATS.connect(PORT);
        let received = 0;

        // Create 5 helpers
        for (let i = 0; i < 5; i++) {
            nc.subscribe('help', function(msg, reply) {
                nc.publish(reply, 'I can help!');
            });
        }

        nc.request('help', null, {
            'max': 1
        }, function() {
            received += 1;
            nc.flush(function() {
                should.exists(received);
                received.should.equal(1);
                nc.close();
                done();
            });
        });

    });

    function requestSubscriptions(nc, done) {
        let received = 0;

        nc.subscribe('help', function(msg, reply) {
            nc.publish(reply, 'I can help!');
        });

        /* jshint loopfunc: true */
        // Create 5 requests
        for (let i = 0; i < 5; i++) {
            nc.request('help', null, {
                'max': 1
            }, function() {
                received += 1;
            });
        }
        nc.flush(function() {
            setTimeout(function() {
                received.should.equal(5);
                const expected_subs = (nc.options.useOldRequestStyle ? 1 : 2);
                Object.keys(nc.subs).length.should.equal(expected_subs);
                nc.close();
                done();
            }, 100);
        });
    }

    it('should not leak subscriptions when using max', function(done) {
        const nc = NATS.connect(PORT);
        requestSubscriptions(nc, done);
    });

    it('oldRequest should not leak subscriptions when using max', function(done) {
        const nc = NATS.connect({
            port: PORT,
            useOldRequestStyle: true
        });
        requestSubscriptions(nc, done);
    });

    function requestGetsWantedNumberOfMessages(nc, done) {
        let received = 0;

        nc.subscribe('help', function(msg, reply) {
            nc.publish(reply, 'I can help!');
            nc.publish(reply, 'I can help!');
            nc.publish(reply, 'I can help!');
            nc.publish(reply, 'I can help!');
            nc.publish(reply, 'I can help!');
            nc.publish(reply, 'I can help!');
        });

        nc.request('help', null, {
            max: 3
        }, function() {
            received++;
        });

        nc.flush(function() {
            setTimeout(function() {
                received.should.equal(3);
                nc.close();
                done();
            }, 100);
        });
    }

    it('request should received specified number of messages', function(done) {
        /* jshint loopfunc: true */
        const nc = NATS.connect(PORT);
        requestGetsWantedNumberOfMessages(nc, done);
    });

    it('old request should received specified number of messages', function(done) {
        /* jshint loopfunc: true */
        const nc = NATS.connect({
            port: PORT,
            useOldRequestStyle: true
        });
        requestGetsWantedNumberOfMessages(nc, done);
    });

});
