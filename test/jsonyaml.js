/* jslint node: true */
/* global describe: false, before: false, after: false, it: false, afterEach: false, beforeEach: false */
/* jshint -W030 */
'use strict';

var u = require('./support/nats_conf_utils'),
    should = require('should');


describe('NATS Conf Utils', function() {
    it('test serializing simple', function() {
        var x = {test: 'one'};
        var y = u.JsonToYaml(x);

        var buf = y.split('\n');
        buf.forEach(function(e, i) {
            buf[i] = e.trim();
        });

        var z = buf.join(' ');
        should(z).be.equal("test: one");
    });

    it('test serializing nested', function() {
        var x = {a: 'one', b: {a: 'two'}};
        var y = u.JsonToYaml(x);

        var buf = y.split('\n');
        buf.forEach(function(e, i) {
            buf[i] = e.trim();
        });

        var z = buf.join(' ');
        should(z).be.equal("a: one b { a: two }");
    });

    it('test serializing array', function() {
        var x = {a: 'one', b: ['a', 'b', 'c']};
        var y = u.JsonToYaml(x);

        var buf = y.split('\n');
        buf.forEach(function(e, i) {
            buf[i] = e.trim();
        });

        var z = buf.join(' ');
        should(z).be.equal("a: one b [ a b c ]");
    });

    it('test serializing array objs', function() {
        var x = {a: 'one', b: [{a: 'a'}, {b: 'b'}, {c: 'c'}]};
        var y = u.JsonToYaml(x);
        var buf = y.split('\n');
        buf.forEach(function(e, i) {
            buf[i] = e.trim();
        });

        var z = buf.join(' ');
        should(z).be.equal("a: one b [ { a: a } { b: b } { c: c } ]");
    });

    it('test serializing array arrays', function() {
        var x = {a: 'one', b: [{a: 'a', b: ['b', 'c']}, {b: 'b'}, {c: 'c'}]};
        var y = u.JsonToYaml(x);
        var buf = y.split('\n');
        buf.forEach(function(e, i) {
            buf[i] = e.trim();
        });

        var z = buf.join(' ');
        should(z).be.equal("a: one b [ { a: a b [ b c ] } { b: b } { c: c } ]");
    });
});