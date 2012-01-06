#!/usr/bin/env node

var nats = require ('nats').connect();

nats.on('error', function(exception) {
  console.log("Can't connect to the nats-server [" + nats.options.url + "] is it running?");
});

var subject = process.argv[2];

if (subject == undefined) {
  console.log('Usage: node-sub <subject>');
  process.exit();
}

console.log('Listening on [' + subject + ']');

nats.subscribe(subject, function(msg) {
  console.log("Received '" + msg + "'");
});
