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

describe('JSON payloads', function() {

    var PORT = 1423;
    var server;

    // Start up our own nats-server
    before(function(done) {
        server = nsc.start_server(PORT, done);
    });

    // Shutdown our server
    after(function(done) {
        nsc.stop_server(server, done);
    });

    function testPubSub(input) {
        return function(done) {
            var nc = NATS.connect({
                json: true,
                port: PORT
            });

            nc.subscribe('pubsub', function(msg, reply, subj, sid) {
                if (msg instanceof Object) {
                    msg.should.deepEqual(input);
                } else {
                    should.equal(msg, input);
                }
                nc.unsubscribe(sid);
                nc.close();

                done();
            });

            nc.publish('pubsub', input);
        };
    }

    function testReqRep(input, useOldRequestStyle) {
        return function(done) {
            var nc = NATS.connect({
                json: true,
                port: PORT,
                useOldRequestStyle: useOldRequestStyle === true
            });

            nc.subscribe('reqrep', { max: 1 }, function(msg, reply) {
                nc.publish(reply, msg);
            });

            nc.request('reqrep', input, function(msg) {
                if (msg instanceof Object) {
                    msg.should.deepEqual(input);
                } else {
                    should.equal(msg, input);
                }
                nc.close();

                done();
            });
        };
    }

    it('should pub/sub fail with circular json', function(done) {
        var nc = NATS.connect({
            json: true,
            port: PORT
        });

        var a = {};
        a.a = a;

        try {
            nc.publish('foo', a);
        } catch (err) {
            nc.close();
            err.message.should.be.equal(
                'Message should be a non-circular JSON object'
            );
            done();
        }
    });

    var testInputs = {
        json: {
            field: 'hello',
            body: 'world'
        },
        'empty array': [],
        array: [1, -2.3, 'foo', false],
        true: true,
        false: false,
        null: null,
        number: -123.45,
        'empty string': '',
        string: 'abc'
    };

    for (var name of Object.getOwnPropertyNames(testInputs)) {
        it(`should pub/sub with ${name}`, testPubSub(testInputs[name]));
        it(`should req/rep with ${name}`, testReqRep(testInputs[name]));
        it(`should req/rep with ${name} oldrr`,
            testReqRep(testInputs[name], true)
        );
    }
});
