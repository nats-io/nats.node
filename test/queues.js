var NATS = require ('../'),
nsc = require('./support/nats_server_control');

describe('Queues', function() {

  var PORT = 1421;
  var server;

  // Start up our own nats-server
  before(function(done) {
    server = nsc.start_server(PORT, done);
  });

  // Shutdown our server
  after(function() {
    server.kill();
  });

  it('should deliver a message to single member of a queue group', function(done) {
    var nc = NATS.connect(PORT);
    var received = 0;
    nc.subscribe('foo', {'queue':'myqueue'}, function() {
      received += 1;
    });
    nc.publish('foo', function() {
      received.should.equal(1);
      nc.close();
      done();
    });
  });

  it('should deliver a message to only one member of a queue group', function(done) {
    var nc = NATS.connect(PORT);
    var received = 0;
    cb = function() { received += 1; };
    for (var i=0; i<5; i++) {
      nc.subscribe('foo', {'queue':'myqueue'}, cb);
    }
    nc.publish('foo', function() {
      received.should.equal(1);
      nc.close();
      done();
    });
  });

  it('should allow queue subscribers and normal subscribers to work together', function(done) {
    var nc = NATS.connect(PORT);
    var received = 0;
    nc.subscribe('foo', {'queue':'myqueue'}, function() { received += 1; });
    nc.subscribe('foo', function() { received += 1; });
    nc.publish('foo');
    nc.publish('foo');
    nc.flush(function() {
      received.should.equal(4);
      nc.close();
      done();
    });
  });

  it('should spread messages out equally (given random)', function(done) {
    /* jshint loopfunc: true */
    var nc = NATS.connect(PORT);
    var total = 5000;
    var numSubscribers = 10;
    var avg = total / numSubscribers;
    var allowedVariance = total * 0.05;
    var received = new Array(numSubscribers);

    for (var i=0; i<numSubscribers; i++) {
      received[i] = 0;
      nc.subscribe('foo.bar', {'queue':'spreadtest' }, function(index) {
        return function() { received[index] += 1; };
      }(i));
    }

    for (i=0; i<total; i++) { nc.publish('foo.bar', 'ok'); }

    nc.flush(function() {
      for (var i=0; i<numSubscribers; i++) {
        Math.abs(received[i]-avg).should.be.below(allowedVariance);
      }
      nc.close();
      done();
    });
  });

  it('should deliver only one mesage to queue subscriber regardless of wildcards', function(done) {
    var nc = NATS.connect(PORT);
    var received = 0;
    nc.subscribe('foo.bar', {'queue':'wcqueue'}, function() { received += 1; });
    nc.subscribe('foo.*', {'queue':'wcqueue'}, function() { received += 1; });
    nc.subscribe('foo.>', {'queue':'wcqueue'}, function() { received += 1; });
    nc.publish('foo.bar', function() {
      received.should.equal(1);
      nc.close();
      done();
    });
  });

  it('should deliver to multiple queue groups', function(done) {
    var nc = NATS.connect(PORT);
    var received1 = 0;
    var received2 = 0;
    var num = 10;

    nc.subscribe('foo.bar', {'queue':'r1'}, function() { received1 += 1; });
    nc.subscribe('foo.bar', {'queue':'r2'}, function() { received2 += 1; });

    for (var i=0; i<num; i++) { nc.publish('foo.bar'); }

    nc.flush(function() {
      received1.should.equal(num);
      received2.should.equal(num);
      nc.close();
      done();
    });
  });

});
