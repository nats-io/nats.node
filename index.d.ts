/*
 * Copyright 2013-2021 The NATS Authors
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
export declare function connect(
  opts?: ConnectionOptions,
): Promise<NatsConnection>;

export declare const Empty: Uint8Array;
export declare enum Events {
    Disconnect = "disconnect",
    Reconnect = "reconnect",
    Update = "update",
    LDM = "ldm",
    Error = "error"
}
export interface Status {
    type: Events | DebugEvents;
    data: string | ServersChanged | number;
}
export declare enum DebugEvents {
    Reconnecting = "reconnecting",
    PingTimer = "pingTimer",
    StaleConnection = "staleConnection"
}

export interface NatsConnection {
    info?: ServerInfo;
    closed(): Promise<void | Error>;
    close(): Promise<void>;
    publish(subject: string, data?: Uint8Array, options?: PublishOptions): void;
    subscribe(subject: string, opts?: SubscriptionOptions): Subscription;
    request(subject: string, data?: Uint8Array, opts?: RequestOptions): Promise<Msg>;
    flush(): Promise<void>;
    drain(): Promise<void>;
    isClosed(): boolean;
    isDraining(): boolean;
    getServer(): string;
    status(): AsyncIterable<Status>;
    stats(): Stats;
    jetstreamManager(opts?: JetStreamOptions): Promise<JetStreamManager>;
    jetstream(opts?: JetStreamOptions): JetStreamClient;
}
export interface ConnectionOptions {
    authenticator?: Authenticator;
    debug?: boolean;
    ignoreClusterUpdates?: boolean;
    inboxPrefix?: string;
    maxPingOut?: number;
    maxReconnectAttempts?: number;
    name?: string;
    noEcho?: boolean;
    noRandomize?: boolean;
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
    cert?: string;
    caFile?: string;
    ca?: string;
    keyFile?: string;
    key?: string;
}
export interface Msg {
    subject: string;
    sid: number;
    reply?: string;
    data: Uint8Array;
    headers?: MsgHdrs;
    respond(data?: Uint8Array, opts?: PublishOptions): boolean;
}
export interface SubOpts<T> {
    queue?: string;
    max?: number;
    timeout?: number;
    callback?: (err: NatsError | null, msg: T) => void;
}
export declare type SubscriptionOptions = SubOpts<Msg>;

export interface ServerInfo {
    "auth_required"?: boolean;
    "client_id": number;
    "client_ip"?: string;
    "connect_urls"?: string[];
    "git_commit"?: string;
    go: string;
    headers?: boolean;
    host: string;
    jetstream?: boolean;
    ldm?: boolean;
    "max_payload": number;
    nonce?: string;
    port: number;
    proto: number;
    "server_id": string;
    "server_name": string;
    "tls_available"?: boolean;
    "tls_required"?: boolean;
    "tls_verify"?: boolean;
    version: string;
}

export interface ServersChanged {
    readonly added: string[];
    readonly deleted: string[];
}
export interface Sub<T> extends AsyncIterable<T> {
    unsubscribe(max?: number): void;
    drain(): Promise<void>;
    isDraining(): boolean;
    isClosed(): boolean;
    callback(err: NatsError | null, msg: Msg): void;
    getSubject(): string;
    getReceived(): number;
    getProcessed(): number;
    getPending(): number;
    getID(): number;
    getMax(): number | undefined;
}
export declare type Subscription = Sub<Msg>;
export interface RequestOptions {
    timeout: number;
    headers?: MsgHdrs;
    noMux?: boolean;
    reply?: string;
}
export interface PublishOptions {
    reply?: string;
    headers?: MsgHdrs;
}

export interface MsgHdrs extends Iterable<[string, string[]]> {
  hasError: boolean;
  status: string;
  code: number;
  get(k: string): string;
  set(k: string, v: string): void;
  append(k: string, v: string): void;
  has(k: string): boolean;
  values(k: string): string[];
  delete(k: string): void;
}
export declare function headers(): MsgHdrs;

export declare function createInbox(prefix?: string): string;

export interface Authenticator {
  (nonce?: string): Auth;
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

export declare function noAuthFn(): Authenticator;

export declare function nkeyAuthenticator(
  seed?: Uint8Array | (() => Uint8Array),
): Authenticator;

export declare function jwtAuthenticator(
  ajwt: string | (() => string),
  seed?: Uint8Array | (() => Uint8Array),
): Authenticator;

export declare function credsAuthenticator(creds: Uint8Array): Authenticator;

export declare enum ErrorCode {
  ApiError = "BAD API",
  BadAuthentication = "BAD_AUTHENTICATION",
  BadCreds = "BAD_CREDS",
  BadHeader = "BAD_HEADER",
  BadJson = "BAD_JSON",
  BadPayload = "BAD_PAYLOAD",
  BadSubject = "BAD_SUBJECT",
  Cancelled = "CANCELLED",
  ConnectionClosed = "CONNECTION_CLOSED",
  ConnectionDraining = "CONNECTION_DRAINING",
  ConnectionRefused = "CONNECTION_REFUSED",
  ConnectionTimeout = "CONNECTION_TIMEOUT",
  Disconnect = "DISCONNECT",
  InvalidOption = "INVALID_OPTION",
  InvalidPayload = "INVALID_PAYLOAD",
  MaxPayloadExceeded = "MAX_PAYLOAD_EXCEEDED",
  NoResponders = "503",
  NotFunction = "NOT_FUNC",
  RequestError = "REQUEST_ERROR",
  ServerOptionNotAvailable = "SERVER_OPT_NA",
  SubClosed = "SUB_CLOSED",
  SubDraining = "SUB_DRAINING",
  Timeout = "TIMEOUT",
  Tls = "TLS",
  Unknown = "UNKNOWN_ERROR",
  WssRequired = "WSS_REQUIRED",
  JetStreamInvalidAck = "JESTREAM_INVALID_ACK",
  JetStream404NoMessages = "404",
  JetStream408RequestTimeout = "408",
  JetStream409MaxAckPendingExceeded = "409",
  JetStreamNotEnabled = "503",
  AuthorizationViolation = "AUTHORIZATION_VIOLATION",
  AuthenticationExpired = "AUTHENTICATION_EXPIRED",
  ProtocolError = "NATS_PROTOCOL_ERR",
  PermissionsViolation = "PERMISSIONS_VIOLATION",
}

export declare interface NatsError extends Error {
  name: string;
  message: string;
  code: string;
  chainedError?: Error;
}

export interface Stats {
    inBytes: number;
    outBytes: number;
    inMsgs: number;
    outMsgs: number;
}

export interface Codec<T> {
  encode(d: T): Uint8Array;
  decode(a: Uint8Array): T;
}
export declare function StringCodec(): Codec<string>;
export declare function JSONCodec<T = unknown>(): Codec<T>;

export interface JetStreamOptions {
    apiPrefix?: string;
    timeout?: number;
}
export interface JetStreamManager {
    consumers: ConsumerAPI;
    streams: StreamAPI;
    getAccountInfo(): Promise<JetStreamAccountStats>;
    advisories(): AsyncIterable<Advisory>;
}
export interface PullOptions {
    batch: number;
    "no_wait": boolean;
    expires: number;
}
export interface PubAck {
    stream: string;
    seq: number;
    duplicate: boolean;
    ack(): void;
}
export interface JetStreamPublishOptions {
    msgID: string;
    timeout: number;
    ackWait: Nanos;
    expect: Partial<{
        lastMsgID: string;
        streamName: string;
        lastSequence: number;
    }>;
}
export interface ConsumerInfoable {
    consumerInfo(): Promise<ConsumerInfo>;
}
export interface Closed {
    closed: Promise<void>;
}
export declare type JetStreamSubscription = Sub<JsMsg> & Destroyable & Closed & ConsumerInfoable;
export declare type JetStreamSubscriptionOptions = TypedSubscriptionOptions<JsMsg>;
export interface Pullable {
    pull(opts?: Partial<PullOptions>): void;
}
export interface Destroyable {
    destroy(): Promise<void>;
}

export interface Dispatcher<T> {
  push(v: T): void;
}
export interface QueuedIterator<T> extends Dispatcher<T> {
  [Symbol.asyncIterator](): AsyncIterator<T>;
  stop(err?: Error): void;
  getProcessed(): number;
  getPending(): number;
  getReceived(): number;
}

export declare type JetStreamPullSubscription = JetStreamSubscription & Pullable;
export declare type JsMsgCallback = (err: NatsError | null, msg: JsMsg | null) => void;
export interface JetStreamClient {
    publish(subj: string, data?: Uint8Array, options?: Partial<JetStreamPublishOptions>): Promise<PubAck>;
    pull(stream: string, durable: string): Promise<JsMsg>;
    fetch(stream: string, durable: string, opts?: Partial<PullOptions>): QueuedIterator<JsMsg>;
    pullSubscribe(subject: string, opts: ConsumerOptsBuilder | Partial<ConsumerOpts>): Promise<JetStreamPullSubscription>;
    subscribe(subject: string, opts: ConsumerOptsBuilder | Partial<ConsumerOpts>): Promise<JetStreamSubscription>;
}
export interface ConsumerOpts {
    config: Partial<ConsumerConfig>;
    mack: boolean;
    subQueue: string;
    stream: string;
    callbackFn?: JsMsgCallback;
    name?: string;
    max?: number;
    debug?: boolean;
}
export declare function consumerOpts(): ConsumerOptsBuilder;

export interface ConsumerOptsBuilder {
    deliverTo(subject: string): void;
    manualAck(): void;
    durable(name: string): void;
    deliverAll(): void;
    deliverLast(): void;
    deliverNew(): void;
    startSequence(seq: number): void;
    startTime(time: Date | Nanos): void;
    ackNone(): void;
    ackAll(): void;
    ackExplicit(): void;
    maxDeliver(max: number): void;
    maxAckPending(max: number): void;
    maxWaiting(max: number): void;
    maxMessages(max: number): void;
    callback(fn: JsMsgCallback): void;
}
export interface Lister<T> {
    next(): Promise<T[]>;
}
export interface ConsumerAPI {
    info(stream: string, consumer: string): Promise<ConsumerInfo>;
    add(stream: string, cfg: Partial<ConsumerConfig>): Promise<ConsumerInfo>;
    delete(stream: string, consumer: string): Promise<boolean>;
    list(stream: string): Lister<ConsumerInfo>;
}
export interface StreamAPI {
    info(stream: string): Promise<StreamInfo>;
    add(cfg: Partial<StreamConfig>): Promise<StreamInfo>;
    update(cfg: StreamConfig): Promise<StreamInfo>;
    purge(stream: string): Promise<PurgeResponse>;
    delete(stream: string): Promise<boolean>;
    list(): Lister<StreamInfo>;
    deleteMessage(stream: string, seq: number): Promise<boolean>;
    getMessage(stream: string, seq: number): Promise<StoredMsg>;
    find(subject: string): Promise<string>;
}
export interface JsMsg {
    redelivered: boolean;
    info: DeliveryInfo;
    seq: number;
    headers: MsgHdrs | undefined;
    data: Uint8Array;
    subject: string;
    sid: number;
    ack(): void;
    nak(): void;
    working(): void;
    term(): void;
    ackAck(): Promise<boolean>;
}
export interface DeliveryInfo {
    stream: string;
    consumer: string;
    redeliveryCount: number;
    streamSequence: number;
    deliverySequence: number;
    timestampNanos: number;
    pending: number;
    redelivered: boolean;
}
export interface StoredMsg {
    subject: string;
    seq: number;
    header: MsgHdrs;
    data: Uint8Array;
    time: Date;
}
export interface Advisory {
    kind: AdvisoryKind;
    data: unknown;
}
export declare enum AdvisoryKind {
    API = "api_audit",
    StreamAction = "stream_action",
    ConsumerAction = "consumer_action",
    SnapshotCreate = "snapshot_create",
    SnapshotComplete = "snapshot_complete",
    RestoreCreate = "restore_create",
    RestoreComplete = "restore_complete",
    MaxDeliver = "max_deliver",
    Terminated = "terminated",
    Ack = "consumer_ack",
    StreamLeaderElected = "stream_leader_elected",
    StreamQuorumLost = "stream_quorum_lost",
    ConsumerLeaderElected = "consumer_leader_elected",
    ConsumerQuorumLost = "consumer_quorum_lost"
}
export declare type Nanos = number;
export interface ApiError {
    code: number;
    description: string;
}
export interface ApiResponse {
    type: string;
    error?: ApiError;
}
export interface ApiPaged {
    total: number;
    offset: number;
    limit: number;
}
export interface ApiPagedRequest {
    offset: number;
}
export interface StreamInfo {
    config: StreamConfig;
    created: number;
    state: StreamState;
    cluster?: ClusterInfo;
    mirror?: StreamSourceInfo;
    sources?: StreamSourceInfo[];
}
export interface StreamConfig {
    name: string;
    subjects?: string[];
    retention: RetentionPolicy;
    "max_consumers": number;
    "max_msgs": number;
    "max_bytes": number;
    discard?: DiscardPolicy;
    "max_age": number;
    "max_msg_size"?: number;
    storage: StorageType;
    "num_replicas": number;
    "no_ack"?: boolean;
    "template_owner"?: string;
    "duplicate_window"?: number;
    placement?: Placement;
    mirror?: StreamSource;
    sources?: StreamSource[];
}
export interface StreamSource {
    name: string;
    "opt_start_seq": number;
    "opt_start_time": string;
    "filter_subject": string;
}
export interface Placement {
    cluster: string;
    tags: string[];
}
export declare enum RetentionPolicy {
    Limits = "limits",
    Interest = "interest",
    Workqueue = "workqueue"
}
export declare enum DiscardPolicy {
    Old = "old",
    New = "new"
}
export declare enum StorageType {
    File = "file",
    Memory = "memory"
}
export declare enum DeliverPolicy {
    All = "all",
    Last = "last",
    New = "new",
    StartSequence = "by_start_sequence",
    StartTime = "by_start_time"
}
export declare enum AckPolicy {
    None = "none",
    All = "all",
    Explicit = "explicit",
    NotSet = ""
}
export declare enum ReplayPolicy {
    Instant = "instant",
    Original = "original"
}
export interface StreamState {
    messages: number;
    bytes: number;
    "first_seq": number;
    "first_ts": number;
    "last_seq": number;
    "last_ts": string;
    deleted: number[];
    lost: LostStreamData;
    "consumer_count": number;
}
export interface LostStreamData {
    msgs: number;
    bytes: number;
}
export interface ClusterInfo {
    name?: string;
    leader?: string;
    replicas?: PeerInfo[];
}
export interface PeerInfo {
    name: string;
    current: boolean;
    offline: boolean;
    active: Nanos;
    lag: number;
}
export interface StreamSourceInfo {
    name: string;
    lag: number;
    active: Nanos;
    error?: ApiError;
}
export interface PurgeResponse extends Success {
    purged: number;
}
export interface CreateConsumerRequest {
    "stream_name": string;
    config: Partial<ConsumerConfig>;
}
export interface StreamMsgResponse extends ApiResponse {
    message: {
        subject: string;
        seq: number;
        data: string;
        hdrs: string;
        time: string;
    };
}
export interface SequencePair {
    "consumer_seq": number;
    "stream_seq": number;
}
export interface ConsumerInfo {
    "stream_name": string;
    name: string;
    created: number;
    config: ConsumerConfig;
    delivered: SequencePair;
    "ack_floor": SequencePair;
    "num_ack_pending": number;
    "num_redelivered": number;
    "num_waiting": number;
    "num_pending": number;
    cluster?: ClusterInfo;
}
export interface ConsumerListResponse extends ApiResponse, ApiPaged {
    consumers: ConsumerInfo[];
}
export interface StreamListResponse extends ApiResponse, ApiPaged {
    streams: StreamInfo[];
}
export interface Success {
    success: boolean;
}
export declare type SuccessResponse = ApiResponse & Success;
export interface MsgRequest {
    seq: number;
}
export interface MsgDeleteRequest extends MsgRequest {
    "no_erase"?: boolean;
}
export interface JetStreamAccountStats {
    memory: number;
    storage: number;
    streams: number;
    consumers: number;
    api: JetStreamApiStats;
    limits: AccountLimits;
}
export interface JetStreamApiStats {
    total: number;
    errors: number;
}
export interface AccountInfoResponse extends ApiResponse, JetStreamAccountStats {
}
export interface AccountLimits {
    "max_memory": number;
    "max_storage": number;
    "max_streams": number;
    "max_consumers": number;
}
export interface ConsumerConfig {
    name: string;
    "durable_name"?: string;
    "deliver_subject"?: string;
    "deliver_policy": DeliverPolicy;
    "opt_start_seq"?: number;
    "opt_start_time"?: string;
    "ack_policy": AckPolicy;
    "ack_wait"?: number;
    "max_deliver"?: number;
    "filter_subject"?: string;
    "replay_policy": ReplayPolicy;
    "rate_limit_bps"?: number;
    "sample_freq"?: string;
    "max_waiting"?: number;
    "max_ack_pending"?: number;
}
export interface Consumer {
    "stream_name": string;
    config: ConsumerConfig;
}
export interface StreamNames {
    streams: string[];
}
export interface StreamNameBySubject {
    subject: string;
}
export interface NextRequest {
    expires: number;
    batch: number;
    "no_wait": boolean;
}

export declare type MsgAdapter<T> = (
  err: NatsError | null,
  msg: Msg,
) => [NatsError | null, T | null];
/**
 * Callback presented to the user with the converted type
 */
export declare type TypedCallback<T> = (
  err: NatsError | null,
  msg: T | null,
) => void;
export interface TypedSubscriptionOptions<T> extends SubOpts<T> {
  adapter: MsgAdapter<T>;
  callback?: TypedCallback<T>;
  dispatchedFn?: DispatchedFn<T>;
  cleanupFn?: (sub: Subscription, info?: unknown) => void;
}

export declare type DispatchedFn<T> = (data: T | null) => void;
