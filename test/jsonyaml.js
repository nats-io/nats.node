/*
 * Copyright 2013-2020 The NATS Authors
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
/* jshint -W030 */
'use strict'

const u = require('./support/nats_conf_utils')
const should = require('should')
const describe = require('mocha').describe
const it = require('mocha').it

describe('NATS Conf Utils', () => {
  it('test serializing simple', () => {
    const x = {
      test: 'one'
    }
    const y = u.j(x)

    const buf = y.split('\n')
    buf.forEach((e, i) => {
      buf[i] = e.trim()
    })

    const z = buf.join(' ')
    should(z).be.equal('test: one')
  })

  it('test serializing nested', () => {
    const x = {
      a: 'one',
      b: {
        a: 'two'
      }
    }
    const y = u.j(x)

    const buf = y.split('\n')
    buf.forEach((e, i) => {
      buf[i] = e.trim()
    })

    const z = buf.join(' ')
    should(z).be.equal('a: one b { a: two }')
  })

  it('test serializing array', () => {
    const x = {
      a: 'one',
      b: ['a', 'b', 'c']
    }
    const y = u.j(x)

    const buf = y.split('\n')
    buf.forEach((e, i) => {
      buf[i] = e.trim()
    })

    const z = buf.join(' ')
    should(z).be.equal('a: one b [ a b c ]')
  })

  it('test serializing array objs', () => {
    const x = {
      a: 'one',
      b: [{
        a: 'a'
      }, {
        b: 'b'
      }, {
        c: 'c'
      }]
    }
    const y = u.j(x)
    const buf = y.split('\n')
    buf.forEach((e, i) => {
      buf[i] = e.trim()
    })

    const z = buf.join(' ')
    should(z).be.equal('a: one b [ { a: a } { b: b } { c: c } ]')
  })

  it('test serializing array arrays', () => {
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
    }
    const y = u.j(x)
    const buf = y.split('\n')
    buf.forEach((e, i) => {
      buf[i] = e.trim()
    })

    const z = buf.join(' ')
    should(z).be.equal('a: one b [ { a: a b [ b c ] } { b: b } { c: c } ]')
  })
})
