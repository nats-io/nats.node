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

import events = require('events');
import tls = require('tls');


export const version: string;

/**
 * Error codes
 */
export const enum ErrorCode {
	BAD_AUTHENTICATION = 'BAD_AUTHENTICATION',
	BAD_CREDS = 'BAD_CREDENTIALS',
	BAD_JSON = 'BAD_JSON',
	BAD_MSG = 'BAD_MSG',
	BAD_OPTIONS = 'BAD_OPTIONS',
	BAD_REPLY = 'BAD_REPLY',
	BAD_SUBJECT = 'BAD_SUBJECT',
	CALLBACK_REQUIRED = 'CALLBACK_REQ',
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

export interface MessageHandler {
	(err?: NatsError, m?: Message): void;
}

export interface DrainSubHandler {
	(err?: NatsError, sid?: number): void;
}

export interface DrainHandler {
	(err?: NatsError): void;
}


export interface Message {
	data?: any,
	subject: string,
	reply?: string,
	sid: number
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
	publish(subject: string, msg?: any, reply?: string): void;

	/**
	 * Subscribe to a given subject, with optional options and callback. opts can be
	 * omitted, even with a callback. A subscription id is returned.
	 */
	subscribe(subject: string, callback: MessageHandler, opts?: SubscriptionOptions): number;

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
	drainSubscription(sid: number, callback?:DrainSubHandler):void;

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
	drain(callback?:DrainHandler):void;

	/**
	 * Publish a message with an implicit inbox listener as the reply. Message is optional.
	 * This should be treated as a subscription. You can optionally indicate how many
	 * messages you only want to receive and how long to wait for the messages using
	 * opt_options = {max:N, timeout:N}. Otherwise you will need to unsubscribe to stop
	 * the message stream manually by calling unsubscribe() on the subscription id returned.
	 */
	request(subject: string, callback: MessageHandler, data?: any, options?: RequestOptions): number;

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
