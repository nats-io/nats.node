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
/* global describe: false, before: false, after: false, it: false, afterEach: false, beforeEach: false */
/* jshint -W030 */
'use strict';

const NATS = require('../'),
    nsc = require('./support/nats_server_control'),
    ncu = require('./support/nats_conf_utils'),
    os = require('os'),
    path = require('path'),
    should = require('should'),
    fs = require('fs'),
    nuid = require('nuid');


describe('Auth Basics', function() {

    const PORT = 6758;
    let server;

    // Start up our own nats-server
    before(function(done) {
        const conf = {
            authorization: {
                SUB: {
                    subscribe: "bar",
                    publish: ["bar"]
                },
                users: [{
                    user: 'bar',
                    password: 'bar',
                    permission: '$SUB'
                }]
            }
        };
        const cf = path.resolve(os.tmpdir(), 'conf-' + nuid.next() + '.conf');
        fs.writeFile(cf, ncu.j(conf), function(err) {
            if (err) {
                done(err);
            } else {
                server = nsc.start_server(PORT, ['-c', cf], done);
            }
        });
    });

    // Shutdown our server
    after(function(done) {
        nsc.stop_server(server, done);
    });

    it('bar cannot subscribe/pub foo', function(done) {
        const nc = NATS.connect({
            port: PORT,
            user: 'bar',
            password: 'bar'
        });

        let perms = 0;
        nc.on('permission_error', function() {
            perms++;
            if (perms === 2) {
                nc.close();
                done();
            }
        });
        nc.flush(function() {
            nc.subscribe('foo', function() {
                nc.close();
                done("Shouldn't be able to publish foo");
            });
            nc.publish('foo', 'foo');
        });

    });

    it('permission_error is not fatal', function(done) {
        const nc = NATS.connect({
            port: PORT,
            user: 'bar',
            password: 'bar'
        });

        const errs = [];
        nc.on('permission_error', function(err) {
            errs.push(err);
        });

        let count = 0;
        nc.subscribe('bar', () => {
            count++;
        });

        nc.publish('bar');
        nc.publish('foo');
        nc.publish('bar');
        nc.subscribe('foo', () => {});
        nc.publish('bar');
        nc.flush(() => {
            nc.close();
            if (errs.length !== 2) {
                done(new Error("expected one permission error"));
            } else if (count !== 3) {
                done(new Error("expected three messages"));
            } else {
                // let's make sure the errors are what we think they are
                let hasPubErr = false;
                let hasSubErr = false;
                for(let i=0; i < errs.length; i++) {
                    const m = errs[i].message.toLowerCase();
                    if (m.indexOf('permission violation for publish to "foo"')) {
                        hasPubErr = true;
                    }
                    if (m.indexOf('permission violation for subscription to "foo"')) {
                        hasSubErr = true;
                    }
                }
                if(!hasPubErr) {
                    done(new Error("permission violation for pub not found"));
                    return;
                }
                if(!hasSubErr) {
                    done(new Error("permission violation for sub not found"));
                    return;
                }
                done();
            }
        });
    });
});
