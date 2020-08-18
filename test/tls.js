const test = require("ava");
const {
  connect,
  ErrorCode,
} = require(
  "../nats",
);
const { resolve, join } = require("path");
const { cwd } = require("process");
const { Lock } = require("./helpers/lock");
const { NatsServer } = require("./helpers/launcher");

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
  const dir = cwd();
  const config = {
    host: "0.0.0.0",
    tls: {
      cert_file: resolve(join(dir, "./test/certs/localhost.crt")),
      key_file: resolve(join(dir, "./test/certs/localhost.key")),
      ca_file: resolve(join(dir, "./test/certs/RootCA.crt")),
    },
  };

  const ns = await NatsServer.start(config);
  const lock = Lock();
  await connect({ servers: `localhost:${ns.port}` })
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
  const dir = cwd();
  const config = {
    host: "0.0.0.0",
    tls: {
      cert_file: resolve(join(dir, "./test/certs/localhost.crt")),
      key_file: resolve(join(dir, "./test/certs/localhost.key")),
      ca_file: resolve(join(dir, "./test/certs/RootCA.crt")),
    },
  };

  const ns = await NatsServer.start(config);
  const nc = await connect({
    servers: `localhost:${ns.port}`,
    tls: {
      caFile: config.tls.ca_file,
    },
  });
  await nc.flush();
  t.true(nc.protocol.transport.socket.authorized);
  await nc.close();
  await ns.stop();
  t.pass();
});
