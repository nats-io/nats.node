#!/usr/bin/env node

const parse = require("minimist");
const { connect, StringCodec, credsAuthenticator } = require("../");
const fs = require("fs");

const argv = parse(
  process.argv.slice(2),
  {
    alias: {
      "s": ["server"],
      "q": ["queue"],
      "f": ["creds"],
    },
    default: {
      s: "127.0.0.1:4222",
      q: "",
    },
    boolean: ["headers", "debug"],
    string: ["server", "queue", "creds"],
  },
);

const opts = { servers: argv.s };
const subject = argv._[0] ? String(argv._[0]) : ">";

if (argv.debug) {
  opts.debug = true;
}

if (argv.creds) {
  const data = fs.readFileSync(argv.creds);
  opts.authenticator = credsAuthenticator(data);
}

if (argv.h || argv.help || !subject) {
  console.log(
    "Usage: nats-sub [-s server] [--creds=/path/file.creds] [-q queue] [--headers] subject",
  );
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

  const sc = StringCodec();
  const sub = nc.subscribe(subject, { queue: argv.q });
  console.info(`${argv.q !== "" ? "queue " : ""}listening to ${subject}`);
  for await (const m of sub) {
    console.log(`[${sub.getProcessed()}]: ${m.subject}: ${sc.decode(m.data)}`);
    if (argv.headers && m.headers) {
      const h = [];
      for (const [key, value] of m.headers) {
        h.push(`${key}=${value}`);
      }
      console.log(`\t${h.join(";")}`);
    }
  }
})();
