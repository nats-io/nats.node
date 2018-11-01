const NATS = require('nats');
const nats = require('nats').connect();

nats.on('error', function (e) {
    console.log('Error [' + nats.options.url + ']: ' + e);
    process.exit();
});

const subject = 'my_subject';
const msg = 'Random message ' + Math.floor(Math.random() * 10000);

console.log('Request a message', msg);

nats.publish(subject, msg, function() {
    console.log('Published [' + subject + '] : "' + msg + '"');
    process.exit();
});