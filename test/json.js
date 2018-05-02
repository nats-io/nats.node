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

    function test(input, checkResult) {
        if (!(checkResult instanceof Function)) {
            checkResult = function(msg) {
                should.equal(typeof msg, typeof input);
                should.equal(msg, input);
            };
        }

        return function(done) {
            var nc = NATS.connect({
                json: true,
                port: PORT
            });
            nc.subscribe('foo', function(msg, reply, subj, sid) {
                checkResult(msg);
                nc.unsubscribe(sid);
                nc.close();
                done();
            });

            nc.publish('foo', input);
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
            err.message.should.be.equal('Message should be a JSON object');
            done();
        }
    });

    it('should pub/sub object with json', test({
        field: 'hello',
        body: 'world'
    }, function(msg) {
        should.deepEqual(msg, {
            field: 'hello',
            body: 'world'
        });
    }));

    it('should pub/sub empty object with json', test({}, function(msg) {
        should.deepEqual(msg, {});
    }));

    it('should pub/sub array with json',
        test(['one', 'two', 'three'], function(msg) {
            msg.should.be.instanceof(Array).and.have.lengthOf(3);
        })
    );

    it('should pub/sub empty array with json', test([], function(msg) {
        msg.should.be.instanceof(Array).and.have.lengthOf(0);
    }));

    it('should pub/sub true with json', test(true));

    it('should pub/sub false with json', test(false));

    it('should pub/sub number with json', test(-Number.MAX_VALUE));

    it('should pub/sub string with json', test('one'));

    it('should pub/sub empty string with json', test(''));

    it('should pub/sub null with json', test(null, function(msg) {
        should.equal(msg, null);
    }));
});
