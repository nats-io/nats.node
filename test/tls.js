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
const { buildAuthenticator, extend, Connect} = require("@nats-io/nats-core/internal");

const dir = process.cwd();
const tlsConfig = {
  host: "0.0.0.0",
  tls: {
    cert_file: resolve(join(dir, "./test/certs/server.pem")),
    key_file: resolve(join(dir, "./test/certs/key.pem")),
    ca_file: resolve(join(dir, "./test/certs/ca.pem")),
  },
};

test("tls - fail if server doesn't support TLS", async (t) => {
  t.plan(1);
  const ns = await NatsServer.start({ host: "0.0.0.0" });
  const lock = Lock();
  await connect({ servers: `localhost:${ns.port}`, tls: {} })
    .then(() => {
      t.fail("shouldn't have connected");
    })
    .catch((err) => {
      t.is(err.code, ErrorCode.ServerOptionNotAvailable);
      lock.unlock();
    });
  await lock;
  await ns.stop();
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
    keyFile: resolve(join(dir, "./test/certs/client-key.pem")),
    certFile: resolve(join(dir, "./test/certs/client-cert.pem")),
    caFile: resolve(join(dir, "./test/certs/ca.pem")),
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
    key: readFileSync(resolve(join(dir, "./test/certs/client-key.pem"))),
    cert: readFileSync(resolve(join(dir, "./test/certs/client-cert.pem"))),
    ca: readFileSync(resolve(join(dir, "./test/certs/ca.pem"))),
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

test("tls - bad file paths", async (t) => {
  const ns = await NatsServer.start(tlsConfig);
  const certs = {
    keyFile: "./test/certs/client-key.pem",
    certFile: "./x/certs/client-cert.pem",
    caFile: "./test/certs/ca.pem",
  };
  try {
    await connect({
      port: ns.port,
      tls: certs,
    });
    t.fail("should have not connected");
  } catch (err) {
    t.true(err.message.indexOf("/x/certs/client-cert.pem doesn't exist") > -1);
  }

  await ns.stop();
  t.pass();
});

test("tls - shouldn't leak tls config", (t) => {
  const tlsOptions = {
    keyFile: resolve(join(dir, "./test/certs/client-key.pem")),
    certFile: resolve(join(dir, "./test/certs/client-cert.pem")),
    caFile: resolve(join(dir, "./test/certs/ca.pem")),
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
    keyFile: resolve(join(dir, "./test/certs/client-key.pem")),
    certFile: resolve(join(dir, "./test/certs/ca.pem")),
    caFile: resolve(join(dir, "./test/certs/server.pem")),
  },
  "ERR_OSSL_X509_KEY_VALUES_MISMATCH",
  /key values mismatch/i,
);

test(
  "tls - invalid pem no start",
  tlsInvalidCertMacro,
  {
    keyFile: resolve(join(dir, "./test/certs/client-cert.pem")),
    certFile: resolve(join(dir, "./test/certs/client-key.pem")),
    caFile: resolve(join(dir, "./test/certs/ca.pem")),
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

test("tls - available connects with or without", async (t) => {
  t.plan(4);
  const conf = Object.assign({}, { allow_non_tls: true }, tlsConfig);
  const ns = await NatsServer.start(conf);

  // test will fail to connect because the certificate is
  // not trusted, but the upgrade process was attempted.
  try {
    await connect({
      servers: `localhost:${ns.port}`,
    });
    t.fail("shouldn't have connected");
  } catch (err) {
    t.is(err.message, "unable to verify the first certificate");
  }

  // will upgrade to tls as tls is required
  const a = connect({
    servers: `localhost:${ns.port}`,
    tls: {
      caFile: resolve(join(dir, "./test/certs/ca.pem")),
    },
  });
  // will NOT upgrade to tls
  const b = connect({
    servers: `localhost:${ns.port}`,
    tls: null,
  });
  const conns = await Promise.all([a, b]);
  await conns[0].flush();
  await conns[1].flush();

  t.is(conns[0].protocol.transport.isEncrypted(), true);
  t.is(conns[1].protocol.transport.isEncrypted(), false);

  await ns.stop();
  t.pass();
});

test("tls - tls first", async (t) => {
  const ns = await NatsServer.start({
    host: "0.0.0.0",
    tls: {
      handshake_first: true,
      cert_file: resolve(join(dir, "./test/certs/server.pem")),
      key_file: resolve(join(dir, "./test/certs/key.pem")),
      ca_file: resolve(join(dir, "./test/certs/ca.pem")),
    },
  });

  const nc = await connect({
    port: ns.port,
    tls: {
      handshakeFirst: true,
      ca: readFileSync(resolve(join(dir, "./test/certs/ca.pem"))),
    },
  });

  await nc.flush();
  await nc.close();
  await ns.stop();
  t.pass();
});
