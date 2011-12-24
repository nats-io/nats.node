var NATS = require ('../'),
    spawn = require('child_process').spawn;

var PORT = 1421;
var uri = 'nats://localhost:' + PORT;

describe('Basic Connectivity', function() {

  var server;

  // Start up our own nats-server
  before(function(done) {
    server = spawn('nats-server',['-p', PORT]);
    var timer = setTimeout(done, 500);
    server.on('exit', function(code) {
      if (code !== 0) {
	clearTimeout(timer);
	console.log("Server exited with code: ", code);
	done(new Error("Can't find the nats-server (e.g. gem install nats)"));
      }
    });
  });

  // Shutdown our server after we are done
  after(function(){
    server.on('exit', function(){});
    server.kill();
  });


  it('should perform basic connect with port', function(){
    var nc = NATS.connect(PORT);
    nc.should.exist;
    nc.close();
  });

  it('should perform basic connect with uri', function(){
    var nc = NATS.connect(uri);
    nc.should.exist;
    nc.close();
  });

  it('should perform basic connect with options arg', function(){
    var options = { 'uri' : uri };
    var nc = NATS.connect(options);
    nc.should.exist;
    nc.close();
  });

  it('should emit a connect event', function(done){
    var nc = NATS.connect(PORT);
    nc.on('connect', function(client) {
      client.should.equal(nc);
      nc.close();
      done();
    });
  });

  it('should emit error if no server available', function(done){
    var nc = NATS.connect('nats://localhost:22222');
    nc.on('error', function() {
      nc.close();
      done();
    });
  });

});
