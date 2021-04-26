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
  ErrorCode,
} = require(
  "../",
);
const { resolve, join } = require("path");
const { readFileSync } = require("fs");
const { Lock } = require("./helpers/lock");
const { NatsServer } = require("./helpers/launcher");
const { buildAuthenticator } = require("../lib/nats-base-client/authenticator");
const { extend } = require("../lib/nats-base-client/util");
const { Connect } = require("../lib/nats-base-client/protocol");

const dir = process.cwd();
const tlsConfig = {
  host: "0.0.0.0",
  tls: {
    cert_file: resolve(join(dir, "./test/certs/localhost.crt")),
    key_file: resolve(join(dir, "./test/certs/localhost.key")),
    ca_file: resolve(join(dir, "./test/certs/ca.crt")),
  },
};

test("tls - fail if server doesn't support TLS", async (t) => {
  t.plan(1);
  const lock = Lock();
  await connect({ servers: "demo.nats.io:4222", tls: {} })
    .then(() => {
      t.fail("shouldn't have connected");
    })
    .catch((err) => {
      t.is(err.code, ErrorCode.ServerOptionNotAvailable);
      lock.unlock();
    });
  await lock;
});

test("tls - connects to tls without option", async (t) => {
  const nc = await connect({ servers: "demo.nats.io:4443" });
  await nc.flush();
  await nc.close();
  t.pass();
});

test("tls - custom ca fails without proper ca", async (t) => {
  t.plan(1);
  const ns = await NatsServer.start(tlsConfig);
  const lock = Lock();
  await connect({ servers: `localhost:${ns.port}`, maxReconnectAttempts: 4 })
    .then(() => {
      t.fail("shouldn't have connected without client ca");
    })
    .catch(() => {
      // this throws a totally un-useful connection reset.
      t.pass();
      lock.unlock();
    });

  await lock;
  await ns.stop();
});

test("tls - connects with proper ca", async (t) => {
  const ns = await NatsServer.start(tlsConfig);
  const nc = await connect({
    servers: `localhost:${ns.port}`,
    tls: {
      caFile: tlsConfig.tls.ca_file,
    },
  });
  await nc.flush();
  t.true(nc.protocol.transport.socket.authorized);
  await nc.close();
  await ns.stop();
  t.pass();
});

test("tls - connects with rejectUnauthorized is honored", async (t) => {
  const ns = await NatsServer.start(tlsConfig);
  const nc = await connect({
    servers: `localhost:${ns.port}`,
    tls: {
      rejectUnauthorized: false,
    },
  });
  await nc.flush();
  t.false(nc.protocol.transport.socket.authorized);
  await nc.close();
  await ns.stop();
  t.pass();
});

test("tls - client auth", async (t) => {
  const ns = await NatsServer.start(tlsConfig);

  const certs = {
    keyFile: resolve(join(dir, "./test/certs/client.key")),
    certFile: resolve(join(dir, "./test/certs/client.crt")),
    caFile: resolve(join(dir, "./test/certs/ca.crt")),
  };
  const nc = await connect({
    port: ns.port,
    tls: certs,
  });

  await nc.flush();
  await nc.close();
  await ns.stop();
  t.pass();
});

test("tls - client auth direct", async (t) => {
  const ns = await NatsServer.start(tlsConfig);

  const certs = {
    key: readFileSync(resolve(join(dir, "./test/certs/client.key"))),
    cert: readFileSync(resolve(join(dir, "./test/certs/client.crt"))),
    ca: readFileSync(resolve(join(dir, "./test/certs/ca.crt"))),
  };
  const nc = await connect({
    port: ns.port,
    tls: certs,
  });

  await nc.flush();
  await nc.close();
  await ns.stop();
  t.pass();
});

test("tls - shouldn't leak tls config", (t) => {
  const tlsOptions = {
    keyFile: resolve(join(dir, "./test/certs/client.key")),
    certFile: resolve(join(dir, "./test/certs/client.crt")),
    caFile: resolve(join(dir, "./test/certs/ca.crt")),
  };

  let opts = { tls: tlsOptions, cert: "another" };
  const auth = buildAuthenticator(opts);
  opts = extend(opts, auth);

  const c = new Connect({ version: "1.2.3", lang: "test" }, opts);
  const cc = JSON.parse(JSON.stringify(c));
  t.is(cc.tls_required, true);
  t.is(cc.cert, undefined);
  t.is(cc.keyFile, undefined);
  t.is(cc.certFile, undefined);
  t.is(cc.caFile, undefined);
  t.is(cc.tls, undefined);
});

async function tlsInvalidCertMacro(t, conf, tlsCode, re) {
  t.plan(3);
  const ns = await NatsServer.start(tlsConfig);
  try {
    await connect({ servers: `localhost:${ns.port}`, tls: conf });
    t.fail("shouldn't have connected");
  } catch (err) {
    t.is(err.code, ErrorCode.Tls);
    t.truthy(err.chainedError);
    t.truthy(re.exec(err.chainedError.message));
  }
  await ns.stop();
}

test(
  "tls - invalid cert",
  tlsInvalidCertMacro,
  {
    keyFile: resolve(join(dir, "./test/certs/client.key")),
    certFile: resolve(join(dir, "./test/certs/ca.crt")),
    caFile: resolve(join(dir, "./test/certs/localhost.crt")),
  },
  "ERR_OSSL_X509_KEY_VALUES_MISMATCH",
  /key values mismatch/i,
);

test(
  "tls - invalid pem no start",
  tlsInvalidCertMacro,
  {
    keyFile: resolve(join(dir, "./test/certs/client.crt")),
    certFile: resolve(join(dir, "./test/certs/client.key")),
    caFile: resolve(join(dir, "./test/certs/ca.crt")),
  },
  "ERR_OSSL_PEM_NO_START_LINE",
  /no start line/i,
);

async function tlsInvalidArgPathMacro(t, conf, arg) {
  t.plan(2);
  const ns = await NatsServer.start(tlsConfig);
  try {
    await connect({ servers: `localhost:${ns.port}`, tls: conf });
    t.fail("shouldn't have connected");
  } catch (err) {
    t.is(err.code, ErrorCode.Tls);
    const v = conf[arg];
    t.is(err.message, `${v} doesn't exist`);
  }
  await ns.stop();
}

test("tls - invalid key file", tlsInvalidArgPathMacro, {
  keyFile: resolve(join(dir, "./test/certs/client.ky")),
}, "keyFile");

test("tls - invalid cert file", tlsInvalidArgPathMacro, {
  certFile: resolve(join(dir, "./test/certs/client.cert")),
}, "certFile");

test("tls - invalid ca file", tlsInvalidArgPathMacro, {
  caFile: resolve(join(dir, "./test/certs/ca.cert")),
}, "caFile");
