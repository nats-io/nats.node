
import events = require('events');

export const version: string;

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
	tls?: boolean,
	name?: string,
	yieldTime?: number,
	waitOnFirstConnect?: boolean,
	json?: boolean
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
	close();

	/**
	 * Flush outbound queue to server and call optional callback when server has processed
	 * all data.
	 */
	flush(callback?: Function);

	/**
	 * Publish a message to the given subject, with optional reply and callback.
	 */
	publish(callback: Function);
	publish(subject: string, callback: Function);
	publish(subject: string, msg: string | Buffer, callback: Function);
	publish(subject: string, msg?: string | Buffer, reply?: string, callback?: Function);

	/**
	 * Subscribe to a given subject, with optional options and callback. opts can be
	 * ommitted, even with a callback. The Subscriber Id is returned.
	 */
	subscribe(subject: string, callback: Function): number;
	subscribe(subject: string, opts: SubscribeOptions, callback: Function): number;

	/**
	 * Unsubscribe to a given Subscriber Id, with optional max parameter.
	 */
	unsubscribe(sid: number, max?: number);

	/**
	 * Set a timeout on a subscription.
	 */
	timeout(sid: number, timeout: number, expected: number, callback: (sid: number) => void);

	/**
	 * Publish a message with an implicit inbox listener as the reply. Message is optional.
	 * This should be treated as a subscription. You can optionally indicate how many
	 * messages you only want to receive using opt_options = {max:N}. Otherwise you
	 * will need to unsubscribe to stop the message stream.
	 * The Subscriber Id is returned.
	 */
	request(subject: string, callback: Function): number;
	request(subject: string, msg: string | Buffer, callback: Function): number;
	request(subject: string, msg?: string, options?: SubscribeOptions, callback?: Function): number;

	/**
	 * Report number of outstanding subscriptions on this connection.
	 */
	numSubscriptions(): number;
}