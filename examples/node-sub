#!/usr/bin/env node

/* jslint node: true */
'use strict';

var nats = require ('nats').connect();

nats.on('error', function(/*exception*/) {
  console.log('Can\'t connect to the nats-server [' + nats.options.url + '] is it running?');
});

var subject = process.argv[2];

if (!subject) {
  console.log('Usage: node-sub <subject>');
  process.exit();
}

console.log('Listening on [' + subject + ']');

nats.subscribe(subject, function(msg) {
  console.log('Received "' + msg + '"');
});