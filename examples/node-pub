#!/usr/bin/env node

/* jslint node: true */
'use strict';

var nats = require ('nats').connect();

nats.on('error', function(/*exception*/) {
  console.log('Can\'t connect to the nats-server [' + nats.options.url + '] is it running?');
});

var subject = process.argv[2];
var msg = process.argv[3] || '';

if (!subject) {
  console.log('Usage: node-pub <subject> [msg]');
  process.exit();
}

nats.publish(subject, msg, function() {
  console.log('Published [' + subject + '] : "' + msg + '"');
  process.exit();
});