/*
 * Copyright 2013-2018 The NATS Authors
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/* jslint node: true */
'use strict';

var spawn = require('child_process').spawn;
var net = require('net');

var SERVER = (process.env.TRAVIS) ? 'gnatsd/gnatsd' : 'gnatsd';
var DEFAULT_PORT = 4222;

function start_server(port, opt_flags, done) {
    if (!port) {
        port = DEFAULT_PORT;
    }
    if (typeof opt_flags == 'function') {
        done = opt_flags;
        opt_flags = null;
    }
    var flags = ['-p', port, '-a', '127.0.0.1'];

    if (opt_flags) {
        flags = flags.concat(opt_flags);
    }


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
            finish(new Error('Server exited with bad code, already running? (' + code + ' / ' + signal + ')'));
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

function wait_stop(server, done) {
    if(server.killed) {
        if(done) {
            done();
        }
    } else {
        setTimeout(function () {
            wait_stop(server, done);
        });
    }
}

function stop_server(server, done) {
    if (server) {
        server.kill();
        wait_stop(server, done);
    } else if(done) {
        done();
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
    var server = add_member(ports[0], route_port, route_port, opt_flags, function() {
        started++;
        servers.push(server);
        if (started === ports.length) {
            done();
        }
    });

    var others = ports.slice(1);
    others.forEach(function(p) {
        var s = add_member(p, route_port, p + 1000, opt_flags, function() {
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
            var s = add_member(p, route_port, p + 1000, opt_flags, function() {
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

exports.stop_cluster = function(servers, done) {
    var count = servers.length;
    function latch() {
        count--;
        if(count === 0) {
            done();
        }
    }
    servers.forEach(function(s) {
        stop_server(s, latch);
    });
};

exports.find_server = function(port, servers) {
  return servers.find(function(s) {
    return s.spawnargs[2] === port;
  });
};
