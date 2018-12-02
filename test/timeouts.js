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

var PORT = 1428;

describe('Timeout and max received events for subscriptions', function() {

    var server;

    // Start up our own nats-server
    before(function(done) {
        server = nsc.start_server(PORT, done);
    });

    // Shutdown our server after we are done
    after(function(done) {
        nsc.stop_server(server, done);
    });

    it('should perform simple timeouts on subscriptions', function(done) {
        var nc = NATS.connect(PORT);
        nc.on('connect', function() {
            var startTime = new Date();
            var sid = nc.subscribe('foo');
            nc.timeout(sid, 50, 1, function() {
                var elapsed = new Date() - startTime;
                should.exists(elapsed);
                elapsed.should.be.within(45, 75);
                nc.close();
                done();
            });
        });
    });

    it('should not timeout if exepected has been received', function(done) {
        var nc = NATS.connect(PORT);
        nc.on('connect', function() {
            var sid = nc.subscribe('foo');
            nc.timeout(sid, 50, 1, function() {
                done(new Error('Timeout improperly called'));
            });
            nc.publish('foo', function() {
                nc.close();
                done();
            });
        });
    });


    it('should not timeout if unsubscribe is called', function(done) {
        var nc = NATS.connect(PORT);
        nc.on('connect', function() {
            var count = 0;
            var sid = nc.subscribe('bar', function(m) {
                count++;
                if (count === 1) {
                    nc.unsubscribe(sid);
                }
            });
            nc.timeout(sid, 1000, 2, function() {
                done(new Error('Timeout improperly called'));
            });
            nc.publish('bar', '');
            nc.flush();
            setTimeout(function() {
                // terminate the test
                nc.close();
                done();
            }, 1500);
        });
    });

    it('timeout should unsubscribe', function(done) {
        var nc = NATS.connect(PORT);
        nc.on('connect', function() {
            var count = 0;
            var sid = nc.subscribe('bar', function(m) {
                count++;
            });
            nc.timeout(sid, 250, 2, function() {
                process.nextTick(function() {
                    nc.publish('bar', '');
                    nc.flush();
                });
            });
            setTimeout(function() {
                nc.close();
                should(count).equal(0);
                done();
            }, 1000);
        });
    });


    it('should perform simple timeouts on requests', function(done) {
        var nc = NATS.connect(PORT);
        nc.on('connect', function() {
            nc.request('foo', null, {
                max: 1,
                timeout: 1000
            }, function(err) {
                err.should.be.instanceof(NATS.NatsError);
                err.should.have.property('code', NATS.REQ_TIMEOUT);
                nc.close();
                done();
            });
        });
    });

    it('should perform simple timeouts on requests without specified number of messages', function(done) {
        var nc = NATS.connect(PORT);
        nc.on('connect', function() {
            nc.subscribe('foo', function(msg, reply) {
                nc.publish(reply);
            });

            var responses = 0;
            nc.request('foo', null, {
                max: 2,
                timeout: 1000
            }, function(err) {
                if (!err.hasOwnProperty('code')) {
                    responses++;
                    return;
                }
                responses.should.be.equal(1);
                err.should.be.instanceof(NATS.NatsError);
                err.should.have.property('code', NATS.REQ_TIMEOUT);
                nc.close();
                done();
            });
        });
    });

    it('should override request autoset timeouts', function(done) {
        var nc = NATS.connect(PORT);
        var calledOnRequestHandler = false;
        nc.on('connect', function() {
            var sid = nc.request('foo', null, {
                max: 2,
                timeout: 1000
            }, function(err) {
                calledOnRequestHandler = true;
            });

            nc.timeout(sid, 1500, 2, function(v) {
                calledOnRequestHandler.should.be.false();
                v.should.be.equal(sid);
                nc.close();
                done();
            });
        });
    });
});
