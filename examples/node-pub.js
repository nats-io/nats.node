#!/usr/bin/env node

var NATS = require ('nats').connect();

NATS.on('error', function(exception) {
  console.log("Can't connect to the nats-server [" + NATS.server + "] is it running?");
});

var subject = process.argv[2];
var msg = process.argv[3] || '';

if (subject == undefined) {
  console.log('Usage: node-pub <subject> <msg> [-s server]');
  process.exit();
}

NATS.publish(subject, msg, function() {
  console.log("Published [" + subject + "] : '" + msg + "'");
  NATS.close();
});

