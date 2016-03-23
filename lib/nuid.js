/*!
 * Nats
 * Copyright(c) 2016 Apcera Inc. All rights reserved.
 * MIT Licensed
 */

/* jslint node: true */
'use strict';

/**
 * Module Dependencies
 */

var crypto = require('crypto');

/**
 * Constants
 */

var digits   = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    base     = 36,
    preLen   = 12,
    seqLen   = 10,
    maxSeq   = 3656158440062976,  // base^seqLen == 36^10
    minInc   = 33,
    maxInc   = 333,
    totalLen = preLen + seqLen;

/**
 * Create and initialize a nuid.
 *
 * @api private
 */

function Nuid() {
  this.buf = new Buffer(totalLen);
  this.init();
}

/**
 * Initializes a nuid with a crypto random prefix,
 * and pseudo-random sequence and increment.
 *
 * @api private
 */

Nuid.prototype.init = function() {
  this.setPre();
  this.initSeqAndInc();
  this.fillSeq();
};

/**
 * Initializes the pseudo randmon sequence number and the increment range.
 *
 * @api private
 */

Nuid.prototype.initSeqAndInc = function() {
  this.seq = Math.floor(Math.random()*maxSeq);
  this.inc = Math.floor(Math.random()*(maxInc-minInc)+minInc);
};

/**
 * Sets the prefix from crypto random bytes. Converts to base36.
 *
 * @api private
 */

Nuid.prototype.setPre = function() {
  var cbuf = crypto.randomBytes(preLen);
  for (var i = 0; i < preLen; i++) {
    var di = cbuf[i]%base;
    this.buf[i] = digits.charCodeAt(di);
  }
};

/**
 * Fills the sequence part of the nuid as base36 from this.seq.
 *
 * @api private
 */

Nuid.prototype.fillSeq = function() {
  var n = this.seq;
  for (var i = totalLen-1; i >= preLen; i--) {
    this.buf[i] = digits.charCodeAt(n%base);
    n = Math.floor(n/base);
  }
};

/**
 * Returns the next nuid.
 *
 * @api private
 */

Nuid.prototype.next = function() {
  this.seq += this.inc;
  if (this.seq > maxSeq) {
    this.initSeqAndInc();
  }
  this.fillSeq();
  return (this.buf.toString('ascii'));
};

/* Global Nuid */
var g = new Nuid();

/**
 * Resets the prefix of the global nuid, as well as the
 * pseudo random sequence number and increment amounts.
 *
 * @api public
 */

exports.reset = function() {
  g.init();
};

/**
 * Returns the next nuid from the global.
 *
 * @api public
 */

exports.next = function() {
  return g.next();
};
