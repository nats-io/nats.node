/* jslint node: true */
/* global describe: false, before: false, after: false, it: false, afterEach: false, beforeEach: false */
/* jshint -W030 */
'use strict';

var NATS = require('../'),
    nsc = require('./support/nats_server_control'),
    ncu = require('./support/nats_conf_utils'),
    should = require('should'),
    path = require('path'),
    os = require('os'),
    nuid = require('nuid');

describe('Dynamic Cluster - Connect URLs', function() {
    this.timeout(10000);

    // this to enable per test cleanup
    var servers;
    // Shutdown our servers
    afterEach(function() {
        nsc.stop_cluster(servers);
        servers = [];
    });

    it('adding cluster performs update', function(done) {
        var route_port = nsc.alloc_next_port();
        var port = nsc.alloc_next_port();

        // start a new cluster with single server
        servers = nsc.start_cluster([port], route_port, function() {
            should(servers.length).be.equal(1);

            // connect the client
            var nc = NATS.connect({
                'port': port,
                'reconnectTimeWait': 100
            });
            nc.on('connect', function() {
                // start adding servers
                process.nextTick(function() {
                    var others = nsc.add_member_with_delay(nsc.alloc_next_port(2), route_port, 250, function() {
                        // verify that 2 servers were added
                        should(others.length).be.equal(2);
                        others.forEach(function(o) {
                            // add them so they can be reaped
                            servers.push(o);
                        });
                        // give some time for the server to send infos
                        setTimeout(function() {
                            // we should know of 3 servers - the one we connected and the 2 we added
                            should(nc.servers.length).be.equal(3);
                            done();
                        }, 3000);
                    });
                });
            });
        });
    });

    it('added servers are shuffled at the end of the list', function(done) {
        var route_port = nsc.alloc_next_port();
        var ports = nsc.alloc_next_port(10);
        // start a cluster of one server
        var map = {};
        servers = nsc.start_cluster(ports, route_port, startCluster);

        function startCluster() {
            should(servers.length).be.equal(10);

            var connectCount = 0;

            function connectAndRecordPorts(check) {
                var nc = NATS.connect({
                    'port': ports[0],
                    'reconnectTimeWait': 100
                });
                nc.on('connect', function() {
                    var have = [];
                    nc.servers.forEach(function(s) {
                        have.push(s.url.port);
                    });

                    connectCount++;
                    should.ok(have[0] == ports[0]);
                    var key = have.join("_");
                    map[key] = map[key] ? map[key] + 1 : 1;
                    nc.close();
                    if (connectCount === 10) {
                        check();
                    }
                });
            }

            // we should have more than one property if there was randomization
            function check() {
                var keys = Object.getOwnPropertyNames(map);
                should.ok(keys.length > 1);
                done();
            }

            // connect several times...
            for (var i = 0; i < 10; i++) {
                connectAndRecordPorts(check);
            }
        }
    });

    it('added servers not shuffled when noRandomize is set', function(done) {
        var route_port = nsc.alloc_next_port();
        var ports = nsc.alloc_next_port(10);

        // start a cluster of one server
        var map = {};
        servers = nsc.start_cluster(ports, route_port, function() {
            should(servers.length).be.equal(10);

            var connectCount = 0;

            function connectAndRecordPorts(check) {
                var nc = NATS.connect({
                    'port': ports[0],
                    'reconnectTimeWait': 100,
                    'noRandomize': true
                });
                nc.on('connect', function() {
                    var have = [];
                    nc.servers.forEach(function(s) {
                        have.push(s.url.port);
                    });

                    connectCount++;
                    should.ok(have[0] == ports[0]);
                    var key = have.join("_");
                    map[key] = map[key] ? map[key] + 1 : 1;
                    nc.close();
                    if (connectCount === 10) {
                        check();
                    }
                });
            }

            // we should have more than one property if there was randomization
            function check() {
                var keys = Object.getOwnPropertyNames(map);
                should.ok(keys.length === 1);
                should.ok(map[keys[0]] === 10);
                done();
            }

            // connect several times...
            for (var i = 0; i < 10; i++) {
                connectAndRecordPorts(check);
            }
        });
    });

    it('error connecting raises error and closes', function(done) {
        reconnectTest(nsc.alloc_next_port(), nsc.alloc_next_port(), true, done);
    });

    it('error connecting raises error and closes - non tls', function(done) {
        reconnectTest(nsc.alloc_next_port(), nsc.alloc_next_port(), false, done);
    });

    function reconnectTest(port, route_port, use_certs, done) {
        var config = {
            tls: {
                cert_file: path.resolve(process.cwd(), "./test/certs/server-cert.pem"),
                key_file: path.resolve(process.cwd(), "./test/certs/server-key.pem"),
                ca_file: path.resolve(process.cwd(), "./test/certs/ca.pem"),
                verify: false,
                timeout: 2.0
            },
            authorization: {
                user: "test",
                // password is 'test'
                password: "$2a$10$P6A99S9.wOT3yzNcz0OY/OBatni9Jl01AMuzRUkhXei6nOadn6R4C",
                timeout: 2.0
            }
        };

        if (!use_certs) {
            delete config.tls;
        }

        // write two normal configs
        var normal = JSON.parse(JSON.stringify(config));
        var normal_conf = path.resolve(os.tmpdir(), 'normalauth_' + nuid.next() + '.conf');
        ncu.writeFile(normal_conf, ncu.j(normal));

        // one that has bad timeout
        var short = JSON.parse(JSON.stringify(normal));

        if (use_certs) {
            short.tls.timeout = 0.0001;
        }
        short.authorization.timeout = 0.0001;
        var short_conf = path.resolve(os.tmpdir(), 'shortconf_' + nuid.next() + '.conf');
        ncu.writeFile(short_conf, ncu.j(short));

        // start a new cluster with single server
        var memberPort = nsc.alloc_next_port();
        servers = nsc.start_cluster([port], route_port, ['-c', normal_conf], function() {
            process.nextTick(function() {
                var others = nsc.add_member_with_delay([memberPort], route_port, 250, ['-c', short_conf], function() {
                    // add the second server
                    servers.push(others[0]);
                    setTimeout(startClient, 1000);
                });
            });
        });

        function startClient() {
            // connect the client
            var opts = {
                port: port,
                reconnectTimeWait: 100,
                maxReconnectAttempts: 2,
                user: 'test',
                password: 'test',
                noRandomize: true,
                tls: {
                    rejectUnauthorized: false
                }
            };
            if (!use_certs) {
                delete opts.tls;
            }

            function testClusterOK(nc) {
                if(nc.servers.length === 2) {
                    killServer();
                } else {
                    setTimeout(function(){
                        console.log('cluster not formed yet', nc.servers);
                        testClusterOK(nc);
                    }, 250);
                }
            }

            function killServer() {
                connected = true;
                // now we disconnect first server
                setTimeout(function() {
                    servers[0].kill();
                }, 100);
            }

            var nc = NATS.connect(opts);
            var connected = false;
            nc.on('connect', function(nc) {
                if (!connected) {
                    testClusterOK(nc);
                }
            });

            var errors = [];
            nc.on('error', function(e) {
                // save the error
                errors.push(e);
            });
            nc.on('close', function() {
                should.ok(connected);
                // for tls the error isn't always raised so we'll just trust
                // that we we tried connecting to the bad server
                should.ok(errors.length === 1 || disconnects.indexOf((memberPort) + '') !== -1);
                done();
            });
            var disconnects = [];
            nc.on('disconnect', function() {
                var p = nc.currentServer.url.port;
                if (disconnects.indexOf(p) === -1) {
                    disconnects.push(p);
                }
            });
        }
    }
});
