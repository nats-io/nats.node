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

'use strict';

const NATS = require('../'),
    should = require('should');

describe('shifter', function() {
    it('should handle empty', () => {
        const a = new Array(0);
        const b = NATS.callbackShifter(0, a);
        b.should.have.length(0);
    });

    it('should handle just fun', () => {
        const a  = [function () {}];
        const b = NATS.callbackShifter(10, a);
        b.should.have.length(10);
        for(let i=0; i < 8; i++) {
            (b[i] === undefined).should.be.true();
        }
        const v = typeof b[9];
        v.should.be.equal('function');
    });

    it('should handle all', () => {
        const a = ['a', '1', function () {}];
        const b = NATS.callbackShifter(3, a);
        should.deepEqual(a, b);
    });

    it('should handle holes', () => {
        const a = ['a', '1', undefined, function () {}];
        const b = NATS.callbackShifter(4, a);
        should.deepEqual(a, b);
    });
});
