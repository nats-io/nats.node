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
if (typeof TextEncoder === "undefined") {
  const { TextEncoder, TextDecoder } = require("util");
  global.TextEncoder = TextEncoder;
  global.TextDecoder = TextDecoder;
}

if (typeof globalThis.crypto === "undefined") {
  const c = require("crypto");
  // this will patch to undefined if webcrypto is not available (node 14)
  // views will toss if crypto is not available
  global.crypto = c.webcrypto;
}

if (typeof globalThis.ReadableStream === "undefined") {
  // @ts-ignore: node global
  const chunks = process.versions.node.split(".");
  const v = parseInt(chunks[0]);
  if (v >= 16) {
    // this won't mess up fetch
    const streams = require("stream/web");
    // views will toss if ReadableStream is not available
    global.ReadableStream = streams.ReadableStream;
  }
}

export { connect } from "./connect";
export * from "../nats-base-client/mod";
export * from "../jetstream/mod";
