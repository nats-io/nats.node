#!/usr/bin/env node

import * as parse from "minimist";
import { ConnectionOptions, connect, StringCodec } from "../src/mod";

const argv = parse(
  process.argv.slice(2),
  {
    alias: {
      "s": ["server"],
      "q": ["queue"],
    },
    default: {
      s: "127.0.0.1:4222",
      q: "",
    },
    boolean: ["headers", "debug"],
    string: ["server", "queue"],
  },
);

const opts = { servers: argv.s } as ConnectionOptions;
const subject = argv._[0] ? String(argv._[0]) : ">";

if (argv.debug) {
  opts.debug = true;
}

if (argv.headers) {
  opts.headers = true;
}

if (argv.h || argv.help || !subject) {
  console.log("Usage: nats-sub [-s server] [-q queue] [--headers] subject");
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
})()
