#!/usr/bin/env node

const parse = require("minimist");
const { connect } = require("../nats");

const argv = parse(
  process.argv.slice(2),
  {
    alias: {
      "s": ["server"],
    },
    default: {
      s: "127.0.0.1:4222",
    },
  },
);

const opts = { servers: argv.s };

(async () => {
  const nc = await connect(opts);
  (async () => {
    console.info(`connected ${nc.getServer()}`);
    for await (const s of nc.status()) {
      console.info(`${s.type}: ${JSON.stringify(s.data)}`);
    }
  })().then();

  await nc.closed()
    .then((err) => {
      if (err) {
        console.error(`closed with an error: ${err.message}`);
      }
    });
})();
