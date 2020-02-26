/*
 * Copyright 2013-2020 The NATS Authors
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

import * as events from 'events';
import * as tls from 'tls';


export const version: string;

/**
 * Error codes
 */
export const enum ErrorCode {
	API_ERROR = 'API_ERROR',
	BAD_AUTHENTICATION = 'BAD_AUTHENTICATION',
	BAD_CREDS = 'BAD_CREDENTIALS',
	BAD_JSON = 'BAD_JSON',
	BAD_MSG = 'BAD_MSG',
	BAD_OPTIONS = 'BAD_OPTIONS',
	BAD_REPLY = 'BAD_REPLY',
	BAD_SUBJECT = 'BAD_SUBJECT',
	CLIENT_CERT_REQ = 'CLIENT_CERT_REQ',
	CONN_CLOSED = 'CONN_CLOSED',
	CONN_DRAINING = 'CONN_DRAINING',
	CONN_ERR = 'CONN_ERR',
	CONN_TIMEOUT = 'CONN_TIMEOUT',
	INVALID_ENCODING = 'INVALID_ENCODING',
	NATS_PROTOCOL_ERR = 'NATS_PROTOCOL_ERR',
	NKEY_OR_JWT_REQ = 'NKEY_OR_JWT_REQ',
	NON_SECURE_CONN_REQ = 'NON_SECURE_CONN_REQ',
	NO_ECHO_NOT_SUPPORTED = 'NO_ECHO_NOT_SUPPORTED',
	NO_SEED_IN_CREDS = 'NO_SEED_IN_CREDS',
	NO_USER_JWT_IN_CREDS = 'NO_USER_JWT_IN_CREDS',
	OPENSSL_ERR = 'OPENSSL_ERR',
	PERMISSIONS_ERR = 'permissions violation',
	REQ_TIMEOUT = 'REQ_TIMEOUT',
	SECURE_CONN_REQ = 'SECURE_CONN_REQ',
	SIGCB_NOTFUNC = 'SIG_NOT_FUNC',
	SIGNATURE_REQUIRED = 'SIG_REQ',
	STALE_CONNECTION_ERR = 'stale connection',
	SUB_DRAINING = 'SUB_DRAINING',
	TIMEOUT_ERR = 'TIMEOUT'
}

/**
 * Create a properly formatted inbox subject.
 */
export function createInbox(): string;

/**
 * Connect to a nats-server and return the client.
 * Argument can be a url or a port, or a ClientOpts with a 'url'
 * and additional options
 */
export function connect(url?: string|number, opts?: ConnectionOptions): Client;
export function connect(opts: ConnectionOptions): Client;

export interface ConnectionOptions {
	encoding?: BufferEncoding,
	json?: boolean,
	maxPingOut?: number,
	maxReconnectAttempts?: number,
	name?: string,
	nkey?: string,
	noEcho?: boolean
	noMuxRequests?: boolean,
	noRandomize?: boolean,
	nonceSigner?: Function,
	pass?: string,
	pedantic?: boolean,
	pingInterval?: number,
	preserveBuffers?: boolean,
	reconnect?: boolean,
	reconnectTimeWait?: number,
	servers?: Array<string>,
	timeout?: number,
	tls?: boolean | tls.TlsOptions,
	token?: string,
	tokenHandler?: Function,
	url?: string,
	useOldRequestStyle?: boolean,
	user?: string,
	userCreds?: string,
	userJWT?: string | Function,
	verbose?: boolean,
	waitOnFirstConnect?: boolean,
	yieldTime?: number
}

export interface SubscriptionOptions {
	queue?: string,
	max?: number
	timeout?: number
	expected?: number
}

export interface RequestOptions {
	max?: number,
	timeout?: number
}

/** [[Client.subscribe]] callbacks. First argument will be an error if an error occurred (such as a timeout) or null.
 * Message argument is the received message (which should be treated as debug information when an error is provided).
 *
 */
