/*
 * Copyright 2013-2018 The NATS Authors
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

var NATS = require('../'),
    nsc = require('./support/nats_server_control'),
    should = require('should');

describe('Callbacks', function() {

    var PORT = 1429;
    var server;

    // Start up our own nats-server
    before(function(done) {
        server = nsc.start_server(PORT, done);
    });

    // Shutdown our server
    after(function(done) {
        nsc.stop_server(server, done);
    });

    it('should properly do a publish callback after connection is closed', function(done) {
        var nc = NATS.connect(PORT);
        nc.close();
        nc.publish('foo', function(err) {
            should.exist(err);
            done();
        });
    });

    it('should properly do a flush callback after connection is closed', function(done) {
        var nc = NATS.connect(PORT);
        nc.close();
        nc.flush(function(err) {
            should.exist(err);
            done();
        });
    });

    it('request callbacks have message and reply', function(done) {
      var nc = NATS.connect(PORT);
      nc.flush(function() {
          nc.subscribe("rr", function(msg, reply) {
              nc.publish(reply, "data", "foo");
          });
      });

      nc.flush(function() {
          nc.requestOne("rr", 5000, function(msg, reply) {
              if(msg instanceof NATS.NatsError) {
                  nc.close();
                  done("Error making request", msg);
                  return;
              }
              msg.should.be.equal("data");
              reply.should.be.equal("foo");
              nc.close();
              done();
          });
      });
    });
});
