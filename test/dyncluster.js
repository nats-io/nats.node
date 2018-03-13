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
    fs = require('fs'),
    nuid = require('nuid');

describe('Dynamic Cluster - Connect URLs', function() {
    this.timeout(10000);

    // this to enable per test cleanup
    var servers;
    // Shutdown our servers
    afterEach(function(done) {
        nsc.stop_cluster(servers, function() {
            servers = [];
            done();
        });
    });

    it('adding cluster performs update', function(done) {
        var route_port = 54220;
        var port = 54221;

        // start a new cluster with single server
        servers = nsc.start_cluster([port], route_port, function() {
            should(servers.length).be.equal(1);

            // connect the client
            var nc = NATS.connect({
                url: "nats://127.0.0.1:" + port,
                reconnectTimeWait: 100
            });
            nc.on('connect', function() {
                // start adding servers
                process.nextTick(function() {
                    var others = nsc.add_member_with_delay([port + 1, port + 2], route_port, 250, function() {
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
                        }, 1000);
                    });
                });
            });
        });
    });

    it('servers are shuffled', function(done) {
        var route_port = 54320;
        var port = 54321;
        // start a cluster of one server
        var ports = [];
        for (var i = 0; i < 10; i++) {
            ports.push(port + i);
        }
        servers = nsc.start_cluster(ports, route_port, function() {
            should(servers.length).be.equal(10);

            // added in order
            var uris = [];
            ports.forEach(function(p) {
              uris.push("nats://127.0.0.1:" + p);
            });

            var nc = NATS.connect({
                reconnectTimeWait: 100,
                servers: uris
            });
            nc.on('connect', function() {
              var found = [];
              nc.servers.forEach(function(s) {
                found.push(s.url.href);
              });

              should.notDeepEqual(found, ports, 'ports shouldnt be in the same order');
              should.equal(found.length, ports.length, 'ports count should match');
              done();
            });
        });
    });

    it('added servers not shuffled when noRandomize is set', function(done) {
        var route_port = 54320;
        var port = 54321;
        // start a cluster of one server
        var ports = [];
        for (var i = 0; i < 10; i++) {
            ports.push(port + i);
        }
        var map = {};
        servers = nsc.start_cluster(ports, route_port, function() {
            should(servers.length).be.equal(10);

            var connectCount = 0;

            function connectAndRecordPorts(check) {
                var nc = NATS.connect({
                    'port': port,
                    'reconnectTimeWait': 100,
                    'noRandomize': true
                });
                nc.on('connect', function() {
                    var have = [];
                    nc.servers.forEach(function(s) {
                        have.push(s.url.port);
                    });

                    connectCount++;
                    should.ok(have[0] == port);
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


  it('joins url and servers', function(done) {
    var route_port = 54320;
    var port = 54321;
    // start a cluster of one server
    var ports = [];
    for (var i = 0; i < 10; i++) {
      ports.push(port + i);
    }

    // Add 5 of the servers we know. One added in the 'uri'
    var urls = [];
    for (i=1; i < 4; i++) {
        urls.push("nats://127.0.0.1:" + (port+i));
    }
    servers = nsc.start_cluster(ports, route_port, function() {

      var nc = NATS.connect({
        uri: "nats://127.0.0.1:" + port,
        reconnectTimeWait: 100,
        servers: urls
      });

      nc.on('connect', function (c) {
          c.servers.should.have.length(10);
          setTimeout(function() { c.close(); }, 0);
          done();
      });
    });
  });

  it('discovered servers', function(done) {
    var route_port = 12892;
    var port = 14526;
    var ports = [port, port+1, port+2];

    servers = nsc.start_cluster(ports, route_port, function() {
      var nc = NATS.connect({
        uri: "nats://127.0.0.1:" + port,
        reconnectTimeWait: 100,
        servers: ["nats://127.0.0.1:" + (port+1)]
      });

      function countImplicit(c) {
        var count = 0;
        c.servers.forEach(function(s) {
          if(s.implicit) {
            count++;
          }
        });
        return count;
      }

      nc.on('serversDiscovered', function() {
        if(countImplicit(nc) === 1) {
          var found = nc.servers.find(function(s) {
            return s.url.href === "nats://127.0.0.1:" + (port+3);
          });
          if(found) {
            done();
          }
        }
      });

      nc.on('connect', function() {
        nc.servers.should.have.length(3);
        countImplicit(nc).should.be.equal(1);

        // remove the implicit one
        process.nextTick(function() {
          var s2 = nsc.find_server(port + 2, servers);
          nsc.stop_server(s2, function () {
            // add another
            var added = nsc.add_member(port + 3, route_port, port + 1003);
            servers.push(added);
          });
        });
      });
    });
  });
});


