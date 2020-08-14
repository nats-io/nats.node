#!/usr/bin/env node

const parse = require("minimist");
const { Nuid, connect, Empty } = require("../nats");

const nuid = new Nuid();

const defaults = {
  s: "127.0.0.1:4222",
  c: 1000000,
  p: 0,
  subject: nuid.next(),
};

const argv = parse(
  process.argv.slice(2),
  {
    alias: {
      "s": ["server"],
      "c": ["count"],
      "d": ["debug"],
      "p": ["payload"],
    },
    default: defaults,
    string: [
      "subject",
    ],
    boolean: [
      "async",
    ],
  },
);

if (argv.h || argv.help || (!argv.sub && !argv.pub && !argv.req)) {
  console.log(
    "usage: bench.ts [--pub] [--sub] [--req (--async)] [--count messages:1M] [--payload <#bytes>] [--server server] [--subject <subj>]\n",
  );
  process.exit(0);
}

const server = argv.server;
const count = parseInt(argv.count);
const bytes = parseInt(argv.payload);
const payload = bytes ? new Uint8Array(bytes) : Empty;

(async () => {
  const nc = await connect({ servers: server, debug: argv.debug });
  const jobs = [];
  const p = new Performance();

  if (argv.req) {
    const sub = nc.subscribe(argv.subject, { max: count });
    const job = (async () => {
      for await (const m of sub) {
        m.respond(payload);
      }
    })();
    jobs.push(job);
  }

  if (argv.sub) {
    let first = false;
    const sub = nc.subscribe(argv.subject, { max: count });
    const job = (async () => {
      for await (const m of sub) {
        if (!first) {
          p.mark("subStart");
          first = true;
        }
      }
      p.mark("subStop");
      p.measure("sub", "subStart", "subStop");
    })();
    jobs.push(job);
  }

  if (argv.pub) {
    const job = (async () => {
      p.mark("pubStart");
      for (let i = 0; i < count; i++) {
        nc.publish(argv.subject, payload);
      }
      await nc.flush();
      p.mark("pubStop");
      p.measure("pub", "pubStart", "pubStop");
    })();
    jobs.push(job);
  }

  if (argv.req) {
    const job = (async () => {
      if (argv.async) {
        p.mark("reqStart");
        const a = [];
        for (let i = 0; i < count; i++) {
          a.push(nc.request(argv.subject, payload, { timeout: 20000 }));
        }
        await Promise.all(a);
        p.mark("reqStop");
        p.measure("req", "reqStart", "reqStop");
      } else {
        p.mark("reqStart");
        for (let i = 0; i < count; i++) {
          await nc.request(argv.subject);
        }
        p.mark("reqStop");
        p.measure("req", "reqStart", "reqStop");
      }
    })();
    jobs.push(job);
  }

  nc.closed()
    .then((err) => {
      if (err) {
        console.error(`bench closed with an error: ${err.message}`);
      }
    });

  await Promise.all(jobs);
  const measures = p.getEntries();
  const req = measures.find((m) => m.name === "req");
  const pub = measures.find((m) => m.name === "pub");
  const sub = measures.find((m) => m.name === "sub");

  if (pub && sub) {
    const sec = (pub.duration + sub.duration) / 1000;
    const mps = Math.round((argv.c * 2) / sec);
    console.log(`pubsub ${mps} msgs/sec - [${sec} secs]`);
  }
  if (pub) {
    const sec = pub.duration / 1000;
    const mps = Math.round(argv.c / sec);
    console.log(`pub    ${mps} msgs/sec - [${sec} secs]`);
  }
  if (sub) {
    const sec = sub.duration / 1000;
    const mps = Math.round(argv.c / sec);
    console.log(`sub    ${mps} msgs/sec - [${sec} secs]`);
  }

  if (req) {
    const sec = req.duration / 1000;
    const mps = Math.round((argv.c * 2) / req.duration);
    const label = argv.async ? "async" : "serial";
    console.log(`req ${label} ${mps} msgs/sec - [${sec} secs]`);
  }

  await nc.close();
})();
