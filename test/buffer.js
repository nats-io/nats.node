/* jslint node: true */
/* global describe: false, before: false, after: false, it: false */
'use strict';

var NATS = require('../'),
    nsc = require('./support/nats_server_control'),
    should = require('should');

describe('Buffer', function () {

    var PORT = 1432;
    var server;

    // Start up our own nats-server
    before(function (done) {
        server = nsc.start_server(PORT, done);
    });

    // Shutdown our server
    after(function () {
        server.kill();
    });

    it('should allow sending and receiving raw buffers', function (done) {
        var nc = NATS.connect({
            'url': 'nats://localhost:' + PORT,
            'preserveBuffers': true
        });

        var validBuffer = new Buffer('foo-bar');

        nc.subscribe('validBuffer', function (msg) {

            should(validBuffer.equals(msg)).equal(true);
            nc.close();
            done();
        });

        nc.publish('validBuffer', validBuffer);

    });

    it('should allow parsing raw buffers to json', function (done) {
        var nc = NATS.connect({
            'url': 'nats://localhost:' + PORT,
            'preserveBuffers': true,
            'json': true
        });

        var jsonString = '{ "foo-bar": true }';
        var validBuffer = new Buffer(jsonString);

        nc.subscribe('validBuffer', function (msg) {

            msg.should.eql({ "foo-bar": true });
            nc.close();
            done();
        });

        nc.publish('validBuffer', validBuffer);

    });
});