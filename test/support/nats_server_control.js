/* jslint node: true */
'use strict';

var spawn = require('child_process').spawn;
var net = require('net');
var fs = require('fs');
var path = require('path');
var os = require('os');

var SERVER = (process.env.TRAVIS) ? 'gnatsd/gnatsd' : 'gnatsd';
var DEFAULT_PORT = 4222;

console.log(path.resolve(os.tmpdir(), 'test_ports.txt'));

// select some random start port between 40000 and 50000
var next = 40000;
//Math.floor(Math.random()*(50000-40000+1)+40000);
function alloc_next_port(n) {
    if(n < 1) {
        throw new Error("illegal number of ports");
    }
    if(n === undefined || n === 1) {
        return next++;
    }
    var a = [];
    for(var i=0; i < n; i++) {
        a.push(next++);
    }
    return a;
}

function log(port, extra) {
    var lines = new Error('debug').stack.split('\n');
    lines = lines.filter(function(s) {
        return s.indexOf('/nats-io/node-nats/test') > -1;
    });

    var ctx = lines[lines.length-1];
    ctx = ctx.substr(ctx.lastIndexOf('/')+1);
    ctx = ctx.substr(0, ctx.length-1);

    extra = extra || '';
    var cf = path.resolve(os.tmpdir(), 'test_ports.txt');
    fs.appendFileSync(cf, port + ' ' + extra + ' ' + ctx + '\n');
}

function printLog() {
    var cf = path.resolve(os.tmpdir(), 'test_ports.txt');
    fs.readFile(cf, 'utf8', function(err, data){
        if(err){
            console.log('Error reading log', err);
            return;
        }
        console.og(data);
    });
}

exports.printLog = printLog;

exports.alloc_next_port = alloc_next_port;

function start_server(port, opt_flags, done) {
    if (!port) {
        port = DEFAULT_PORT;
    }

    if (typeof opt_flags == 'function') {
        done = opt_flags;
        opt_flags = null;
    }
    var flags = ['-p', port, '-a', 'localhost'];

    if (opt_flags) {
        flags = flags.concat(opt_flags);
    }

    log(port + ' ' + JSON.stringify(flags));

    if (process.env.PRINT_LAUNCH_CMD) {
        console.log(flags.join(" "));
    }

    var server = spawn(SERVER, flags);

    var start = new Date();
    var wait = 0;
    var maxWait = 5 * 1000; // 5 secs
    var delta = 250;
    var socket;
    var timer;

    var resetSocket = function() {
        if (socket !== undefined) {
            socket.removeAllListeners();
            socket.destroy();
            socket = undefined;
        }
    };

    var finish = function(err) {
        resetSocket();
        if (timer !== undefined) {
            clearInterval(timer);
            timer = undefined;
        }
        if (done) {
            done(err);
        }
    };

    // Test for when socket is bound.
    timer = setInterval(function() {
        resetSocket();

        wait = new Date() - start;
        if (wait > maxWait) {
            finish(new Error('Can\'t connect to server on port: ' + port));
        }

        // Try to connect to the correct port.
        socket = net.createConnection(port);

        // Success
        socket.on('connect', function() {
            if (server.pid === null) {
                // We connected but not to our server..
                finish(new Error('Server already running on port: ' + port));
            } else {
                finish();
            }
        });

        // Wait for next try..
        socket.on('error', function(error) {
            finish(new Error("Problem connecting to server on port: " + port + " (" + error + ")"));
        });

    }, delta);

    // Other way to catch another server running.
    server.on('exit', function(code, signal) {
        if (code === 1) {
            finish(new Error('Server exited with bad code, already running? (' + code + ' / ' + signal + ')' + ' port: ' + port));
        }
    });

    // Server does not exist..
    server.stderr.on('data', function(data) {
        if (/^execvp\(\)/.test(data)) {
            clearInterval(timer);
            finish(new Error('Can\'t find the ' + SERVER));
        }
    });

    return server;
}

exports.start_server = start_server;

function stop_server(server) {
    if (server !== undefined) {
        server.kill();
    }
}

exports.stop_server = stop_server;

// starts a number of servers in a cluster at the specified ports.
// must call with at least one port.
function start_cluster(ports, route_port, opt_flags, done) {
    if (typeof opt_flags == 'function') {
        done = opt_flags;
        opt_flags = null;
    }
    var servers = [];
    var started = 0;
    var server = add_member(ports[0], route_port, route_port, opt_flags, function(err) {
        if(err) {

            done(err);
        }
        started++;
        servers.push(server);
        if (started === ports.length) {
            done();
        }
    });

    var others = ports.slice(1);
    others.forEach(function(p) {
        var s = add_member(p, route_port, alloc_next_port(), opt_flags, function(err) {
            if(err) {
                done(err);
            }
            started++;
            servers.push(s);
            if (started === ports.length) {
                done();
            }
        });
    });
    return servers;
}

// adds more cluster members, if more than one server is added additional
// servers are added after the specified delay.
function add_member_with_delay(ports, route_port, delay, opt_flags, done) {
    if (typeof opt_flags == 'function') {
        done = opt_flags;
        opt_flags = null;
    }
    var servers = [];
    ports.forEach(function(p, i) {
        setTimeout(function() {
            var s = add_member(p, route_port, alloc_next_port(), opt_flags, function(err) {
                if(err) {
                    done(err);
                }
                servers.push(s);
                if (servers.length === ports.length) {
                    done();
                }
            });
        }, i * delay);
    });

    return servers;
}
exports.add_member_with_delay = add_member_with_delay;

function add_member(port, route_port, cluster_port, opt_flags, done) {
    if (typeof opt_flags == 'function') {
        done = opt_flags;
        opt_flags = null;
    }
    opt_flags = opt_flags || [];
    var opts = JSON.parse(JSON.stringify(opt_flags));
    opts.push('--routes', 'nats://localhost:' + route_port);
    opts.push('--cluster', 'nats://localhost:' + cluster_port);

    return start_server(port, opts, done);
}

exports.start_cluster = start_cluster;
exports.add_member = add_member;

exports.stop_cluster = function(servers) {
    servers.forEach(function(s) {
        stop_server(s);
    });
};
