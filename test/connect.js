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

describe('Basic Connectivity', function() {

    const PORT = 1424;
    const u = 'nats://localhost:' + PORT;
    let server;

    // Start up our own nats-server
    before(function(done) {
        server = nsc.start_server(PORT, done);
    });

    // Shutdown our server after we are done
    after(function(done) {
        nsc.stop_server(server, done);
    });

    it('should perform basic connect with port', function() {
        const nc = NATS.connect(PORT);
        should.exist(nc);
        nc.close();
    });

    it('should perform basic connect with uri', function() {
        const nc = NATS.connect(u);
        should.exist(nc);
        nc.close();
    });

    it('should perform basic connect with options arg', function() {
        const options = {
            url: u
        };
        const nc = NATS.connect(options);
        should.exist(nc);
        nc.close();
    });

    it('should emit a connect event', function(done) {
        const nc = NATS.connect(PORT);
        nc.on('connect', function(client) {
            client.should.equal(nc);
            nc.close();
            done();
        });
    });

    it('should emit error if no server available', function(done) {
        const nc = NATS.connect('nats://localhost:22222');
        nc.on('error', function() {
            nc.close();
            done();
        });
    });

    it('should emit connecting events and try repeatedly if configured and no server available', function(done) {
        const nc = NATS.connect({
            url: 'nats://localhost:22222',
            waitOnFirstConnect: true,
            reconnectTimeWait: 100,
            maxReconnectAttempts: 20
        });
        let connectingEvents = 0;
        nc.on('error', function() {
            nc.close();
            done('should not have produced error');
        });
        nc.on('reconnecting', function() {
            connectingEvents++;
        });
        setTimeout(function() {
            connectingEvents.should.equal(5);
            nc.close();
            done();
        }, 550);
    });


    it('should still receive publish when some servers are invalid', function(done) {
        const natsServers = ['nats://localhost:22222', u, 'nats://localhost:22223'];
        const ua = NATS.connect({
            servers: natsServers
        });
        const ub = NATS.connect({
            servers: natsServers
        });
        let recvMsg = '';
        ua.subscribe('topic1', function(msg, reply, subject) {
            recvMsg = msg;
        });
        setTimeout(function() {
            ub.publish('topic1', 'hello');
        }, 100 * 1);
        setTimeout(function() {
            recvMsg.should.equal('hello');
            ua.close();
            ub.close();
            done();
        }, 100 * 2);
    });


    it('should still receive publish when some servers[noRandomize] are invalid', function(done) {
        const natsServers = ['nats://localhost:22222', u, 'nats://localhost:22223'];
        const ua = NATS.connect({
            servers: natsServers,
            noRandomize: true
        });
        const ub = NATS.connect({
            servers: natsServers,
            noRandomize: true
        });
        let recvMsg = "";
        ua.subscribe('topic1', function(msg, reply, subject) {
            recvMsg = msg;
        });
        setTimeout(function() {
            ub.publish('topic1', 'hello');
        }, 100 * 1);
        setTimeout(function() {
            recvMsg.should.equal('hello');
            ua.close();
            ub.close();
            done();
        }, 100 * 2);
    });


    it('should add a new cluster server', function(done) {
        const servers = [u, 'nats://localhost:22223'];
        const nc = NATS.connect({
            servers: new Array(servers[0])
        });
        let contains = 0;

        nc.on('connect', function(client) {
            client.addServer(servers[1]);
            client.servers.forEach(function(_server) {
                if (servers.indexOf(_server.url.href) !== -1) {
                    contains++;
                }
            });
            contains.should.equal(servers.length);
            nc.close();
            done();
        });
    });

});
