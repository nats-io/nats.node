const test = require("ava");
const {
  connect,
  ErrorCode,
} = require(
  "../",
);
const { resolve, join } = require("path");
const { Lock } = require("./helpers/lock");
const { NatsServer } = require("./helpers/launcher");

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
      t.is(err.code, ErrorCode.SERVER_OPTION_NA);
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

async function tlsInvalidCertMacro(t, conf, tlsCode) {
  t.plan(3);
  const ns = await NatsServer.start(tlsConfig);
  try {
    await connect({ servers: `localhost:${ns.port}`, tls: conf });
    t.fail("shouldn't have connected");
  } catch (err) {
    t.is(err.code, ErrorCode.TLS);
    t.truthy(err.chainedError);
    t.is(err.chainedError.code, tlsCode);
  }
  await ns.stop();
}

test("tls - invalid cert", tlsInvalidCertMacro, {
  keyFile: resolve(join(dir, "./test/certs/client.key")),
  certFile: resolve(join(dir, "./test/certs/ca.crt")),
  caFile: resolve(join(dir, "./test/certs/localhost.crt")),
}, "ERR_OSSL_X509_KEY_VALUES_MISMATCH");

test("tls - invalid pem no start", tlsInvalidCertMacro, {
  keyFile: resolve(join(dir, "./test/certs/client.crt")),
  certFile: resolve(join(dir, "./test/certs/client.key")),
  caFile: resolve(join(dir, "./test/certs/ca.crt")),
}, "ERR_OSSL_PEM_NO_START_LINE");

async function tlsInvalidArgPathMacro(t, conf, arg) {
  t.plan(2);
  const ns = await NatsServer.start(tlsConfig);
  try {
    await connect({ servers: `localhost:${ns.port}`, tls: conf });
    t.fail("shouldn't have connected");
  } catch (err) {
    t.is(err.code, ErrorCode.TLS);
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
