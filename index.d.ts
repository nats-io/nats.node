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
export const BAD_JSON: string;
export const BAD_MSG: string;
export const BAD_REPLY: string;
export const BAD_SUBJECT: string;
export const CLIENT_CERT_REQ: string;
export const CONN_CLOSED: string;
export const CONN_DRAINING: string;
export const CONN_ERR: string;
export const INVALID_ENCODING: string;
export const NATS_PROTOCOL_ERR: string;
export const NON_SECURE_CONN_REQ: string;
export const PERMISSIONS_ERR: string;
export const REQ_TIMEOUT: string;
export const SECURE_CONN_REQ: string;
export const STALE_CONNECTION_ERR: string;
export const SUB_DRAINING: string;

/**
 * Create a properly formatted inbox subject.
 */
export function createInbox(): string;

/**
 * Connect to a nats-server and return the client.
 * Argument can be a url, or an object with a 'url'
 * property and additional options.
 */
export function connect(opts: ClientOpts): Client;

/**
 * Connect to a nats-server and return the client.
 * Argument can be a url, or an object with a 'url'
 * property and additional options.
 */
export function connect(port: number): Client;

/**
 * Connect to a nats-server and return the client.
 * Argument can be a url, or an object with a 'url'
 * property and additional options.
 */
export function connect(url: string): Client;

export interface ClientOpts {
	url?: string,
	user?: string,
	pass?: string,
	verbose?: boolean,
	pedantic?: boolean,
	reconnect?: boolean,
	maxReconnectAttempts?: number,
	reconnectTimeWait?: number,
	servers?: Array<string>,
	noRandomize?: boolean,
	encoding?: BufferEncoding,
	tls?: boolean | tls.TlsOptions,
	name?: string,
	yieldTime?: number,
	waitOnFirstConnect?: boolean,
	json?: boolean,
	preserveBuffers?: boolean,
	token?: string,
	pingInterval?: number,
	maxPingOut?: number,
	useOldRequestStyle?: boolean,
	noEcho?: boolean
}

export interface SubscribeOptions {
	queue?: string,
	max?: number
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
	 * ommitted, even with a callback. The Subscriber Id is returned.
	 */
	subscribe(subject: string, callback: Function): number;
	subscribe(subject: string, opts: SubscribeOptions, callback: Function): number;

	/**
	 * Unsubscribe to a given Subscriber Id, with optional max number of messages before unsubscribing.
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
	 * messages you only want to receive using opt_options = {max:N}. Otherwise you
	 * will need to unsubscribe to stop the message stream.
	 * The Subscriber Id is returned.
	 */
	request(subject: string, callback: Function): number;
	request(subject: string, msg: any, callback: Function): number;
	request(subject: string, msg: any, options: SubscribeOptions, callback: Function): number;

	/**
	 * Publish a message with an implicit inbox listener as the reply. Message is optional.
	 * This should be treated as a subscription. Request one, will terminate the subscription
	 * after the first response is received or the timeout is reached.
	 * The callback can be called with either a message payload or a NatsError to indicate
	 * a timeout has been reached.
	 * The Subscriber Id is returned.
	 */
	requestOne(subject: string, timeout: number, callback: Function): number;
	requestOne(subject: string, msg: any, timeout: number, callback: Function): number;
	requestOne(subject: string, msg: any, options: SubscribeOptions, timeout: number, callback: Function): number;

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
