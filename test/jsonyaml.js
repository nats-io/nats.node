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

const u = require('./support/nats_conf_utils'),
    should = require('should');


describe('NATS Conf Utils', function() {
    it('test serializing simple', function() {
        const x = {
            test: 'one'
        };
        const y = u.j(x);

        const buf = y.split('\n');
        buf.forEach(function(e, i) {
            buf[i] = e.trim();
        });

        const z = buf.join(' ');
        should(z).be.equal("test: one");
    });

    it('test serializing nested', function() {
        const x = {
            a: 'one',
            b: {
                a: 'two'
            }
        };
        const y = u.j(x);

        const buf = y.split('\n');
        buf.forEach(function(e, i) {
            buf[i] = e.trim();
        });

        const z = buf.join(' ');
        should(z).be.equal("a: one b { a: two }");
    });

    it('test serializing array', function() {
        const x = {
            a: 'one',
            b: ['a', 'b', 'c']
        };
        const y = u.j(x);

        const buf = y.split('\n');
        buf.forEach(function(e, i) {
            buf[i] = e.trim();
        });

        const z = buf.join(' ');
        should(z).be.equal("a: one b [ a b c ]");
    });

    it('test serializing array objs', function() {
        const x = {
            a: 'one',
            b: [{
                a: 'a'
            }, {
                b: 'b'
            }, {
                c: 'c'
            }]
        };
        const y = u.j(x);
        const buf = y.split('\n');
        buf.forEach(function(e, i) {
            buf[i] = e.trim();
        });

        const z = buf.join(' ');
        should(z).be.equal("a: one b [ { a: a } { b: b } { c: c } ]");
    });

    it('test serializing array arrays', function() {
        const x = {
            a: 'one',
            b: [{
                a: 'a',
                b: ['b', 'c']
            }, {
                b: 'b'
            }, {
                c: 'c'
            }]
        };
        const y = u.j(x);
        const buf = y.split('\n');
        buf.forEach(function(e, i) {
            buf[i] = e.trim();
        });

        const z = buf.join(' ');
        should(z).be.equal("a: one b [ { a: a b [ b c ] } { b: b } { c: c } ]");
    });
});
