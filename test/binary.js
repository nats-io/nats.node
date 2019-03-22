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
    crypto = require('crypto'),
    should = require('should');

describe('Binary', function() {

    const PORT = 1432;
    let server;

    // Start up our own nats-server
    before(function(done) {
        server = nsc.start_server(PORT, done);
    });

    // Shutdown our server
    after(function(done) {
        nsc.stop_server(server, done);
    });


    function binaryDataTests(done, nc) {
        // try some invalid utf-8 byte sequences
        const invalid2octet = Buffer.from('\xc3\x28', 'binary');
        const invalidsequenceidentifier = Buffer.from('\xa0\xa1', 'binary');
        const invalid3octet = Buffer.from('\xe2\x28\xa1', 'binary');
        const invalid4octet = Buffer.from('\xf0\x90\x28\xbc', 'binary');
        const bigBuffer = crypto.randomBytes(128 * 1024);

        // make sure embedded nulls don't cause truncation
        const embeddednull = Buffer.from('\x00\xf0\x00\x28\x00\x00\xf0\x9f\x92\xa9\x00', 'binary');

        let count = 6;
        const finished = function () {
            if (--count <= 0) {
                nc.close();
                done();
            }
        };

        nc.subscribe('invalid2octet', function(msg) {
            msg.length.should.equal(2);
            if (nc.options.preserveBuffers) {
                should.ok(invalid2octet.equals(msg));
            } else {
                msg.should.equal(invalid2octet.toString('binary'));
            }
            finished();
        });

        nc.subscribe('invalidsequenceidentifier', function(msg) {
            msg.length.should.equal(2);
            if (nc.options.preserveBuffers) {
                should.ok(invalidsequenceidentifier.equals(msg));
            } else {
                msg.should.equal(invalidsequenceidentifier.toString('binary'));
            }
            finished();
        });

        nc.subscribe('invalid3octet', function(msg) {
            msg.length.should.equal(3);
            if (nc.options.preserveBuffers) {
                should.ok(invalid3octet.equals(msg));
            } else {
                msg.should.equal(invalid3octet.toString('binary'));
            }
            finished();
        });

        nc.subscribe('invalid4octet', function(msg) {
            msg.length.should.equal(4);
            if (nc.options.preserveBuffers) {
                should.ok(invalid4octet.equals(msg));
            } else {
                msg.should.equal(invalid4octet.toString('binary'));
            }
            finished();
        });

        nc.subscribe('embeddednull', function(msg) {
            msg.length.should.equal(11);
            if (nc.options.preserveBuffers) {
                should.ok(embeddednull.equals(msg));
            } else {
                msg.should.equal(embeddednull.toString('binary'));
            }
            finished();
        });

        nc.subscribe('bigbuffer', function(msg) {
            msg.length.should.equal(bigBuffer.length);
            if (nc.options.preserveBuffers) {
                should.ok(bigBuffer.equals(msg));
            } else {
                msg.should.equal(bigBuffer.toString('binary'));
            }
            finished();
        });


        nc.publish('invalid2octet', invalid2octet);
        nc.publish('invalidsequenceidentifier', invalidsequenceidentifier);
        nc.publish('invalid3octet', invalid3octet);
        nc.publish('invalid4octet', invalid4octet);
        nc.publish('embeddednull', embeddednull);
        nc.publish('bigbuffer', bigBuffer);
    }

    it('should allow sending and receiving binary data', function(done) {
        const nc = NATS.connect({
            'url': 'nats://localhost:' + PORT,
            'encoding': 'binary'
        });
        binaryDataTests(done, nc);
    });

    it('should allow sending binary buffers', function(done) {
        const nc = NATS.connect({
            'url': 'nats://localhost:' + PORT,
            'preserveBuffers': true
        });
        binaryDataTests(done, nc);
    });

    it('should not append control characters on chunk processing', function(done) {
        const nc = NATS.connect({
            'url': 'nats://localhost:' + PORT,
            'preserveBuffers': true
        });
        const buffer = crypto.randomBytes(1024);

        let count = 0;
        const finished = function () {

            if (++count === 100) {
                nc.close();
                done();
            }
        };

        nc.subscribe('trailingData', function(msg) {
            should.ok(msg.equals(buffer));
            finished();
        });

        for (let i = 0; i <= 100; i++) {

            nc.publish('trailingData', buffer);
        }

    });

});
