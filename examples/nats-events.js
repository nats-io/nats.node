#!/usr/bin/env node

const parse = require("minimist");
const { connect } = require("../");

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
  let nc;
  try {
    nc = await connect(opts);
  } catch (err) {
    console.log(`error connecting to nats: ${err.message}`);
    return;
  }
  console.info(`connected ${nc.getServer()}`);

  (async () => {
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
