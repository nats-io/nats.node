/* jslint node: true */
/* global describe: false, before: false, after: false, it: false, afterEach: false, beforeEach: false */
/* jshint -W030 */

'use strict';

var NATS = require('../'),
    mockserver = require('./support/mock_server'),
    should = require('should');

describe('Ping Timer', function() {
    this.timeout(10000);
    var PORT = 1966;
    var server;

    before(function(done) {
        // default server simply sends connect and responds to one ping
        server = new mockserver.ScriptedServer(PORT);
        server.on('listening', done);
        server.start();
    });

    after(function(done){
        server.stop(done);
    });

    it('should reconnect if server doesnt ping', function(done){
        var nc = NATS.connect({
            port: PORT,
            pingInterval: 200,
            maxReconnectAttempts: 1
        });
        nc.on('reconnect', () => {
            nc.close();
            done();
        });
    });

    it('timer pings are sent', function(done) {
        var nc = NATS.connect({
            port: PORT,
            pingInterval: 200,
            maxPingOut: 5,
            maxReconnectAttempts: 1
        });

        var pingTimerFired = false;
        nc.on('pingtimer', () => {
            pingTimerFired = true;
        });

        nc.on('reconnect', () => {
            nc.close();
            should(pingTimerFired).be.true();
            done();
        });
    });


    it('configured number of missed pings is honored', function(done) {
        var nc = NATS.connect({
            port: PORT,
            pingInterval: 200,
            maxPingOut: 5,
            maxReconnectAttempts: 1
        });

        var maxOut = 0;
        nc.on('pingcount', (c) => {
            maxOut = Math.max(maxOut, c);
        });

        nc.on('reconnect', () => {
            should(maxOut).be.equal(5);
            nc.close();
            done();
        });
    });
});
