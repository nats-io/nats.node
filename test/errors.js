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
    NatsError = require('../').NatsError,
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
        }).should.throw(NatsError);
        done();
    });

    it('should throw errors on publish when no subject is supplied', function(done) {
        const nc = NATS.connect(PORT);
        (function() {
            nc.publish();
        }).should.throw(NatsError, { message: 'Subject must be supplied' });
        done();
    });

    it('should throw errors on publish when message is a function', function(done) {
        const nc = NATS.connect(PORT);
        (function() { // only passed accidentally, threw opt_callback is not a function
            nc.publish('subject', function() {}, 'bar');
        }).should.throw(NatsError, { message: 'Message can\'t be a function' });
        done();
    });

    it('should throw errors on publish when reply is a function', function(done) {
        const nc = NATS.connect(PORT);
        (function() {
            nc.publish('subject', 'message', function() {}, null);
        }).should.throw(NatsError, { message: 'Reply can\'t be a function' });
        done();
    });

    it('should throw errors on publish when callback is not a function', function(done) {
        const nc = NATS.connect(PORT);
        (function() {
            nc.publish('subject', 'message', 'reply', 'bar');
        }).should.throw(NatsError, { message: 'Callback needs to be a function' });
        done();
    });

    it('should throw errors on publish when connection is closed', function(done) {
        const nc = NATS.connect(PORT);
        nc.close();
        (function() {
            nc.publish('subject');
        }).should.throw(NatsError, { message: 'Connection closed' });
        done();
    });

    it('should throw errors on flush when connection is closed', function(done) {
        const nc = NATS.connect(PORT);
        nc.close();
        (function() {
            nc.flush();
        }).should.throw(NatsError, { message: 'Connection closed' });
        done();
    });

    it('should pass error to publish callback when missing subject', function(done) {
        const nc = NATS.connect(PORT);
        nc.publish(createCallback(done, 'Subject must be supplied'));
    });

    it('should pass error to publish callback when missing subject but message is present', function(done) {
        const nc = NATS.connect(PORT);
        nc.publish(null, 'message', createCallback(done, 'Subject must be supplied'));
    });

    it('should pass error to publish callback when missing subject but message and opt_reply is present', function(done) {
        const nc = NATS.connect(PORT);
        nc.publish(null, 'message', 'opt_reply', createCallback(done, 'Subject must be supplied'));
    });

    it('should pass error to publish callback message has wrong type', function(done) {
        // bad args
        const nc = NATS.connect(PORT);
        nc.publish('subject', function() {}, 'opt_reply', createCallback(done, 'Message can\'t be a function'));
    });

    it('should pass error to publish callback opt_reply has wrong type', function(done) {
        const nc = NATS.connect(PORT);
        nc.publish('subject', 'message', function() {}, createCallback(done, 'Reply can\'t be a function'));
    });

    it('should pass error to publish callback when closed', function(done) {
        // closed will still throw since we remove event listeners.
        const nc = NATS.connect(PORT);
        nc.close();
        nc.publish('subject', createCallback(done, 'Connection closed'));
    });

    it('should throw errors on subscribe', function(done) {
        const nc = NATS.connect(PORT);
        nc.close();
        // Closed
        (function() {
            nc.subscribe('subject');
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

    function createCallback(done, expectedErrorMessage) {
        const callback = function(err) {
            (++callback.called).should.equal(1);
            should.exist(err);
            should.exist(err.message);
            err.message.should.equal(expectedErrorMessage);
            done();
        };
        callback.called = 0;
        return callback;
    }
});
