#!/usr/bin/env node

const parse = require("minimist");
const { connect, StringCodec, headers, credsAuthenticator } = require("../");
const { delay } = require("./util");
const fs = require("fs");

const argv = parse(
  process.argv.slice(2),
  {
    alias: {
      "s": ["server"],
      "c": ["count"],
      "i": ["interval"],
      "f": ["creds"],
    },
    default: {
      s: "127.0.0.1:4222",
      c: 1,
      i: 0,
    },
    boolean: true,
    string: ["server", "count", "interval", "headers", "creds"],
  },
);

const opts = { servers: argv.s };
const subject = String(argv._[0]);
const payload = argv._[1] || "";
const count = (argv.c === -1 ? Number.MAX_SAFE_INTEGER : argv.c) || 1;
const interval = argv.i || 0;

if (argv.debug) {
  opts.debug = true;
}

if (argv.creds) {
  const data = fs.readFileSync(argv.creds);
  opts.authenticator = credsAuthenticator(data);
}

if (argv.h || argv.help || !subject) {
  console.log(
    "Usage: nats-pub [-s server] [--creds=/path/file.creds] [-c <count>=1] [-i <interval>=0] [--headers='k=v;k2=v2'] subject [msg]",
  );
  console.log("to publish forever, specify -c=-1 or --count=-1");
  process.exit(1);
}

(async () => {
  let nc;
  try {
    nc = await connect(opts);
  } catch (err) {
    console.log(`error connecting to nats: ${err.message}`);
    return;
  }
  console.info(`connected ${nc.getServer()}`);

  nc.closed()
    .then((err) => {
      if (err) {
        console.error(`closed with an error: ${err.message}`);
      }
    });

  const pubopts = {};
  if (argv.headers) {
    const hdrs = headers();
    argv.headers.split(";").map((l) => {
      const [k, v] = l.split("=");
      hdrs.append(k, v);
    });
    pubopts.headers = hdrs;
  }

  const sc = StringCodec();

  for (let i = 1; i <= count; i++) {
    nc.publish(subject, sc.encode(String(payload)), pubopts);
    console.log(`[${i}] ${subject}: ${payload}`);
    if (interval) {
      await delay(interval);
    }
  }
  await nc.flush();
  await nc.close();
})();
