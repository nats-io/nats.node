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
    should = require('should'),
    fs = require('fs');

describe('TLS No IPs', function() {
    this.timeout(5000);

    // this to enable per test cleanup
    let servers;

    // Shutdown our servers
    afterEach(function(done) {
        nsc.stop_cluster(servers, function() {
            servers = [];
            done();
        });
    });

    it('should reconnect via tls with discovered server ip only', function(done) {
        const route_port = 55220;
        const port = 54222;
        const ports = [port, port + 1, port + 2];
        const flags = ['--tls', '--tlscert', './test/certs/server_noip.pem',
            '--tlskey', './test/certs/key_noip.pem'
        ];
        servers = nsc.start_cluster(ports, route_port, flags, function() {
            should(servers.length).be.equal(3);
            const nc = NATS.connect({
                url: "tls://localhost:" + port,
                noRandomize: true,
                reconnectTimeWait: 100,
                tls: {
                    ca: [fs.readFileSync('./test/certs/ca.pem')]
                }
            });

            nc.on('connect', function() {
                const s = nsc.find_server(port, servers);
                nsc.stop_server(s);
            });
            nc.on('reconnect', function() {
                nc.close();
                done();
            });
            nc.on('close', function() {
                done("Did not reconnect");
            });
            nc.on('error', function(err) {
                nc.close();
                done();
            });
        });
    });
});
