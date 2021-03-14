/*
 * Copyright 2021 The NATS Authors
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
const path = require("path");
const fs = require("fs");
const os = require("os");
const { NatsServer } = require("./launcher");
const { connect } = require("../../index");

const jsopts = {
  // debug: true,
  // trace: true,
  jetstream: {
    max_file_store: 1024 * 1024,
    max_memory_store: 1024 * 1024,
    store_dir: "/tmp",
  },
};
exports.jsopts = jsopts;

function jetstreamExportServerConf(
  opts = {},
  prefix = "IPA.>",
  randomStoreDir = true,
) {
  const template = {
    no_auth_user: "a",
    accounts: {
      JS: {
        jetstream: "enabled",
        users: [{ user: "js", password: "js" }],
        exports: [{ service: "$JS.API.>" }, {
          stream: "A.>",
          accounts: ["A"],
        }],
      },
      A: {
        users: [{ user: "a", password: "s3cret" }],
        imports: [
          { service: { subject: "$JS.API.>", account: "JS" }, to: prefix },
          { stream: { subject: "A.>", account: "JS" } },
        ],
      },
    },
  };
  const conf = Object.assign(template, opts);
  return jetstreamServerConf(conf, randomStoreDir);
}
exports.jetstreamExportServerConf = jetstreamExportServerConf;

function jetstreamServerConf(
  opts = {},
  randomStoreDir = true,
) {
  const conf = Object.assign(opts, jsopts);
  if (randomStoreDir) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jetstream-"));
    conf.jetstream.store_dir = dir;
  }
  return opts;
}
exports.jetstreamServerConf = jetstreamServerConf;

async function setup(
  serverConf = {},
  clientOpts = {},
) {
  const dt = serverConf;
  const debug = dt && (dt.debug || dt.trace);
  const ns = await NatsServer.start(serverConf, debug);
  clientOpts = clientOpts ? clientOpts : {};
  const copts = Object.assign({ port: ns.port }, clientOpts);
  const nc = await connect(copts);
  return { ns, nc };
}
exports.setup = setup;
