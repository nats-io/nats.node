import {
  render,
  Transport,
  Deferred,
  deferred,
  DataBuffer,
  extractProtocolMessage,
  INFO,
  checkOptions,
} from "./nats-base-client";

import { ConnectionOptions } from "./nats-base-client";
import { Socket, createConnection } from "net";
import { extend } from "../nats-base-client/util";
import { connect as tlsConnect, TLSSocket } from "tls";

const VERSION = "2.0.0-0";
const LANG = "nats.js";

export class NodeTransport implements Transport {
  socket: Socket;
  version: string = VERSION;
  lang: string = LANG;
  closeError?: Error;

  yields: Uint8Array[];
  signal: Deferred<void> = deferred<void>();
  private done = false;

  peeked = false;
  connection: Deferred<void> = deferred<void>();
  closedNotification: Deferred<void | Error> = deferred();
  private options!: ConnectionOptions;

  constructor() {
    this.yields = [];
  }

  get isClosed(): boolean {
    return this.done;
  }

  close(err?: Error): Promise<void> {
    return this._closed(err, false);
  }

  _extractInfo(pm: string): object {
    const m = INFO.exec(pm);
    if (!m) {
      throw new Error("unexpected response from server");
    }
    return JSON.parse(m[1]);
  }

  _peek(): void {
    const t = DataBuffer.concat(...this.yields);
    const pm = extractProtocolMessage(t);
    if (pm) {
      try {
        const info = this._extractInfo(pm);
        checkOptions(info, this.options);
        // @ts-ignore
        if (info?.tls_required) {
          this._startTLS();
        }
        this.connection.resolve();
      } catch (err) {
        this.connection.reject(err);
      }
    }
  }

  _startTLS(): void {
    let tlsOpts = { socket: this.socket };
    if (typeof this.options.tls === "object") {
      tlsOpts = extend(tlsOpts, this.options.tls);
    }
    this.socket.removeAllListeners();
    this.socket = tlsConnect(tlsOpts);
    this._setupHandlers();
  }

  _connectHandler() {}

  _closeHandler() {
    this._closed(undefined, false);
  }

  _errorHandler(err) {
    if (err.code === "ECONNREFUSED") {
      // this will turn into ErrorCode.CONNECTION_REFUSED
      return this.connection.reject();
    }
    this._closed(err);
  }

  _dataHandler(frame: Uint8Array) {
    this.yields.push(frame);
    if (this.peeked) {
      return this.signal.resolve();
    }
    this._peek();
  }

  _setupHandlers() {
    this.socket.on("connect", () => {
      this._connectHandler();
    });
    this.socket.on("data", (frame) => {
      this._dataHandler(frame);
    });
    this.socket.on("error", (err) => {
      this._errorHandler(err);
    });
    this.socket.on("close", () => {
      this._closeHandler();
    });
  }

  async connect(
    hp: { hostname: string; port: number },
    options: ConnectionOptions,
  ): Promise<void> {
    this.options = options;
    this.socket = createConnection(hp.port, hp.hostname);
    this.socket.setNoDelay(true);
    this._setupHandlers();

    await this.connection;
    this.peeked = true;
    this.signal.resolve();

    return Promise.resolve();
  }

  [Symbol.asyncIterator](): AsyncIterableIterator<Uint8Array> {
    return this.iterate();
  }

  async *iterate(): AsyncIterableIterator<Uint8Array> {
    while (true) {
      await this.signal;
      while (this.yields.length > 0) {
        const frame = this.yields.shift();
        if (frame) {
          if (this.options.debug) {
            console.info(`> ${render(frame)}`);
          }
          yield frame;
        }
      }
      if (this.done) {
        break;
      } else {
        this.signal = deferred();
      }
    }
  }

  disconnect(): void {
    this._closed(undefined, true).then().catch();
  }

  isEncrypted(): boolean {
    return this.socket instanceof TLSSocket;
  }

  send(frame: Uint8Array): Promise<void> {
    if (this.isClosed) {
      return Promise.resolve();
    }
    if (this.options.debug) {
      console.info(`< ${render(frame)}`);
    }
    const d = deferred<void>();
    this.socket.write(frame, (err) => {
      if (err) {
        return d.reject(err);
      }
      return d.resolve();
    });
    return d;
  }

  private async _closed(err?: Error, internal: boolean = true): Promise<void> {
    if (this.done) return;
    this.closeError = err;
    if (!err) {
      try {
        // this is a noop for the server, but gives us a place to hang
        // a close and ensure that we sent all before closing
        await this.send(new TextEncoder().encode("+OK\r\n"));
      } catch (err) {
        if (this.options.debug) {
          console.log("transport close terminated with an error", err);
        }
      }
    }
    this.done = true;
    try {
      this.socket.removeAllListeners();
      this.socket.destroy();
    } catch (err) {
    }

    if (internal) {
      this.closedNotification.resolve(err);
    }
  }

  closed(): Promise<void | Error> {
    return this.closedNotification;
  }
}
