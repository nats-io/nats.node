/*
 * Copyright 2018-2022 The NATS Authors
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
const test = require("ava");
const {
  connect,
  Empty,
  headers,
  nuid,
  StringCodec,
} = require(
  "../index",
);
const { AckPolicy, consumerOpts, jetstream, jetstreamManager } = require("@nats-io/jetstream");
const { delay, DataBuffer } = require("@nats-io/nats-core/internal");
const { NatsServer } = require("./helpers/launcher");
const { jetstreamServerConf } = require("./helpers/jsutil");
const { setTimeout } = require("timers");
const { Kvm } = require("@nats-io/kv");
const { Objm } = require("@nats-io/obj");

test("jetstream - jsm", async (t) => {
  const ns = await NatsServer.start(jetstreamServerConf());
  const nc = await connect({ port: ns.port });

  const jsm = await jetstreamManager(nc);
  const ai = await jsm.getAccountInfo();
  // we made one api call, so
  t.is(ai.api.total, 1);
  t.is(ai.type, "io.nats.jetstream.api.v1.account_info_response");

  let streams = await jsm.streams.list().next();
  t.is(streams.length, 0);

  let si = await jsm.streams.add({ name: "stream", subjects: ["hello.>"] });
  t.is(si.config.name, "stream");
  t.is(si.config.subjects.length, 1);
  t.is(si.config.subjects[0], "hello.>");
  t.is(si.state.messages, 0);

  streams = await jsm.streams.list().next();
  t.is(streams.length, 1);
  t.is(streams[0].config.name, "stream");

  const h = headers();
  h.set("xxx", "a");
  nc.publish("hello.world", Empty, { headers: h });
  nc.publish("hello.world", Empty, { headers: h });
  await nc.flush();

  si = await jsm.streams.info("stream");
  t.is(si.state.messages, 2);

  const conf = si.config;
  conf.subjects.push("goodbye.>");
  await jsm.streams.update("stream", conf);

  const name = await jsm.streams.find("goodbye.>");
  t.is(name, "stream");

  let ci = await jsm.consumers.add("stream", {
    durable_name: "me",
    ack_policy: AckPolicy.Explicit,
  });
  t.is(ci.name, "me");
  t.is(ci.delivered.stream_seq, 0);
  t.is(ci.num_pending, 2);

  let consumers = await jsm.consumers.list("stream").next();
  t.is(consumers.length, 1);

  ci = await jsm.consumers.info("stream", "me");
  t.is(ci.name, "me");

  let ok = await jsm.consumers.delete("stream", "me");
  t.is(ok, true);

  await t.throwsAsync(async () => {
    await jsm.consumers.info("stream", "me");
  }, { message: "consumer not found" });

  consumers = await jsm.consumers.list("stream").next();
  t.is(consumers.length, 0);

  const sm = await jsm.streams.getMessage("stream", { seq: 2 });
  t.is(sm.seq, 2);
  t.truthy(sm.header);
  t.is(sm.header.get("xxx"), "a");

  ok = await jsm.streams.deleteMessage("stream", 1);
  t.is(ok, true);

  si = await jsm.streams.info("stream");
  t.is(si.state.messages, 1);

  const pr = await jsm.streams.purge("stream");
  t.is(pr.purged, 1);
  t.is(pr.success, true);

  ok = await jsm.streams.delete("stream");
  t.is(ok, true);

  await t.throwsAsync(async () => {
    await jsm.streams.info("stream");
  }, { message: "stream not found" });

  streams = await jsm.streams.list().next();
  t.is(streams.length, 0);

  await nc.flush();
  await nc.close();
  await ns.stop();
});

test("jetstream - pull", async (t) => {
  const ns = await NatsServer.start(jetstreamServerConf());
  const nc = await connect({ port: ns.port });

  const jsm = await jetstreamManager(nc);
  await jsm.streams.add({ name: "stream", subjects: ["hello.>"] });
  await jsm.consumers.add("stream", {
    durable_name: "me",
    ack_policy: AckPolicy.Explicit,
  });

  const js = jetstream(nc);
  await t.throwsAsync(async () => {
    await js.pull("stream", "me");
  }, { message: /no messages$/ });

  let pa = await js.publish("hello.world", Empty, {
    expect: { lastSequence: 0 },
  });
  t.is(pa.seq, 1);
  pa = await js.publish("hello.world", Empty, { expect: { lastSequence: 1 } });
  t.is(pa.seq, 2);

  let m = await js.pull("stream", "me");
  t.is(m.seq, 1);
  m.ack();
  m = await js.pull("stream", "me");
  t.is(m.seq, 2);
  m.ack();
  await t.throwsAsync(async () => {
    await js.pull("stream", "me");
  }, { message: /no messages$/ });

  await nc.flush();
  await nc.close();
  await ns.stop();
});

test("jetstream - fetch", async (t) => {
  const ns = await NatsServer.start(jetstreamServerConf());
  const nc = await connect({ port: ns.port });

  const jsm = await jetstreamManager(nc);
  await jsm.streams.add({ name: "stream", subjects: ["hello.>"] });
  await jsm.consumers.add("stream", {
    durable_name: "me",
    ack_policy: AckPolicy.Explicit,
  });

  const js = jetstream(nc);
  let iter = await js.fetch("stream", "me", { no_wait: true });
  await (async () => {
    for await (const m of iter) {
      // nothing
    }
  })();
  t.is(iter.getProcessed(), 0);

  let pa = await js.publish("hello.world", Empty, {
    expect: { lastSequence: 0 },
  });
  t.is(pa.seq, 1);
  pa = await js.publish("hello.world", Empty, { expect: { lastSequence: 1 } });
  t.is(pa.seq, 2);
  pa = await js.publish("hello.world", Empty, { expect: { lastSequence: 2 } });
  t.is(pa.seq, 3);

  iter = await js.fetch("stream", "me", { no_wait: true, batch: 2 });
  await (async () => {
    for await (const m of iter) {
      m.ack();
    }
  })();
  t.is(iter.getProcessed(), 2);

  iter = await js.fetch("stream", "me", { no_wait: true, batch: 2 });
  await (async () => {
    for await (const m of iter) {
      m.ack();
    }
  })();
  t.is(iter.getProcessed(), 1);

  iter = await js.fetch("stream", "me", { no_wait: true, batch: 3 });
  await (async () => {
    for await (const m of iter) {
      m.ack();
    }
  })();
  t.is(iter.getProcessed(), 0);

  await nc.flush();
  await nc.close();
  await ns.stop();
});

test("jetstream - jetstream sub", async (t) => {
  const ns = await NatsServer.start(jetstreamServerConf());
  const nc = await connect({ port: ns.port });

  const jsm = await jetstreamManager(nc);
  await jsm.streams.add({ name: "stream", subjects: ["hello.>"] });

  const js = jetstream(nc);
  let pa = await js.publish("hello.world", Empty, {
    expect: { lastSequence: 0 },
  });
  t.is(pa.seq, 1);
  pa = await js.publish("hello.world", Empty, { expect: { lastSequence: 1 } });
  t.is(pa.seq, 2);
  pa = await js.publish("hello.world", Empty, { expect: { lastSequence: 2 } });
  t.is(pa.seq, 3);

  const cob = consumerOpts();
  cob.durable("me");
  cob.deliverTo("hi");
  cob.ackExplicit();
  cob.deliverAll();

  cob.maxMessages(3);
  let iter = await js.subscribe("hello.>", cob);
  await (async () => {
    for await (const m of iter) {
      m.ack();
    }
  })();
  t.is(iter.getProcessed(), 3);
  await nc.close();
  await ns.stop();
});

test("jetstream - jetstream pullsub", async (t) => {
  const ns = await NatsServer.start(jetstreamServerConf());
  let nc = await connect({ port: ns.port });

  const jsm = await jetstreamManager(nc);
  await jsm.streams.add({ name: "stream", subjects: ["hello.>"] });

  let js = jetstream(nc);
  let pa = await js.publish("hello.world", Empty);
  t.is(pa.seq, 1);
  pa = await js.publish("hello.world", Empty);
  t.is(pa.seq, 2);
  pa = await js.publish("hello.world", Empty);
  t.is(pa.seq, 3);

  const cob = consumerOpts();
  cob.durable("me");
  cob.ackExplicit();
  cob.deliverAll();
  cob.maxMessages(3);

  const sub = await js.pullSubscribe("hello.>", cob);
  const done = (async () => {
    for await (const m of sub) {
      m.ack();
    }
  })();

  // pull one
  sub.pull({ batch: 1, expires: 100 });
  await delay(150);
  t.is(sub.getProcessed(), 1);

  // pull two more
  sub.pull({ batch: 2, expires: 100 });
  await delay(150);
  t.is(sub.getProcessed(), 3);

  await done;
  t.is(sub.getProcessed(), 3);

  await delay(1000);
  await nc.close();
  await ns.stop();
});

test("jetstream - qsub ackall", async (t) => {
  const ns = await NatsServer.start(jetstreamServerConf());
  let nc = await connect({ port: ns.port });
  const jsm = await jetstreamManager(nc);
  const stream = nuid.next();
  const subj = nuid.next();
  await jsm.streams.add({ name: stream, subjects: [subj] });

  const js = jetstream(nc);

  const opts = consumerOpts();
  opts.queue("q");
  opts.durable("n");
  opts.deliverTo("here");
  opts.ackAll();
  opts.deliverAll();
  opts.callback((_err, _m) => {});

  const sub = await js.subscribe(subj, opts);
  const sub2 = await js.subscribe(subj, opts);

  for (let i = 0; i < 100; i++) {
    await js.publish(subj, Empty);
  }
  await nc.flush();
  await sub.drain();
  await sub2.drain();

  t.true(sub.getProcessed() > 0);
  t.true(sub2.getProcessed() > 0);
  t.is(sub.getProcessed() + sub2.getProcessed(), 100);

  const ci = await jsm.consumers.info(stream, "n");
  t.is(ci.num_pending, 0);
  t.is(ci.num_ack_pending, 0);

  await nc.close();
  await ns.stop();
});

test("jetstream - kv basics", async (t) => {
  const ns = await NatsServer.start(jetstreamServerConf());
  const nc = await connect({ port: ns.port });
  const kvm = new Kvm(nc);

  const kv = await kvm.create("test");
  const sc = StringCodec();
  await kv.put("a", sc.encode("hello"));
  const v = await kv.get("a");
  t.truthy(v);
  t.is(v.bucket, "test");
  t.is(v.key, "a");
  t.is(sc.decode(v.value), "hello");

  await nc.close();
  await ns.stop();
});

function readableStreamFrom(data) {
  return new ReadableStream({
    pull(controller) {
      controller.enqueue(data);
      controller.close();
    },
  });
}

async function fromReadableStream(
  rs,
) {
  const buf = new DataBuffer();
  const reader = rs.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      return buf.drain();
    }
    if (value && value.length) {
      buf.fill(value);
    }
  }
}

test("jetstream - os basics", async (t) => {
  if (parseInt(process.versions.node.split(".")[0]) < 16) {
    t.log(
      `node ${process.versions.node} cannot run objectstore as webcrypto and ReadableStream are not available`,
    );
    t.pass();
    return;
  }
  const ns = await NatsServer.start(jetstreamServerConf());
  const nc = await connect({ port: ns.port });

  const objm = new Objm(nc);
  const os = await objm.create("test");
  const sc = StringCodec();

  await os.put({ name: "a" }, readableStreamFrom(sc.encode("hello")));
  const v = await os.get("a");
  t.truthy(v);
  t.is(v.info.bucket, "test");
  t.is(v.info.name, "a");
  t.is(v.info.chunks, 1);
  t.is(sc.decode(await fromReadableStream(v.data)), "hello");

  await nc.close();
  await ns.stop();
});

test("jetstream - consumer basics", async (t) => {
  const ns = await NatsServer.start(jetstreamServerConf());
  const nc = await connect({ port: ns.port });
  const js = jetstream(nc);

  await t.throwsAsync(async () => {
    await js.consumers.get("stream", "a");
  }, { message: "stream not found" });

  await t.throwsAsync(async () => {
    await js.streams.get("stream");
  }, { message: "stream not found" });

  const jsm = await jetstreamManager(nc);
  await jsm.streams.add({ name: "stream", subjects: ["hello.>"] });

  const s = await js.streams.get("stream");
  t.truthy(s);
  t.is(s.name, "stream");

  await t.throwsAsync(async () => {
    await js.consumers.get("stream", "a");
  }, { message: "consumer not found" });

  await t.throwsAsync(async () => {
    await s.getConsumer("a");
  }, { message: "consumer not found" });

  await jsm.consumers.add("stream", {
    name: "a",
    ack_policy: AckPolicy.ackExplicit,
  });

  let c = await js.consumers.get("stream", "a");
  t.truthy(c);

  c = await s.getConsumer("a");
  t.truthy(c);

  let ci = await c.info(true);
  t.is(ci.name, "a");
  t.is(ci.num_pending, 0);

  let m = await c.next({ expires: 1000 });
  t.is(m, null);

  await js.publish("hello.a");
  await js.publish("hello.b");
  await js.publish("hello.c");
  await js.publish("hello.d");

  ci = await c.info();
  t.is(ci.num_pending, 4);

  m = await c.next();
  m.ack();
  t.is(m.subject, "hello.a");

  let iter = await c.fetch({ max_messages: 2 });
  const buf = [];
  for await (let m of iter) {
    buf.push(m);
    m.ack();
  }
  t.is(iter.getProcessed(), 2);
  t.is(buf.length, 2);
  t.is(buf[0].subject, "hello.b");
  t.is(buf[1].subject, "hello.c");
  buf.length = 0;

  iter = await c.consume();
  const done = (async () => {
    for await (const m of iter) {
      buf.push(m);
      m.ack();
    }
  })();
  setTimeout(() => {
    iter.stop();
  }, 2000);

  await done;
  t.is(iter.getProcessed(), 1);
  t.is(buf.length, 1);
  t.is(buf[0].subject, "hello.d");

  await nc.close();
  await ns.stop();
});

test("jetstream - ordered consumer basics", async (t) => {
  const ns = await NatsServer.start(jetstreamServerConf());
  const nc = await connect({ port: ns.port });
  const js = jetstream(nc);

  const jsm = await jetstreamManager(nc);
  await jsm.streams.add({ name: "stream", subjects: ["hello.>"] });

  const s = await js.streams.get("stream");

  try {
    await js.consumers.get("stream");
  } catch (err) {
    if (err.message.indexOf("is only supported on") !== -1) {
      t.log(err.message);
      t.pass();
      await nc.close();
      await ns.stop();
      return;
    } else {
      t.fail(err);
    }
  }

  let c = await js.consumers.get("stream");
  t.truthy(c);

  c = await s.getConsumer();
  t.truthy(c);

  let ci = await c.info(true);
  t.is(ci.num_pending, 0);

  let m = await c.next({ expires: 1000 });
  t.is(m, null);

  await js.publish("hello.a");
  await js.publish("hello.b");
  await js.publish("hello.c");
  await js.publish("hello.d");

  ci = await c.info();
  t.is(ci.num_pending, 4);

  m = await c.next();
  m.ack();
  t.is(m.subject, "hello.a");

  c = await js.consumers.get("stream");
  let iter = await c.fetch({ max_messages: 4 });
  const buf = [];
  for await (let m of iter) {
    buf.push(m);
    m.ack();
  }
  t.is(iter.getProcessed(), 4);
  t.is(buf.length, 4);
  t.is(buf[0].subject, "hello.a");
  t.is(buf[1].subject, "hello.b");
  t.is(buf[2].subject, "hello.c");
  t.is(buf[3].subject, "hello.d");
  buf.length = 0;

  c = await js.consumers.get("stream");
  iter = await c.consume();
  const done = (async () => {
    for await (const m of iter) {
      buf.push(m);
      m.ack();
    }
  })();
  setTimeout(() => {
    iter.stop();
  }, 2000);

  await done;
  t.is(iter.getProcessed(), 4);
  t.is(buf.length, 4);

  await nc.close();
  await ns.stop();
});
