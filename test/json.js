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
'use strict';

const NATS = require('../'),
    nsc = require('./support/nats_server_control'),
    should = require('should');

describe('JSON payloads', () => {
    const PORT = 1423;
    let server;

    // Start up our own nats-server
    before((done) => {
        server = nsc.start_server(PORT, done);
    });

    // Shutdown our server
    after((done) => {
        nsc.stop_server(server, done);
    });

    function testPubSub(input, expected) {
        if (expected === undefined) {
            expected = input;
        }

        return (done) => {
            const nc = NATS.connect({
                json: true,
                port: PORT
            });

            nc.subscribe('pubsub', (msg, reply, subj, sid) => {
                if (msg instanceof Object) {
                    msg.should.deepEqual(expected);
                } else {
                    should.strictEqual(msg, expected);
                }
                nc.unsubscribe(sid);
                nc.close();

                done();
            });

            nc.publish('pubsub', input);
        };
    }

    function testReqRep(input, expected, useOldRequestStyle) {
        if (expected === undefined) {
            expected = input;
        }

        return (done) => {
            const nc = NATS.connect({
                json: true,
                port: PORT,
                useOldRequestStyle: useOldRequestStyle === true
            });

            nc.subscribe('reqrep', {
                max: 1
            }, (msg, reply) => {
                nc.publish(reply, msg);
            });

            nc.request('reqrep', input, (msg) => {
                if (msg instanceof Object) {
                    msg.should.deepEqual(expected);
                } else {
                    should.strictEqual(msg, expected);
                }
                nc.close();

                done();
            });
        };
    }

    function testFail(input) {
        return (done) => {
            const nc = NATS.connect({
                json: true,
                port: PORT
            });

            try {
                nc.publish('foo', input);
            } catch (err) {
                nc.close();
                err.message.should.be.equal(
                    'Message should be a non-circular JSON-serializable value'
                );
                done();
            }
        };
    }

    const a = {};
    a.a = a;

    it('should pub/sub fail with circular json', testFail(a));

    const testInputs = {
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

    // Cannot use Object.entries because it's behind a flag in Node 6
    for (const name of Object.getOwnPropertyNames(testInputs)) {
        it(`should pub/sub with ${name}`, testPubSub(testInputs[name]));
        it(`should req/rep with ${name}`, testReqRep(testInputs[name]));
        it(`should req/rep with ${name} oldrr`, testReqRep(
            testInputs[name], undefined, true
        ));
    }

    // undefined must be serialized as null
    it('should pub/sub with undefined', testPubSub(undefined, null));
    it('should req/rep with undefined', testReqRep(undefined, null));
    it('should req/rep with undefined oldrr', testReqRep(
        undefined, null, true
    ));
});
