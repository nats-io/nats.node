#!/usr/bin/env node

const parse = require("minimist");
const { Nuid, connect } = require("../");
const { Bench, Metric } = require("../lib/nats-base-client/bench");

const defaults = {
  s: "127.0.0.1:4222",
  c: 100000,
  p: 128,
  subject: new Nuid().next(),
  i: 1,
  json: false,
  csv: false,
  csvheader: false,
  pendingLimit: 32,
};

const argv = parse(
  process.argv.slice(2),
  {
    alias: {
      "s": ["server"],
      "c": ["count"],
      "d": ["debug"],
      "p": ["payload"],
      "i": ["iterations"],
    },
    default: defaults,
    string: [
      "subject",
    ],
    boolean: [
      "asyncRequests",
      "callbacks",
      "json",
      "csv",
      "csvheader",
    ],
  },
);

if (argv.h || argv.help || (!argv.sub && !argv.pub && !argv.req && !argv.rep)) {
  console.log(
    "usage: bench.ts [--json] [--callbacks] [--csv] [--csvheader] [--pub] [--sub] [--req (--asyncRequests)] [--count <#messages>=100000] [--payload <#bytes>=128] [--iterations <#loop>=1>] [--server server] [--subject <subj>]\n",
  );
  process.exit(0);
}
const server = argv.server;
const count = parseInt(argv.count);
const bytes = parseInt(argv.payload);
const iters = parseInt(argv.iterations);
const pendingLimit = parseInt(argv.pendingLimit) * 1024;
const metrics = [];

(async () => {
  for (let i = 0; i < iters; i++) {
    const nc = await connect(
      { servers: server, debug: argv.debug, noAsyncTraces: true },
    );
    nc.protocol.pendingLimit = pendingLimit;
    const opts = {
      msgs: count,
      size: bytes,
      asyncRequests: argv.asyncRequests,
      callbacks: argv.callbacks,
      pub: argv.pub,
      sub: argv.sub,
      req: argv.req,
      rep: argv.rep,
      subject: argv.subject,
    };

    const bench = new Bench(nc, opts);
    const m = await bench.run();
    metrics.push(...m);
    await nc.close();
  }
})().then(() => {
  const reducer = (a, m) => {
    if (a) {
      a.name = m.name;
      a.payload = m.payload;
      a.bytes += m.bytes;
      a.duration += m.duration;
      a.msgs += m.msgs;
      a.lang = m.lang;
      a.version = m.version;
      a.async = m.async;

      a.max = Math.max(a.max === undefined ? 0 : a.max, m.duration);
      a.min = Math.min(a.min === undefined ? m.duration : a.max, m.duration);
    }
    return a;
  };

  if (!argv.json && !argv.csv) {
    const pubsub = metrics.filter((m) => m.name === "pubsub").reduce(
      reducer,
      new Metric("pubsub", 0),
    );
    const reqrep = metrics.filter((m) => m.name === "reqrep").reduce(
      reducer,
      new Metric("reqrep", 0),
    );
    const pub = metrics.filter((m) => m.name === "pub").reduce(
      reducer,
      new Metric("pub", 0),
    );
    const sub = metrics.filter((m) => m.name === "sub").reduce(
      reducer,
      new Metric("sub", 0),
    );
    const req = metrics.filter((m) => m.name === "req").reduce(
      reducer,
      new Metric("req", 0),
    );
    const rep = metrics.filter((m) => m.name === "rep").reduce(
      reducer,
      new Metric("rep", 0),
    );

    if (pubsub && pubsub.msgs) {
      console.log(pubsub.toString());
    }
    if (reqrep && reqrep.msgs) {
      console.log(reqrep.toString());
    }
    if (pub && pub.msgs) {
      console.log(pub.toString());
    }
    if (sub && sub.msgs) {
      console.log(sub.toString());
    }
    if (req && req.msgs) {
      console.log(req.toString());
    }
    if (rep && rep.msgs) {
      console.log(rep.toString());
    }
  } else if (argv.json) {
    console.log(JSON.stringify(metrics, null, 2));
  } else if (argv.csv) {
    const lines = metrics.map((m) => {
      return m.toCsv();
    });
    if (argv.csvheader) {
      lines.unshift(Metric.header());
    }
    console.log(lines.join(""));
  }
});