export interface MsgCallback {
	(err: NatsError | null, msg: Msg): void;
}

export interface Callback {
	(err: NatsError | null): void;
}


export interface Msg {
	/** subject used to publish the message */
	subject: string;
	/** optional reply subject where replies may be sent. */
	reply?: string;
	/** optional payload for the message, */
	data?: any;
	/** Internal subscription id */
	sid: number;
	/**
	 * Publishes a reply. Note this method can throw if the connection is closed.
	 * @param data
	 */
	respond(data?: any): void;
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
	flush(callback?: Callback):void;

	/**
	 * Publish a message to the given subject, with optional data and callback.
	 */
	publish(subject: string, data?: any, callback?: Callback): void;

	/**
	 * Publish a request message with optional data and callback. Typically, requests
	 * should be made using the `request` API.
	 */
	publishRequest(subject: string, reply: string, data?: any, callback?: Callback): void;

	/**
	 * Subscribe to a given subject, with optional options and callback. opts can be
	 * omitted, even with a callback. A subscription id is returned.
	 */
	subscribe(subject: string, callback: MsgCallback, opts?: SubscriptionOptions): Sub | undefined;

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
	drain(callback?: Callback):void;

	/**
	 * Publish a message with an implicit inbox listener as the reply. Message is optional.
	 * This should be treated as a subscription. You can optionally indicate how many
	 * messages you only want to receive and how long to wait for the messages using
	 * opt_options = {max:N, timeout:N}. Otherwise you will need to unsubscribe to stop
	 * the message stream manually by calling unsubscribe() on the subscription id returned.
	 */
	request(subject: string, callback: MsgCallback, data?: any, options?: RequestOptions): Req | undefined;

	/**
	 * Report number of outstanding subscriptions on this connection.
	 */
	numSubscriptions(): number;
}

export interface Sub {
	sid: number;
	/**
	 * Unsubscribe with optional max number of messages before unsubscribing.
	 */
	unsubscribe(max?: number): void;

	/**
	 * Draining a subscription is similar to unsubscribe but inbound pending messages are
	 * not discarded. When the last in-flight message is processed, the subscription handler
	 * is removed.
	 * @param callback
	 */
	drain(callback?: Callback): void;

	/**
	 * Returns true if the subscription has an associated timeout
	 * @return boolean
	 */
	hasTimeout(): boolean;

	/**
	 * Cancels any timeout associated with the subscription. Returns true if a
	 * timeout was cancelled.
	 * @return boolean
	 */
	cancelTimeout(): boolean;

   /**
	* Sets a timeout on a subscription. The timeout will fire by calling
	* the subscription's callback with an error argument if the expected
	* number of messages (specified via max) has not been received by the
	* subscription before the timer expires. If max is not specified,
	* the subscription times out if no messages are received within the timeout
	* specified.
	*
	* Returns `true` if the subscription was found and the timeout was registered.
	*
	* @param millis
	* @param max
	* @return boolean
	*/
	setTimeout(millis: number, max?: number): boolean;

	/**
	 * Returns the number of messages received by the subscription.
	 * If the subscription doesn't exist it returns -1.
	 * @return number
	 */
	getReceived(): number;

	/**
	 * Returns the number of messages expected by the subscription.
	 * If `0`, the subscription was not found or was auto-cancelled.
	 * If `-1`, the subscription didn't specify a count for expected messages.
	 */
	getMax(): number;

	/**
	 * @return true if the subscription is not found.
	 */
	isCancelled(): boolean;

	/**
	 * @return true if the subscription is draining.
	 * @see [[drain]]
	 */
	isDraining(): boolean;
}

export interface Req {
	sid: number;
	/**
	 * Unsubscribe with optional max number of messages before unsubscribing.
	 */
	cancel(): void;
}

declare class NatsError implements Error {
	public name: string;
	public message: string;
	public code: string;
	public chainedError: Error;

	constructor(message:string, code:string, chainedError?:Error);
}
