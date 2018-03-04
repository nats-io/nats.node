/* jslint node: true */
/* global describe: false, before: false, after: false, it: false */
'use strict';

var NATS = require('../'),
    nsc = require('./support/nats_server_control'),
    child_process = require('child_process'),
    should = require('should');

describe('Close functionality', function() {

    var PORT = 8459;
    var server;

    // Start up our own nats-server
    before(function(done) {
        server = nsc.start_server(PORT, done);
    });

    // Shutdown our server after we are done
    after(function(done) {
        nsc.stop_server(server, done);
    });

    it('close quickly', function(done) {
        var nc = NATS.connect({
            port: PORT
        });


        var timer;

        nc.flush(function() {
           nc.subscribe("started", function(m) {
               nc.publish("close");
           });
            timer = setTimeout(function() {
                done(new Error("process didn't exit quickly"));
            }, 10000);
        });

        var child = child_process.execFile('node', ['./test/support/exiting_client.js', PORT], function(error) {
            if(error) {
                nc.close();
                done(error);
            }
        });

        child.on('exit', function(code, signal) {
            if(timer) {
                clearTimeout(timer);
                timer = null;
            }
            nc.close();
            if(code !== 0) {
                done("Process didn't return a zero code: ", code, signal);
            } else {
                done();
            }
        });
    });
});
