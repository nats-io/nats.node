
var NATS = require ('../');

describe('Base Properties', function() {

  it('should have a version property', function() {
    NATS.version.should.match(/[0-9]+\.[0-9]+\.[0-9]+/);
  });

  it('should have a connect function', function() {
    NATS.connect.should.be.a('function');
  });

  it('should have a createInbox function', function() {
    NATS.createInbox.should.be.a('function');
  });

});

describe('Connection Properties', function() {

  var nc = NATS.connect();
  nc.should.exist;

  it('should have a publish function', function() {
    nc.publish.should.be.a('function');
  });

  it('should have a subscribe function', function() {
    nc.subscribe.should.be.a('function');
  });

  it('should have an unsubscribe function', function() {
    nc.unsubscribe.should.be.a('function');
  });

  it('should have a request function', function() {
    nc.request.should.be.a('function');
  });

  nc.close();

});
