const nats = require('nats').connect();

nats.on('error', function (e) {
    console.log('Error [' + nats.options.url + ']: ' + e);
    process.exit();
});

nats.on('close', function () {
    console.log('CLOSED');
    process.exit();
});

const subject = 'my_subject';

console.log('Listening on [' + subject + ']');

nats.subscribe(subject, {'queue': "my_queue"}, function (msg, replyTo) {
    console.log(subject, 'Received "' + msg + '"');
    nats.publish(replyTo, 'I can help!');
});