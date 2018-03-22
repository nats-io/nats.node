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

describe('Basics', function() {

    var PORT = 1423;
    var server;

    // Start up our own nats-server
    before(function (done) {
        server = nsc.start_server(PORT, done);
    });

    // Shutdown our server
    after(function (done) {
        nsc.stop_server(server, done);
    });

    it('should do basic subscribe and unsubscribe', function (done) {
        var nc = NATS.connect(PORT);
        var sid = nc.subscribe('foo');
        should.exist(sid);
        nc.unsubscribe(sid);
        nc.flush(function () {
            nc.close();
            done();
        });
    });

    it('should do basic publish', function (done) {
        var nc = NATS.connect(PORT);
        nc.publish('foo');
        nc.flush(function () {
            nc.close();
            done();
        });
    });

    it('should fire a callback for subscription', function (done) {
        var nc = NATS.connect(PORT);
        nc.subscribe('foo', function () {
            nc.close();
            done();
        });
        nc.publish('foo');
    });

    it('should include the correct message in the callback', function (done) {
        var nc = NATS.connect(PORT);
        var data = 'Hello World';
        nc.subscribe('foo', function (msg) {
            should.exist(msg);
            msg.should.equal(data);
            nc.close();
            done();
        });
        nc.publish('foo', data);
    });

    it('should include the correct reply in the callback', function (done) {
        var nc = NATS.connect(PORT);
        var data = 'Hello World';
        var inbox = nc.createInbox();
        nc.subscribe('foo', function (msg, reply) {
            should.exist(msg);
            msg.should.equal(data);
            should.exist(reply);
            reply.should.equal(inbox);
            nc.close();
            done();
        });
        nc.publish('foo', data, inbox);
    });

    it('should do request-reply', function (done) {
        var nc = NATS.connect(PORT);
        var initMsg = 'Hello World';
        var replyMsg = 'Hello Back!';

        nc.subscribe('foo', function (msg, reply) {
            should.exist(msg);
            msg.should.equal(initMsg);
            should.exist(reply);
            reply.should.match(/_INBOX\.*/);
            nc.publish(reply, replyMsg);
        });

        nc.request('foo', initMsg, function (reply) {
            should.exist(reply);
            reply.should.equal(replyMsg);
            nc.close();
            done();
        });
    });

    it('should return a sub id for requests', function (done) {
        var nc = NATS.connect(PORT);
        var initMsg = 'Hello World';
        var replyMsg = 'Hello Back!';
        var expected = 1;
        var received = 0;

        // Add two subscribers. We will only receive a reply from one.
        nc.subscribe('foo', function (msg, reply) {
            nc.publish(reply, replyMsg);
        });

        nc.subscribe('foo', function (msg, reply) {
            nc.publish(reply, replyMsg);
        });

        var sub = nc.request('foo', initMsg, function (reply) {
            nc.flush(function () {
                received.should.equal(expected);
                nc.close();
                done();
            });

            received += 1;
            nc.unsubscribe(sub);
        });
    });

    it('should do single partial wildcard subscriptions correctly', function (done) {
        var nc = NATS.connect(PORT);
        var expected = 3;
        var received = 0;
        nc.subscribe('*', function () {
            received += 1;
            if (received === expected) {
                nc.close();
                done();
            }
        });
        nc.publish('foo.baz'); // miss
        nc.publish('foo.baz.foo'); // miss
        nc.publish('foo');
        nc.publish('bar');
        nc.publish('foo.bar.3'); // miss
        nc.publish('baz');
    });

    it('should do partial wildcard subscriptions correctly', function (done) {
        var nc = NATS.connect(PORT);
        var expected = 3;
        var received = 0;
        nc.subscribe('foo.bar.*', function () {
            received += 1;
            if (received === expected) {
                nc.close();
                done();
            }
        });
        nc.publish('foo.baz'); // miss
        nc.publish('foo.baz.foo'); // miss
        nc.publish('foo.bar.1');
        nc.publish('foo.bar.2');
        nc.publish('bar');
        nc.publish('foo.bar.3');
    });

    it('should do full wildcard subscriptions correctly', function (done) {
        var nc = NATS.connect(PORT);
        var expected = 5;
        var received = 0;
        nc.subscribe('foo.>', function () {
            received += 1;
            if (received === expected) {
                nc.close();
                done();
            }
        });
        nc.publish('foo.baz');
        nc.publish('foo.baz.foo');
        nc.publish('foo.bar.1');
        nc.publish('foo.bar.2');
        nc.publish('bar'); // miss
        nc.publish('foo.bar.3');
    });

    it('should pass exact subject to callback', function (done) {
        var nc = NATS.connect(PORT);
        var subject = 'foo.bar.baz';
        nc.subscribe('*.*.*', function (msg, reply, subj) {
            should.exist(subj);
            subj.should.equal(subject);
            nc.close();
            done();
        });
        nc.publish(subject);
    });

    it('should do callback after publish is flushed', function (done) {
        var nc = NATS.connect(PORT);
        nc.publish('foo', function () {
            nc.close();
            done();
        });
    });

    it('should do callback after flush', function (done) {
        var nc = NATS.connect(PORT);
        nc.flush(function () {
            nc.close();
            done();
        });
    });

    it('should handle an unsubscribe after close of connection', function (done) {
        var nc = NATS.connect(PORT);
        var sid = nc.subscribe('foo');
        nc.close();
        nc.unsubscribe(sid);
        done();
    });

    it('should not receive data after unsubscribe call', function (done) {
        var nc = NATS.connect(PORT);
        var received = 0;
        var expected = 1;

        var sid = nc.subscribe('foo', function () {
            nc.unsubscribe(sid);
            received += 1;
        });

        nc.publish('foo');
        nc.publish('foo');
        nc.publish('foo', function () {
            received.should.equal(expected);
            nc.close();
            done();
        });
    });

    it('should pass sid properly to a message callback if requested', function (done) {
        var nc = NATS.connect(PORT);
        var sid = nc.subscribe('foo', function (msg, reply, subj, lsid) {
            sid.should.equal(lsid);
            nc.close();
            done();
        });
        nc.publish('foo');
    });

    it('should parse json messages', function (done) {
        var config = {
            port: PORT,
            json: true
        };
        var nc = NATS.connect(config);
        var jsonMsg = {
            key: true
        };
        nc.subscribe('foo1', function (msg) {
            msg.should.have.property('key').and.be.a.Boolean();
            nc.close();
            done();
        });
        nc.publish('foo1', jsonMsg);
    });

    it('should parse UTF8 json messages', function (done) {
        var config = {
            port: PORT,
            json: true
        };
        var nc = NATS.connect(config);
        var utf8msg = {
            key: 'CEDILA-Ç'
        };
        nc.subscribe('foo2', function (msg) {
            msg.should.have.property('key');
            msg.key.should.equal('CEDILA-Ç');
            nc.close();
            done();
        });
        nc.publish('foo2', utf8msg);
    });

    it('should validate json messages before publishing', function (done) {
        var config = {
            port: PORT,
            json: true
        };
        var nc = NATS.connect(config);
        var error;

        try {
            nc.publish('foo3', 'not JSON');
        } catch (e) {
            error = e;
        }
        if (!error) {
            nc.close();
            return done('Should not accept string as message when JSON switch is turned on');
        }

        try {
            nc.publish('foo3', 1);
        } catch (e) {
            error = e;
        }
        if (!error) {
            nc.close();
            return done('Should not accept number as message when JSON switch is turned on');
        }

        try {
            nc.publish('foo3', false);
        } catch (e) {
            error = e;
        }
        if (!error) {
            nc.close();
            return done('Should not accept boolean as message when JSON switch is turned on');
        }

        try {
            nc.publish('foo3', []);
        } catch (e) {
            error = e;
        }
        if (!error) {
            nc.close();
            return done('Should not accept array as message when JSON switch is turned on');
        }

        nc.close();
        done();
    });

    function requestOneGetsReply(nc, done) {
        var initMsg = 'Hello World';
        var replyMsg = 'Hello Back!';

        nc.subscribe('foo', function (msg, reply) {
            should.exist(msg);
            msg.should.equal(initMsg);
            should.exist(reply);
            reply.should.match(/_INBOX\.*/);
            nc.publish(reply, replyMsg);
        });

        var gotOne = false;
        nc.requestOne('foo', initMsg, null, 1000, function (reply) {
            should.exist(reply);
            reply.should.equal(replyMsg);
            if (!gotOne) {
                gotOne = true;
                nc.close();
                done();
            }
        });
    }

    it('should do requestone-get-reply', function (done) {
        var nc = NATS.connect(PORT);
        requestOneGetsReply(nc, done);
    });

    it('oldRequestOne should do requestone-get-reply', function (done) {
        var nc = NATS.connect({port: PORT, useOldRequestStyle: true});
        requestOneGetsReply(nc, done);
    });

    function requestOneWillUnsubscribe(nc, done) {
        var rsub = "x.y.z";
        var count = 0;

        nc.subscribe(rsub, function (msg, reply) {
            reply.should.match(/_INBOX\.*/);
            nc.publish(reply, "y");
            nc.publish(reply, "yy");
            nc.flush();
            setTimeout(function () {
                nc.publish(reply, "z");
                nc.flush();
                nc.close();
                setTimeout(function () {
                    count.should.equal(1);
                    nc.close();
                    done();
                }, 1000);
            }, 1500);
        });

        nc.requestOne(rsub, "", null, 1000, function (reply) {
            reply.should.not.be.instanceof(NATS.NatsError);
            should.exist(reply);
            count++;
        });
    }

    it('should do requestone-will-unsubscribe', function (done) {
        // eslint-disable-next-line
        this.timeout(3000);
        var nc = NATS.connect(PORT);
        requestOneWillUnsubscribe(nc, done);
    });

    it('oldRequest: should do requestone-will-unsubscribe', function (done) {
        // eslint-disable-next-line
        this.timeout(3000);
        var nc = NATS.connect({port: PORT, useOldRequestStyle: true});
        requestOneWillUnsubscribe(nc, done);
    });

    function requestTimeoutTest(nc, done) {
        nc.requestOne('a.b.c', '', null, 1000, function (reply) {
            should.exist(reply);
            reply.should.be.instanceof(NATS.NatsError);
            reply.should.have.property('code', NATS.REQ_TIMEOUT);
            nc.close();
            done();
        });
    }

    it('should do requestone-can-timeout', function (done) {
        var nc = NATS.connect(PORT);
        requestTimeoutTest(nc, done);
    });

    it('old request one - should do requestone-can-timeout', function (done) {
        var nc = NATS.connect({port: PORT, useOldRequestStyle: true});
        requestTimeoutTest(nc, done);
    });

    function shouldUnsubscribeWhenRequestOneTimeout(nc, done) {
        var replies = 0;
        var responses = 0;
        // set a subscriber to respond to the request
        nc.subscribe('a.b.c', {
            max: 1
        }, function (msg, reply) {
            setTimeout(function () {
                nc.publish(reply, '');
                nc.flush();
                replies++;
            }, 500);
        });

        // request one - we expect a timeout
        nc.requestOne('a.b.c', '', null, 250, function (reply) {
            reply.should.be.instanceof(NATS.NatsError);
            reply.should.have.property('code', NATS.REQ_TIMEOUT);
            if (!reply.hasOwnProperty('code')) {
                responses++;
            }
        });

        // verify reply was sent, but we didn't get it
        setTimeout(function () {
            should(replies).equal(1);
            should(responses).equal(0);
            nc.close();
            done();
        }, 1000);
    }

    it('should unsubscribe when request one timesout', function (done) {
        // eslint-disable-next-line
        this.timeout(3000);
        var nc = NATS.connect(PORT);
        shouldUnsubscribeWhenRequestOneTimeout(nc, done);
    });

    it('old requestOne should unsubscribe when request one timesout', function (done) {
        // eslint-disable-next-line
        this.timeout(3000);
        var nc = NATS.connect({port: PORT, useOldRequestStyle: true});
        shouldUnsubscribeWhenRequestOneTimeout(nc, done);
    });

    it('requestone has negative sids', function (done) {
        var nc = NATS.connect(PORT);
        nc.flush(function() {
            var sid = nc.requestOne("121.2.13.4", 1000, function(r) {
                should.fail("got message when it shouldn't have", r);
            });
            sid.should.be.number;
            sid.should.be.below(0);

            // this cancel returns the config
            var conf = nc.respmux.cancelMuxRequest(sid);

            // after cancel it shouldn't exit
            nc.respmux.requestMap.should.not.have.ownProperty(conf.token);
            nc.close();
            done();
        });
    });

    function paramTranspositions(nc, done) {
        var all = false;
        var four = false;
        var three = true;
        var count = 0;
        nc.flush(function() {
            nc.requestOne("a", NATS.EMPTY, {}, 1, function() {
                all = true;
                called();
            });

            nc.requestOne("b", NATS.EMPTY, 1, function() {
                four = true;
                called();
            });

            nc.requestOne("b", 1, function() {
                three = true;
                called();
            });
        });

        function called() {
            count++;
            if(count === 3) {
                all.should.be.true();
                four.should.be.true();
                three.should.be.true();
                nc.close();
                done();
            }
        }
    }

    it('requestOne: optional param transpositions', function (done) {
        var nc = NATS.connect(PORT);
        paramTranspositions(nc, done);
    });

    it('old requestOne: optional param transpositions', function (done) {
        var nc = NATS.connect({port: PORT, useOldRequestStyle: true});
        paramTranspositions(nc, done);
    });
});
