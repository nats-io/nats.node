/*
 * Copyright 2020-2022 The NATS Authors
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
  checkOptions,
  DataBuffer,
  Deferred,
  deferred,
  ErrorCode,
  extractProtocolMessage,
  INFO,
  NatsError,
  render,
  ServerInfo,
  Transport,
} from "./nats-base-client";

import type { ConnectionOptions } from "./nats-base-client";
import { createConnection, Socket } from "net";
import { extend } from "../nats-base-client/util";
import { connect as tlsConnect, TlsOptions, TLSSocket } from "tls";
const { resolve } = require("path");
const { readFile, existsSync } = require("fs");
const dns = require("dns");

const VERSION = "2.10.2";
const LANG = "nats.js";

export class NodeTransport implements Transport {
  socket: Socket;
  version: string;
  lang: string;
  yields: Uint8Array[] = [];
  signal: Deferred<void> = deferred<void>();
  closedNotification: Deferred<void | Error> = deferred();
  options!: ConnectionOptions;
  connected = false;
  tlsName = "";
  done = false;
  closeError?: Error;

  constructor() {
    this.lang = LANG;
    this.version = VERSION;
  }

  async connect(
    hp: { hostname: string; port: number; tlsName: string },
    options: ConnectionOptions,
  ): Promise<void> {
    this.tlsName = hp.tlsName;
    this.options = options;
    try {
      this.socket = await this.dial(hp);
      const info = await this.peekInfo();
      checkOptions(info, options);
      const { tls_required: tlsRequired, tls_available: tlsAvailable } = info;
      const desired = tlsAvailable === true && options.tls !== null;
      if (tlsRequired || desired) {
        this.socket = await this.startTLS();
      }
      //@ts-ignore: this is possibly a TlsSocket
      if (tlsRequired && this.socket.encrypted !== true) {
        throw new NatsError("tls", ErrorCode.ServerOptionNotAvailable);
      }

      this.connected = true;
      this.setupHandlers();
      this.signal.resolve();
      return Promise.resolve();
    } catch (err) {
      if (!err) {
        // this seems to be possible in Kubernetes
        // where an error is thrown, but it is undefined
        // when something like istio-init is booting up
        err = NatsError.errorForCode(
          ErrorCode.ConnectionRefused,
          new Error("node provided an undefined error!"),
        );
      }
      const { code } = err;
      const perr = code === "ECONNREFUSED"
        ? NatsError.errorForCode(ErrorCode.ConnectionRefused, err)
        : err;
      if (this.socket) {
        this.socket.destroy();
      }
      throw perr;
    }
  }

  dial(hp: { hostname: string; port: number }): Promise<Socket> {
    const d = deferred<Socket>();
    let dialError: Error;
    const socket = createConnection(hp.port, hp.hostname, () => {
      d.resolve(socket);
      socket.removeAllListeners();
    });
    socket.on("error", (err) => {
      dialError = err;
    });
    socket.on("close", () => {
      socket.removeAllListeners();
      d.reject(dialError);
    });
    socket.setNoDelay(true);
    return d;
  }

  get isClosed(): boolean {
    return this.done;
  }

  close(err?: Error): Promise<void> {
    return this._closed(err, false);
  }

  peekInfo(): Promise<ServerInfo> {
    const d = deferred<ServerInfo>();
    let peekError: Error;
    this.socket.on("data", (frame) => {
      this.yields.push(frame);
      const t = DataBuffer.concat(...this.yields);
      const pm = extractProtocolMessage(t);
      if (pm !== "") {
        try {
          const m = INFO.exec(pm);
          if (!m) {
            throw new Error("unexpected response from server");
          }
          const info = JSON.parse(m[1]);
          d.resolve(info);
        } catch (err) {
          d.reject(err);
        } finally {
          this.socket.removeAllListeners();
        }
      }
    });
    this.socket.on("error", (err) => {
      peekError = err;
    });
    this.socket.on("close", () => {
      this.socket.removeAllListeners();
      d.reject(peekError);
    });

    return d;
  }

  loadFile(fn: string): Promise<Buffer | void> {
    if (!fn) {
      return Promise.resolve();
    }
    const d = deferred<Buffer | void>();
    try {
      fn = resolve(fn);
      if (!existsSync(fn)) {
        d.reject(new Error(`${fn} doesn't exist`));
      }
      readFile(fn, (err, data) => {
        if (err) {
          return d.reject(err);
        }
        d.resolve(data);
      });
    } catch (err) {
      d.reject(err);
    }
    return d;
  }

  async loadClientCerts(): Promise<TlsOptions | void> {
    const tlsOpts = {} as TlsOptions;
    const { certFile, cert, caFile, ca, keyFile, key } = this.options.tls;
    try {
      if (certFile) {
        const data = await this.loadFile(certFile);
        if (data) {
          tlsOpts.cert = data;
        }
      } else if (cert) {
        tlsOpts.cert = cert;
      }
      if (keyFile) {
        const data = await this.loadFile(keyFile);
        if (data) {
          tlsOpts.key = data;
        }
      } else if (key) {
        tlsOpts.key = key;
      }
      if (caFile) {
        const data = await this.loadFile(caFile);
        if (data) {
          tlsOpts.ca = [data];
        }
      } else if (ca) {
        tlsOpts.ca = ca;
      }
      return Promise.resolve(tlsOpts);
    } catch (err) {
      return Promise.reject(err);
    }
  }

  async startTLS(): Promise<TLSSocket> {
    let tlsError: Error;
    let tlsOpts = {
      socket: this.socket,
      servername: this.tlsName,
      rejectUnauthorized: true,
    };
    if (typeof this.options.tls === "object") {
      try {
        const certOpts = await this.loadClientCerts() || {};
        tlsOpts = extend(tlsOpts, this.options.tls, certOpts);
      } catch (err) {
        return Promise.reject(new NatsError(err.message, ErrorCode.Tls, err));
      }
    }
    const d = deferred<TLSSocket>();
    try {
      const tlsSocket = tlsConnect(tlsOpts, () => {
        tlsSocket.removeAllListeners();
        d.resolve(tlsSocket);
      });
      tlsSocket.on("error", (err) => {
        tlsError = err;
      });
      tlsSocket.on("secureConnect", () => {
        // socket won't be authorized, if the user disabled it
        if (tlsOpts.rejectUnauthorized === false) {
          return;
        }
        if (!tlsSocket.authorized) {
          throw tlsSocket.authorizationError;
        }
      });
      tlsSocket.on("close", () => {
        d.reject(tlsError);
        tlsSocket.removeAllListeners();
      });
    } catch (err) {
      // tls throws errors on bad certs see nats.js#310
      d.reject(NatsError.errorForCode(ErrorCode.Tls, err));
    }
    return d;
  }

  setupHandlers() {
    let connError: Error;
    this.socket.on("data", (frame: Uint8Array) => {
      this.yields.push(frame);
      return this.signal.resolve();
    });
    this.socket.on("error", (err) => {
      connError = err;
    });

    this.socket.on("end", () => {
      this.socket.write(new Uint8Array(0), () => {
        this.socket.end();
      });
    });

    this.socket.on("close", () => {
      this._closed(connError, false);
    });
  }

  [Symbol.asyncIterator](): AsyncIterableIterator<Uint8Array> {
    return this.iterate();
  }

  async *iterate(): AsyncIterableIterator<Uint8Array> {
    const debug = this.options.debug;
    while (true) {
      if (this.yields.length === 0) {
        await this.signal;
      }
      const yields = this.yields;
      this.yields = [];

      for (let i = 0; i < yields.length; i++) {
        if (debug) {
          console.info(`> ${render(yields[i])}`);
        }
        yield yields[i];
      }
      // yielding could have paused and microtask
      // could have added messages. Prevent allocations
      // if possible
      if (this.done) {
        break;
      } else if (this.yields.length === 0) {
        yields.length = 0;
        this.yields = yields;
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

  _send(frame: Uint8Array): Promise<void> {
    if (this.isClosed || this.socket === undefined) {
      return Promise.resolve();
    }
    if (this.options.debug) {
      console.info(`< ${render(frame)}`);
    }
    const d = deferred<void>();
    try {
      this.socket.write(frame, (err: Error | undefined) => {
        if (err) {
          if (this.options.debug) {
            console.error(`!!! ${render(frame)}: ${err}`);
          }
          return d.reject(err);
        }
        return d.resolve();
      });
    } catch (err) {
      if (this.options.debug) {
        console.error(`!!! ${render(frame)}: ${err}`);
      }
      d.reject(err);
    }
    return d;
  }

  send(frame: Uint8Array): void {
    const p = this._send(frame);
    p.catch((_err) => {
      // we ignore write errors because client will
      // fail on a read or when the heartbeat timer
      // detects a stale connection
    });
  }

  private async _closed(err?: Error, internal = true): Promise<void> {
    // if this connection didn't succeed, then ignore it.
    if (!this.connected) return;
    if (this.done) return;
    this.closeError = err;
    // only try to flush the outbound buffer if we got no error and
    // the close is internal, if the transport closed, we are done.
    if (!err && this.socket && internal) {
      try {
        await this._send(new TextEncoder().encode(""));
      } catch (err) {
        if (this.options.debug) {
          console.log("transport close terminated with an error", err);
        }
      }
    }
    try {
      if (this.socket) {
        this.socket.removeAllListeners();
        this.socket.destroy();
        this.socket = undefined;
      }
    } catch (err) {
      console.log(err);
    }

    this.done = true;
    this.closedNotification.resolve(this.closeError);
  }

  closed(): Promise<void | Error> {
    return this.closedNotification;
  }
}

export async function nodeResolveHost(s: string): Promise<string[]> {
  const a = deferred<string[] | Error>();
  const aaaa = deferred<string[] | Error>();

  dns.resolve4(s, (err: Error, records: string[]) => {
    if (err) {
      a.resolve(err);
    } else {
      a.resolve(records);
    }
  });

  dns.resolve6(s, (err: Error, records: string[]) => {
    if (err) {
      aaaa.resolve(err);
    } else {
      aaaa.resolve(records);
    }
  });

  const ips: string[] = [];
  const da = await a;
  if (Array.isArray(da)) {
    ips.push(...da);
  }
  const daaaa = await aaaa;
  if (Array.isArray(daaaa)) {
    ips.push(...daaaa);
  }
  if (ips.length === 0) {
    ips.push(s);
  }
  return ips;
}
