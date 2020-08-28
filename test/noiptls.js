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
  tls: {
    cert_file: resolve(join(dir, "./test/certs/localhost_noip.crt")),
    key_file: resolve(join(dir, "./test/certs/localhost_noip.key")),
  },
};

test("tls - reconnect via tls by ip", async (t) => {
  if(process.env.CI) {
    t.log("skipped test");
    t.pass();
    return;
  }

  const servers = await NatsServer.cluster(3, tlsConfig);
  const nc = await connect(
    {
      port: servers[0].port,
      reconnectTimeWait: 100,
      tls: {
        caFile: resolve(join(dir, "./test/certs/ca.crt")),
      },
    },
  );
  await nc.flush();

  const lock = Lock();
  (async () => {
    for await (const e of nc.status()) {
      if (e.type === Events.RECONNECT) {
        lock.unlock();
      }
    }
  })().then();

  await servers[0].stop();
  await lock;
  await nc.close();
  await NatsServer.stopAll(servers);
  t.pass();
});
