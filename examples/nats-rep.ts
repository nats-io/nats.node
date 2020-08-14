#!/usr/bin/env ts-node

import * as parse from "minimist";
import { ConnectionOptions, connect, StringCodec } from "../src/mod";
import { headers } from "../nats-base-client/mod";

const argv = parse(
  process.argv.slice(2),
  {
    alias: {
      "s": ["server"],
      "q": ["queue"],
      "e": ["echo"],
    },
    default: {
      s: "127.0.0.1:4222",
      q: "",
    },
    boolean: ["echo", "headers", "debug"],
    string: ["server", "queue"],
  },
);

const opts = { servers: argv.s } as ConnectionOptions;
const subject = argv._[0] ? String(argv._[0]) : "";
const payload = argv._[1] || "";

if (argv.headers) {
  opts.headers = true;
}

if (argv.debug) {
  opts.debug = true;
}

if (argv.h || argv.help || !subject || (argv._[1] && argv.q)) {
  console.log(
    "Usage: nats-rep [-s server] [-q queue] [--headers] [-e echo_payload] subject [payload]",
  );
  process.exit(1);
}

(async () => {
  const nc = await connect(opts);
  console.info(`connected ${nc.getServer()}`);
  nc.closed()
    .then((err) => {
      if (err) {
        console.error(`closed with an error: ${err.message}`);
      }
    });

  const sc = StringCodec();
  const hdrs = argv.headers ? headers() : undefined;
  const sub = nc.subscribe(subject, { queue: argv.q });
  console.info(`${argv.q !== "" ? "queue " : ""}listening to ${subject}`);
  for await (const m of sub) {
    if (hdrs) {
      hdrs.set("sequence", sub.getProcessed().toString());
      hdrs.set("time", Date.now().toString());
    }
    if (m.respond(argv.e ? m.data : sc.encode(payload), hdrs)) {
      console.log(`[${sub.getProcessed()}]: ${m.reply}: ${m.data}`);
    } else {
      console.log(`[${sub.getProcessed()}]: ignored - no reply subject`);
    }
  }
})();
