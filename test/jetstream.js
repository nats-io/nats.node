/*
 * Copyright 2018-2021 The NATS Authors
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
const { connect, Empty, headers } = require(
  "../",
);
const { AckPolicy } = require("../lib/nats-base-client/types");
const { consumerOpts } = require("../lib/nats-base-client/jsconsumeropts");
const { delay } = require("../lib/nats-base-client/internal_mod");
const { NatsServer } = require("./helpers/launcher");
const { jetstreamServerConf } = require("./helpers/jsutil");

test("jetstream - jsm", async (t) => {
  const ns = await NatsServer.start(jetstreamServerConf());
  const nc = await connect({ port: ns.port });

  const jsm = await nc.jetstreamManager();
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

  si = await jsm.streams.info("stream");
  t.is(si.state.messages, 2);

  const conf = si.config;
  conf.subjects.push("goodbye.>");
  await jsm.streams.update(conf);

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

  const sm = await jsm.streams.getMessage("stream", 2);
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

  const jsm = await nc.jetstreamManager();
  await jsm.streams.add({ name: "stream", subjects: ["hello.>"] });
  await jsm.consumers.add("stream", {
    durable_name: "me",
    ack_policy: AckPolicy.Explicit,
  });

  const js = nc.jetstream();
  await t.throwsAsync(async () => {
    await js.pull("stream", "me");
  }, { message: "no messages" });

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
  }, { message: "no messages" });

  await nc.flush();
  await nc.close();
  await ns.stop();
});

test("jetstream - fetch", async (t) => {
  const ns = await NatsServer.start(jetstreamServerConf());
  const nc = await connect({ port: ns.port });

  const jsm = await nc.jetstreamManager();
  await jsm.streams.add({ name: "stream", subjects: ["hello.>"] });
  await jsm.consumers.add("stream", {
    durable_name: "me",
    ack_policy: AckPolicy.Explicit,
  });

  const js = nc.jetstream();
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

  const jsm = await nc.jetstreamManager();
  await jsm.streams.add({ name: "stream", subjects: ["hello.>"] });

  const js = nc.jetstream();
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

  const jsm = await nc.jetstreamManager();
  await jsm.streams.add({ name: "stream", subjects: ["hello.>"] });

  let js = nc.jetstream();
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
