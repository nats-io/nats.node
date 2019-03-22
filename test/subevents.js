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

describe('Subscription Events', function() {

    const PORT = 9422;
    let server;

    // Start up our own nats-server
    before(function(done) {
        server = nsc.start_server(PORT, done);
    });

    // Shutdown our server after we are done
    after(function(done) {
        nsc.stop_server(server, done);
    });


    it('should generate subscribe events', function(done) {
        const nc = NATS.connect(PORT);
        const subj = 'sub.event';
        nc.on('subscribe', function(sid, subject) {
            should.exist(sid);
            should.exist(subject);
            subject.should.equal(subj);
            nc.close();
            done();
        });
        nc.subscribe(subj);
    });

    it('should generate subscribe events with opts', function(done) {
        const nc = NATS.connect(PORT);
        const subj = 'sub.event';
        const queuegroup = 'bar';
        nc.on('subscribe', function(sid, subject, opts) {
            should.exist(sid);
            should.exist(subject);
            subject.should.equal(subj);
            should.exist(opts);
            should.exist(opts.queue);
            opts.queue.should.equal(queuegroup);
            nc.close();
            done();
        });
        nc.subscribe(subj, {
            queue: queuegroup
        });
    });

    it('should generate unsubscribe events', function(done) {
        const nc = NATS.connect(PORT);
        const subj = 'sub.event';
        nc.on('unsubscribe', function(sid, subject) {
            should.exist(sid);
            should.exist(subject);
            subject.should.equal(subj);
            nc.close();
            done();
        });
        var sid = nc.subscribe(subj);
        nc.unsubscribe(sid);
    });

    it('should generate unsubscribe events on auto-unsub', function(done) {
        const nc = NATS.connect(PORT);
        const subj = 'autounsub.event';
        nc.on('unsubscribe', function(sid, subject) {
            should.exist(sid);
            should.exist(subject);
            subject.should.equal(subj);
            nc.close();
            done();
        });
        nc.subscribe(subj, {
            max: 1
        });
        nc.publish(subj);
    });

    it('should generate only one unsubscribe events on auto-unsub', function(done) {
        const nc = NATS.connect(PORT);
        const subj = 'autounsub.event';
        let eventsReceived = 0;
        const want = 5;

        nc.on('unsubscribe', function(sid, subject) {
            eventsReceived++;
        });
        const sid = nc.subscribe(subj);
        nc.unsubscribe(sid, want);
        for (let i = 0; i < want; i++) {
            nc.publish(subj);
        }
        nc.flush(function() {
            eventsReceived.should.equal(1);
            nc.close();
            done();
        });
    });

    it('should generate unsubscribe events on request max', function(done) {
        const nc = NATS.connect(PORT);
        const subj = 'request.autounsub.event';

        nc.subscribe(subj, function(subject, reply) {
            nc.publish(reply, "OK");
        });
        nc.request(subj, null, {
            max: 1
        });

        nc.on('unsubscribe', function(sid, subject) {
            should.exist(sid);
            should.exist(subject);
            nc.close();
            done();
        });
    });

});
