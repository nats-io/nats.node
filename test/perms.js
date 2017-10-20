/* jslint node: true */
/* global describe: false, before: false, after: false, it: false, afterEach: false, beforeEach: false */
/* jshint -W030 */
'use strict';

var NATS = require('../'),
    nsc = require('./support/nats_server_control'),
    ncu = require('./support/nats_conf_utils'),
    os = require('os'),
    path = require('path'),
    should = require('should'),
    fs = require('fs'),
    nuid = require('nuid');


describe('Auth Basics', function() {

    var PORT = 6758;
    var server;

    // Start up our own nats-server
    before(function(done) {
        var conf = {
            authorization: {
                SUB: {
                    subscribe: "bar",
                    publish: "bar"
                },
                users: [{
                        user: 'bar',
                        password: 'bar',
                        permission: '$SUB'
                    }
                ]
            }
        };
        var cf = path.resolve(os.tmpdir(), 'conf-' + nuid.next() + '.conf');
        fs.writeFile(cf, ncu.j(conf), function(err) {
            if(err) {
                done(err);
            } else {
                console.log(cf);
                server = nsc.start_server(PORT, ['-c', cf], done);
            }
        });
    });

    // Shutdown our server
    after(function(done) {
        nsc.stop_server(server, done);
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
        nc.flush(function(){
            nc.subscribe('foo', function() {
                nc.close();
                done("Shouldn't be able to publish foo");
            });
            nc.publish('foo', 'foo');
        });

    });
});
