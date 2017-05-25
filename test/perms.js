/* jslint node: true */
/* global describe: false, before: false, after: false, it: false, afterEach: false, beforeEach: false */
/* jshint -W030 */
'use strict';

var NATS = require('../'),
    nsc = require('./support/nats_server_control'),
    ncu = require('./support/nats_conf_utils'),
    os = require('os'),
    fs = require('fs'),
    path = require('path'),
    should = require('should'),
    nuid = require('nuid');


describe('Auth Basics', function() {

    var PORT = 6758;
    var server;

    // Start up our own nats-server
    before(function(done) {
        var conf = {
            authorization: {
                ADMIN: {
                    publish: ">",
                    subscribe: ">"
                },
                SUB: {
                    subscribe: "bar",
                    publish: "bar",
                },
                PUB: {
                    subscribe: "foo",
                    publish: "foo"
                },
                users: [{
                        user: 'admin',
                        password: 'admin',
                        permission: '$ADMIN'
                    },
                    {
                        user: 'foo',
                        password: 'foo',
                        permission: '$PUB'
                    },
                    {
                        user: 'bar',
                        password: 'bar',
                        permission: '$SUB'
                    }
                ]
            }
        };
        var cf = path.resolve(os.tmpdir(), 'conf-' + nuid.next() + '.conf');
        ncu.writeFile(cf, ncu.j(conf));
        server = nsc.start_server(PORT, ['-c', cf], done);
    });

    // Shutdown our server
    after(function() {
        nsc.stop_server(server);
    });

    it('bar cannot subscribe/pub foo', function(done) {
        var nc = NATS.connect({
            port: PORT,
            user: 'bar',
            password: 'bar'
        });

        var perms = 0;
        nc.on('permission_error', function() {
            perms++;
            if (perms === 2) {
                nc.close();
                done();
            }
        });

        nc.on('connect', function() {
            nc.subscribe('foo', function() {
                nc.close();
                done(new Error("shouldn't have been able to subscribe to foo"));
            });
            nc.publish('foo', '');
        });
    });
});
