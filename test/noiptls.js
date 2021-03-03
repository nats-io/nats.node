/*
 * Copyright 2020-2021 The NATS Authors
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
const test = require("ava");
const {
  connect,
  Events,
} = require(
  "../",
);

const { resolve, join } = require("path");
const { Lock } = require("./helpers/lock");
const { NatsServer } = require("./helpers/launcher");

const dir = process.cwd();
const tlsConfig = {
  trace: true,
  tls: {
    cert_file: resolve(join(dir, "./test/certs/localhost_noip.crt")),
    key_file: resolve(join(dir, "./test/certs/localhost_noip.key")),
  },
};

test("tls - reconnect via tls by ip", async (t) => {
  if (process.env.CI) {
    t.log("skipped test");
    t.pass();
    return;
  }

  const servers = await NatsServer.startCluster(3, tlsConfig);
  const nc = await connect(
    {
      port: servers[0].port,
      reconnectTimeWait: 250,
      tls: {
        caFile: resolve(join(dir, "./test/certs/ca.crt")),
      },
    },
  );

  await nc.flush();
  const lock = Lock();
  const iter = nc.status();
  (async () => {
    for await (const e of iter) {
      if (e.type === Events.Reconnect) {
        lock.unlock();
      }
    }
  })().then();

  await servers[0].stop();
  await lock;
  t.pass();
  await nc.close();
  await NatsServer.stopAll(servers);
});
