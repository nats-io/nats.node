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

describe('Errors', function() {

    const PORT = 1491;
    let server;

    // Start up our own nats-server
    before(function(done) {
        server = nsc.start_server(PORT, done);
    });

    // Shutdown our server after we are done
    after(function(done) {
        nsc.stop_server(server, done);
    });

    it('should throw errors on connect', function(done) {
        (function() {
            const nc = NATS.connect({
                'url': 'nats://localhost:' + PORT,
                'token': 'token1',
                'user': 'foo'
            });
        }).should.throw(Error);
        done();
    });

    it('should throw errors on publish', function(done) {
        const nc = NATS.connect(PORT);
        // No subject
        (function() {
            nc.publish();
        }).should.throw(Error);
        // bad args
        (function() {
            nc.publish('foo', function() {}, 'bar');
        }).should.throw(Error);
        (function() {
            nc.publish('foo', 'bar', function() {}, 'bar');
        }).should.throw(Error);
        // closed
        nc.close();
        (function() {
            nc.publish('foo');
        }).should.throw(Error);
        done();
    });

    it('should throw errors on flush', function(done) {
        const nc = NATS.connect(PORT);
        nc.close();
        (function() {
            nc.flush();
        }).should.throw(Error);
        done();
    });

    it('should pass errors on publish with callbacks', function(done) {
        const nc = NATS.connect(PORT);
        const expectedErrors = 4;
        let received = 0;

        const cb = function (err) {
            should.exist(err);
            if (++received === expectedErrors) {
                done();
            }
        };

        // No subject
        nc.publish(cb);
        // bad args
        nc.publish('foo', function() {}, 'bar', cb);
        nc.publish('foo', 'bar', function() {}, cb);

        // closed will still throw since we remove event listeners.
        nc.close();
        nc.publish('foo', cb);
    });

    it('should throw errors on subscribe', function(done) {
        const nc = NATS.connect(PORT);
        nc.close();
        // Closed
        (function() {
            nc.subscribe('foo');
        }).should.throw(Error);
        done();
    });

    it('NatsErrors have code', function() {
        const err = new NATS.NatsError("hello", "helloid");
        should.equal(err.message, 'hello');
        should.equal(err.code, 'helloid');
    });

    it('NatsErrors can chain an error', function() {
        const srcErr = new Error('foo');
        const err = new NATS.NatsError("hello", "helloid", srcErr);
        should.equal(err.message, 'hello');
        should.equal(err.code, 'helloid');
        should.equal(err.chainedError, srcErr);
        should.equal(err.name, 'NatsError');
    });

    it('should emit error on exception during handler', function(done) {
        const nc = NATS.connect(PORT);
        nc.on('error', function(err) {
            err.message.should.equal('die');
            nc.close();
            done();
        });
        nc.subscribe('*', function() {
            throw new Error("die");
        });
        nc.publish('baz');
    });

});
