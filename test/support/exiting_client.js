#!/usr/bin/env node

/* jslint node: true */
'use strict';

const NATS = require('../..');
const fs = require('fs');

var count = process.argv.length;
var port = parseInt(process.argv[count-1], 10);
var nats = NATS.connect({port: port});


nats.on('connect', function() {
    fs.writeFile('/tmp/existing_client.log', 'connected\n')
});




/* eslint-disable no-console */
/* eslint-disable no-process-exit */

nats.on('error', function(e) {
    fs.appendFile('/tmp/existing_client.log', 'got error\n' + e);
    process.exit(1);
});

nats.subscribe("close", function(msg, replyTo) {
    fs.appendFile('/tmp/existing_client.log', 'got close\n');
    if(replyTo) {
        nats.publish(replyTo, "closing");
    }
    nats.flush(function() {
        nats.close();
        fs.appendFile('/tmp/existing_client.log', 'closed\n');
    });
});

nats.flush(function() {
    nats.publish("started", "");
});
