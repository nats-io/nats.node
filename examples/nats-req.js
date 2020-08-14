#!/usr/bin/env node

const parse = require("minimist");
const { connect, StringCodec } = require("../nats");
const { delay } = require("./util");

const argv = parse(
  process.argv.slice(2),
  {
    alias: {
      "s": ["server"],
      "c": ["count"],
      "i": ["interval"],
      "t": ["timeout"],
    },
    default: {
      s: "127.0.0.1:4222",
      c: 1,
      i: 0,
      t: 1000,
    },
    boolean: true,
    string: ["server", "count", "interval", "headers"],
  },
);

const opts = { servers: argv.s };
const subject = String(argv._[0]);
const payload = String(argv._[1]) || "";
const count = (argv.c == -1 ? Number.MAX_SAFE_INTEGER : argv.c) || 1;
const interval = argv.i;

if (argv.headers) {
  opts.headers = true;
}

if (argv.debug) {
  opts.debug = true;
}

if (argv.h || argv.help || !subject) {
  console.log(
    "Usage: nats-pub [-s server] [-c <count>=1] [-t <timeout>=1000] [-i <interval>=0] [--headers] subject [msg]",
  );
  console.log("to request forever, specify -c=-1 or --count=-1");
  process.exit(1);
}

const sc = StringCodec();

(async () => {
  const nc = await connect(opts);
  nc.closed()
    .then((err) => {
      if (err) {
        console.error(`closed with an error: ${err.message}`);
      }
    });

  for (let i = 1; i <= count; i++) {
    await nc.request(subject, sc.encode(payload), { timeout: argv.t })
      .then((m) => {
        console.log(`[${i}]: ${sc.decode(m.data)}`);
        if (argv.headers && m.headers) {
          const h = [];
          for (const [key, value] of m.headers) {
            h.push(`${key}=${value}`);
          }
          console.log(`\t${h.join(";")}`);
        }
      })
      .catch((err) => {
        console.log(`[${i}]: request failed: ${err.message}`);
      });
    if (interval) {
      await delay(interval);
    }
  }
  await nc.flush();
  await nc.close();
})();
