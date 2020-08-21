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

export interface NatsConnection {
  closed(): Promise<void | Error>;
  close(): Promise<void>;
  publish(subject: string, data?: Uint8Array, options?: PublishOptions): void;
  subscribe(subject: string, opts?: SubscriptionOptions): Subscription;
  request(
    subject: string,
    data?: Uint8Array,
    opts?: RequestOptions,
  ): Promise<Msg>;
  flush(): Promise<void>;
  drain(): Promise<void>;
  isClosed(): boolean;
  isDraining(): boolean;
  getServer(): string;
  status(): AsyncIterable<Status>;
}

export declare enum Events {
  DISCONNECT = "disconnect",
  RECONNECT = "reconnect",
  UPDATE = "update",
  LDM = "ldm",
}

export interface Status {
  type: string;
  data: string | ServersChanged;
}

export interface MsgHdrs extends Iterable<[string, string[]]> {
  get(k: string): string;
  set(k: string, v: string): void;
  append(k: string, v: string): void;
  has(k: string): boolean;
  values(k: string): string[];
  delete(k: string): void;
}
export declare function headers(): MsgHdrs;

export interface ConnectionOptions {
  authenticator?: Authenticator;
  debug?: boolean;
  headers?: boolean;
  maxPingOut?: number;
  maxReconnectAttempts?: number;
  name?: string;
  noEcho?: boolean;
  noRandomize?: boolean;
  noResponders?: boolean;
  pass?: string;
  pedantic?: boolean;
  pingInterval?: number;
  port?: number;
  reconnect?: boolean;
  reconnectDelayHandler?: () => number;
  reconnectJitter?: number;
  reconnectJitterTLS?: number;
  reconnectTimeWait?: number;
  servers?: Array<string> | string;
  timeout?: number;
  tls?: TlsOptions;
  token?: string;
  user?: string;
  verbose?: boolean;
  waitOnFirstConnect?: boolean;
}
export interface TlsOptions {
  certFile?: string;
  caFile?: string;
  keyFile?: string;
}
export interface Msg {
  subject: string;
  sid: number;
  reply?: string;
  data: Uint8Array;
  headers?: MsgHdrs;
  respond(data?: Uint8Array, headers?: MsgHdrs): boolean;
}
export interface SubscriptionOptions {
  queue?: string;
  max?: number;
  timeout?: number;
  callback?: (err: NatsError | null, msg: Msg) => void;
}
export interface ServersChanged {
  readonly added: string[];
  readonly deleted: string[];
}
export interface Subscription extends AsyncIterable<Msg> {
  unsubscribe(max?: number): void;
  drain(): Promise<void>;
  isDraining(): boolean;
  isClosed(): boolean;
  callback(err: NatsError | null, msg: Msg): void;
  getSubject(): string;
  getReceived(): number;
  getProcessed(): number;
  getID(): number;
  getMax(): number | undefined;
}
export interface RequestOptions {
  timeout: number;
  headers?: MsgHdrs;
}

export interface PublishOptions {
  reply?: string;
  headers?: MsgHdrs;
}

export declare type NoAuth = void;
export interface TokenAuth {
  auth_token: string;
}
export interface UserPass {
  user: string;
  pass?: string;
}
export interface NKeyAuth {
  nkey: string;
  sig: string;
}
export interface JwtAuth {
  jwt: string;
  nkey?: string;
  sig?: string;
}
declare type Auth = NoAuth | TokenAuth | UserPass | NKeyAuth | JwtAuth;
/**
 * Authenticator is an interface that returns credentials
 */
export interface Authenticator {
  (nonce?: string): Auth;
}
export declare function noAuthFn(): Authenticator;
/**
 * Returns an nkey authenticator that returns a public key
 * @param {Uint8Array | (() => Uint8Array)} seed
 * @return {NKeyAuth}
 */
export declare function nkeyAuthenticator(
  seed?: Uint8Array | (() => Uint8Array),
): Authenticator;
/**
 * Returns a jwt authenticator. If a seed is provided, the public
 * key, and signature are calculated. Note if a signature is provided
 * the returned value should be a base64 encoded string.
 *
 * @return {JwtAuth}
 * @param ajwt
 * @param seed
 */
export declare function jwtAuthenticator(
  ajwt: string | (() => string),
  seed?: Uint8Array | (() => Uint8Array),
): Authenticator;
/**
 * Returns a jwt authenticator configured from the specified creds file contents.
 * @param creds
 * @returns {JwtAuth}
 */
export declare function credsAuthenticator(creds: Uint8Array): Authenticator;

export declare enum ErrorCode {
  BAD_AUTHENTICATION = "BAD_AUTHENTICATION",
  BAD_CREDS = "BAD_CREDS",
  BAD_HEADER = "BAD_HEADER",
  BAD_JSON = "BAD_JSON",
  BAD_SUBJECT = "BAD_SUBJECT",
  BAD_PAYLOAD = "BAD_PAYLOAD",
  CANCELLED = "CANCELLED",
  CONNECTION_CLOSED = "CONNECTION_CLOSED",
  CONNECTION_DRAINING = "CONNECTION_DRAINING",
  CONNECTION_REFUSED = "CONNECTION_REFUSED",
  CONNECTION_TIMEOUT = "CONNECTION_TIMEOUT",
  DISCONNECT = "DISCONNECT",
  INVALID_OPTION = "INVALID_OPTION",
  INVALID_PAYLOAD_TYPE = "INVALID_PAYLOAD",
  NOT_FUNC = "NOT_FUNC",
  REQUEST_ERROR = "REQUEST_ERROR",
  SERVER_OPTION_NA = "SERVER_OPT_NA",
  SUB_CLOSED = "SUB_CLOSED",
  SUB_DRAINING = "SUB_DRAINING",
  TIMEOUT = "TIMEOUT",
  UNKNOWN = "UNKNOWN_ERROR",
  WSS_REQUIRED = "WSS_REQUIRED",
  AUTHORIZATION_VIOLATION = "AUTHORIZATION_VIOLATION",
  NATS_PROTOCOL_ERR = "NATS_PROTOCOL_ERR",
  PERMISSIONS_VIOLATION = "PERMISSIONS_VIOLATION",
}

export declare interface NatsError extends Error {
  name: string;
  message: string;
  code: string;
  chainedError?: Error;
}
