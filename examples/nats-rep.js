#!/usr/bin/env node

const parse = require("minimist");
const { connect, StringCodec, headers, credsAuthenticator } = require("../");
const fs = require("fs");

const argv = parse(
  process.argv.slice(2),
  {
    alias: {
      "s": ["server"],
      "q": ["queue"],
      "e": ["echo"],
      "f": ["creds"],
    },
    default: {
      s: "127.0.0.1:4222",
      q: "",
    },
    boolean: ["echo", "headers", "debug"],
    string: ["server", "queue", "creds"],
  },
);

const opts = { servers: argv.s };
const subject = argv._[0] ? String(argv._[0]) : "";
const payload = argv._[1] || "";

if (argv.debug) {
  opts.debug = true;
}

if (argv.creds) {
  const data = fs.readFileSync(argv.creds);
  opts.authenticator = credsAuthenticator(data);
}

if (argv.h || argv.help || !subject || (argv._[1] && argv.q)) {
  console.log(
    "Usage: nats-rep [-s server] [--creds=/path/file.creds] [-q queue] [--headers='k=v;k2=v2'] [-e echo_payload] subject [payload]",
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
    const hdrs = argv.headers ? (argv.e ? m.headers : headers()) : undefined;
    if (hdrs) {
      hdrs.set("sequence", sub.getProcessed().toString());
      hdrs.set("time", Date.now().toString());
    }
    if (m.respond(argv.e ? m.data : sc.encode(payload), { headers: hdrs })) {
      console.log(`[${sub.getProcessed()}]: ${m.reply}: ${m.data}`);
    } else {
      console.log(`[${sub.getProcessed()}]: ignored - no reply subject`);
    }
  }
})();
