/*
 * Copyright 2013-2019 The NATS Authors
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
import {
    connect,
    BAD_AUTHENTICATION,
    BAD_CREDS,
    BAD_JSON,
    BAD_MSG,
    BAD_OPTIONS,
    BAD_REPLY,
    BAD_SUBJECT,
    CLIENT_CERT_REQ,
    CONN_CLOSED,
    CONN_DRAINING,
    CONN_ERR,
    INVALID_ENCODING,
    NATS_PROTOCOL_ERR,
    NKEY_OR_JWT_REQ,
    NO_ECHO_NOT_SUPPORTED,
    NO_SEED_IN_CREDS,
    NO_USER_JWT_IN_CREDS,
    NON_SECURE_CONN_REQ,
    OPENSSL_ERR,
    PERMISSIONS_ERR,
    REQ_TIMEOUT,
    SECURE_CONN_REQ,
    SIGCB_NOTFUNC,
    SIGNATURE_REQUIRED,
    STALE_CONNECTION_ERR,
    SUB_DRAINING
} from '..';

const dnc = connect();
const nc = connect("localhost:4222");
const pnc = connect(4222);
const opnc = connect({
    url: "localhost:4222",
});
const mnc = connect("localhost", {
    maxReconnectAttempts: -1
});

const mnc2 = connect(4222, {
    maxReconnectAttempts: -1
});

pnc.flush(() => {
   console.log('flushed');
});

pnc.drain(() => {
    console.log('all drained');
});

opnc.close();
console.log(`generated a inbox ${nc.createInbox()}`);

// sub min
let sid = nc.subscribe('foo', (payload: string, replyTo: string, subject: string) => {
    console.log(`sub1 handler: payload: ${payload} replyTo: ${replyTo} subject: ${subject}`);
});
console.log(sid);
nc.timeout(sid, 1000, 1, (subID) => {
   console.log(`${subID} did not receive any messages`);
});

console.log(`nc has ${nc.numSubscriptions()} subscriptions`);

nc.subscribe('foo', {queue: 'one'}, (payload: string, replyTo: string, subject: string) => {
    console.log(`sub2 handler: payload: ${payload} replyTo: ${replyTo} subject: ${subject}`);
});

nc.subscribe('bar', (payload: string, replyTo: string, subject: string) => {
    console.log(`bar request handler: payload: ${payload} replyTo: ${replyTo} subject: ${subject}`);
    if(replyTo) {
        nc.publish(replyTo, payload);
    }
});

// sub all
sid = nc.subscribe('foo', {max: 1}, () => {
});
console.log(sid);



nc.publish('foo');
nc.publish('foo', () => {
   console.log('published');
});

nc.publish('foo', 'payload');
nc.publish('foo', 'payload', () => {
    console.log('published with payload');
});

nc.publish('foo', 'payload', 'here');
nc.publish('foo', 'payload', 'here', () => {
    console.log('published with payload and reply');
});


// request min
let rid = nc.request('bar', (payload:string) => {
    console.log(`request not expecting payload: ${payload}` );
});
console.log(rid);

// request payload
rid = nc.request('bar', 'payload', (payload:string) => {
    console.log(`request expecting payload: ${payload}`, );
});
console.log(rid);

// request all
rid = nc.request('bar', 'payload', {max: 5}, (payload:string) => {
    console.log(`request expecting payload: ${payload}`, );
});
console.log(rid);


// requestOne min
let roid = nc.requestOne('bar', 100, (payload:string) => {
    console.log(`requestOne not expecting payload: ${payload}`);
});
console.log(roid);

// requestOne payload
roid = nc.requestOne('bar', 'payload', 100, (payload:string) => {
    console.log(`requestOne expecting payload: ${payload}`);
});
console.log(roid);

// requestOne all
roid = nc.requestOne('bar', 'payload', {max: 10}, 100, (payload:string) => {
    console.log(`requestOne expecting payload: ${payload}`);
});
console.log(roid);


const codes = [
    BAD_AUTHENTICATION,
    BAD_CREDS,
    BAD_JSON,
    BAD_MSG,
    BAD_OPTIONS,
    BAD_REPLY,
    BAD_SUBJECT,
    CLIENT_CERT_REQ,
    CONN_CLOSED,
    CONN_DRAINING,
    CONN_ERR,
    INVALID_ENCODING,
    NATS_PROTOCOL_ERR,
    NKEY_OR_JWT_REQ,
    NON_SECURE_CONN_REQ,
    NO_ECHO_NOT_SUPPORTED,
    NO_SEED_IN_CREDS,
    NO_USER_JWT_IN_CREDS,
    OPENSSL_ERR,
    PERMISSIONS_ERR,
    REQ_TIMEOUT,
    SECURE_CONN_REQ,
    SIGCB_NOTFUNC,
    SIGNATURE_REQUIRED,
    STALE_CONNECTION_ERR,
    SUB_DRAINING
];

codes.forEach((v) => {
    if(v.length === 0) {
        throw new Error("there's a problem with a constant");
    } else {
        console.log(v);
    }
});
