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

import events = require('events');
import tls = require('tls');


export const version: string;

/**
 * Error codes
 */
export const BAD_AUTHENTICATION: string;
export const BAD_CALLBACK: string;
export const BAD_CREDS: string;
export const BAD_JSON: string;
export const BAD_MSG: string;
export const BAD_OPTIONS: string;
export const BAD_REPLY: string;
export const BAD_SUBJECT: string;
export const BAD_TIMEOUT: string;
export const CLIENT_CERT_REQ: string;
export const CONN_CLOSED: string;
export const CONN_DRAINING: string;
export const CONN_ERR: string;
export const CONN_TIMEOUT: string;
export const INVALID_ENCODING: string;
export const NATS_PROTOCOL_ERR: string;
export const NKEY_OR_JWT_REQ: string;
export const NON_SECURE_CONN_REQ: string;
export const NO_ECHO_NOT_SUPPORTED: string;
export const NO_SEED_IN_CREDS: string;
export const NO_USER_JWT_IN_CREDS: string;
export const OPENSSL_ERR: string;
export const PERMISSIONS_ERR: string;
export const REQ_TIMEOUT: string;
export const SECURE_CONN_REQ: string;
export const SIGCB_NOTFUNC: string;
export const SIGNATURE_REQUIRED: string;
export const STALE_CONNECTION_ERR: string;
export const SUB_DRAINING: string;

/**
 * Create a properly formatted inbox subject.
 */
export function createInbox(): string;

/**
 * Connect to a nats-server and return the client.
 * Argument can be a url or a port, or a ClientOpts with a 'url'
 * and additional options
 */
export function connect(url?: string|number, opts?: ClientOpts): Client;
export function connect(opts: ClientOpts): Client;

export interface ClientOpts {
	encoding?: BufferEncoding,
	json?: boolean,
	maxPingOut?: number,
	maxReconnectAttempts?: number,
	name?: string,
	nkey?: string,
	noEcho?: boolean
	noRandomize?: boolean,
	nonceSigner?: Function,
	pass?: string,
	pedantic?: boolean,
	pingInterval?: number,
	preserveBuffers?: boolean,
	reconnect?: boolean,
	reconnectJitter?: number,
	reconnectJitterTLS?: number,
	reconnectDelayHandler?: ()=>number,
	reconnectTimeWait?: number,
	servers?: Array<string>,
	timeout?: number,
	tls?: boolean | tls.TlsOptions,
	token?: string,
	tokenHandler?: ()=>string,
	url?: string,
	useOldRequestStyle?: boolean,
	user?: string,
	userCreds?: string,
	userJWT?: ()=>string | string,
	verbose?: boolean,
	waitOnFirstConnect?: boolean,
	yieldTime?: number
}

export interface SubscribeOptions {
	queue?: string,
	max?: number
}

export interface RequestOptions {
	max?: number,
	timeout?: number
}

declare class Client extends events.EventEmitter {
	/**
	 * Create a properly formatted inbox subject.
	 */
	createInbox(): string;

	/**
	 * Close the connection to the server.
	 */
	close():void;

	/**
	 * Flush outbound queue to server and call optional callback when server has processed
	 * all data.
	 */
	flush(callback?: Function):void;

	/**
	 * Publish a message to the given subject, with optional reply and callback.
	 */
	publish(subject: string, callback?: Function):void;
	publish(subject: string, msg: any, callback?: Function):void;
	publish(subject: string, msg: any, reply: string, callback?: Function):void;

	/**
	 * Subscribe to a given subject, with optional options and callback. opts can be
	 * omitted, even with a callback. A subscription id is returned.
	 */
	subscribe(subject: string, callback: Function): number;
	subscribe(subject: string, opts: SubscribeOptions, callback: Function): number;

	/**
	 * Unsubscribe to a given subscription id, with optional max number of messages before unsubscribing.
	 */
	unsubscribe(sid: number, max?: number):void;

	/**
	 * Draining a subscription is similar to unsubscribe but inbound pending messages are
	 * not discarded. When the last in-flight message is processed, the subscription handler
	 * is removed.
	 * @param sid
	 * @param callback
	 */
	drainSubscription(sid: number, callback?:Function):void;

	/**
	 * Drains all subscriptions. If an opt_callback is provided, the callback
	 * is called if there's an error with an error argument.
	 *
	 * Note that after calling drain, it is impossible to create new subscriptions
	 * or any requests. As soon as all messages for the draining subscriptions are
	 * processed, it is also impossible to publish new messages.
	 *
	 * A drained connection is closed when the opt_callback is called without arguments.
	 * @param callback
	 */
	drain(callback?:Function):void;

	/**
	 * Set a timeout on a subscription.
	 */
	timeout(sid: number, timeout: number, expected: number, callback: (sid: number) => void):void;

	/**
	 * Publish a message with an implicit inbox listener as the reply. Message is optional.
	 * This should be treated as a subscription. You can optionally indicate how many
	 * messages you only want to receive and how long to wait for the messages using
	 * opt_options = {max:N, timeout:N}. Otherwise you will need to unsubscribe to stop
	 * the message stream manually by calling unsubscribe() on the subscription id returned.
	 */
	request(subject: string, callback: Function): number;
	request(subject: string, msg: any, callback: Function): number;
	request(subject: string, msg: any, options: RequestOptions, callback: Function): number;

	/**
	 * Publish a message with an implicit inbox listener as the reply. Message is optional.
	 * This should be treated as a subscription. Request one, will terminate the subscription
	 * after the first response is received or the timeout is reached.
	 * The callback can be called with either a message payload or a NatsError to indicate
	 * a timeout has been reached.
	 * The subscription id is returned.
	 */
	requestOne(subject: string, timeout: number, callback: Function): number;
	requestOne(subject: string, msg: any, timeout: number, callback: Function): number;
	requestOne(subject: string, msg: any, options: RequestOptions, timeout: number, callback: Function): number;

	/**
	 * Report number of outstanding subscriptions on this connection.
	 */
	numSubscriptions(): number;
}

declare class NatsError implements Error {
	public name: string;
	public message: string;
	public code: string;
	public chainedError: Error;

	constructor(message:string, code:string, chainedError?:Error);
}
