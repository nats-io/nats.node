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
const { connect, ErrorCode, createInbox, Empty } = require(
  "../",
);
const { Lock } = require("./helpers/lock");

const u = "demo.nats.io:4222";

test("autounsub - max option", async (t) => {
  const nc = await connect({ servers: u });
  const subj = createInbox();
  const sub = nc.subscribe(subj, { max: 10 });
  for (let i = 0; i < 20; i++) {
    nc.publish(subj);
  }
  await nc.flush();
  t.is(sub.getReceived(), 10);
  await nc.close();
});

test("autounsub - unsubscribe", async (t) => {
  const nc = await connect({ servers: u });
  const subj = createInbox();
  const sub = nc.subscribe(subj, { max: 10 });
  sub.unsubscribe(11);
  for (let i = 0; i < 20; i++) {
    nc.publish(subj);
  }
  await nc.flush();
  t.is(sub.getReceived(), 11);
  await nc.close();
});

test("autounsub - can unsub from auto-unsubscribed", async (t) => {
  const nc = await connect({ servers: u });
  const subj = createInbox();
  const sub = nc.subscribe(subj, { max: 1 });
  for (let i = 0; i < 20; i++) {
    nc.publish(subj);
  }
  await nc.flush();
  t.is(sub.getReceived(), 1);
  sub.unsubscribe();
  await nc.close();
});

test("autounsub - can break to unsub", async (t) => {
  const nc = await connect({ servers: u });
  const subj = createInbox();
  const sub = nc.subscribe(subj, { max: 20 });
  const iter = (async () => {
    for await (const m of sub) {
      break;
    }
  })();
  for (let i = 0; i < 20; i++) {
    nc.publish(subj);
  }
  await nc.flush();
  await iter;
  t.is(sub.getProcessed(), 1);
  await nc.close();
});

test("autounsub - can change auto-unsub to a higher value", async (t) => {
  const nc = await connect({ servers: u });
  const subj = createInbox();
  const sub = nc.subscribe(subj, { max: 1 });
  sub.unsubscribe(10);
  for (let i = 0; i < 20; i++) {
    nc.publish(subj);
  }
  await nc.flush();
  t.is(sub.getReceived(), 10);
  await nc.close();
});

test("autounsub - request receives expected count with multiple helpers", async (
  t,
) => {
  const nc = await connect({ servers: u });
  const subj = createInbox();

  const fn = (async (sub) => {
    for await (const m of sub) {
      m.respond();
    }
  });
  const subs = [];
  for (let i = 0; i < 5; i++) {
    const sub = nc.subscribe(subj);
    const _ = fn(sub);
    subs.push(sub);
  }
  await nc.request(subj);
  await nc.drain();

  let counts = subs.map((s) => {
    return s.getReceived();
  });
  const count = counts.reduce((a, v) => a + v);
  t.is(count, 5);
});

test("autounsub - manual request receives expected count with multiple helpers", async (
  t,
) => {
  const nc = await connect({ servers: u });
  const subj = createInbox();
  const lock = Lock(5);

  const fn = (async (sub) => {
    for await (const m of sub) {
      m.respond();
      lock.unlock();
    }
  });
  for (let i = 0; i < 5; i++) {
    const sub = nc.subscribe(subj);
    const _ = fn(sub);
  }
  const replySubj = createInbox();
  const sub = nc.subscribe(replySubj);
  nc.publish(subj, Empty, { reply: replySubj });
  await lock;
  await nc.drain();
  t.is(sub.getReceived(), 5);
});

test("autounsub - check subscription leaks", async (t) => {
  let nc = await connect({ servers: u });
  let subj = createInbox();
  let sub = nc.subscribe(subj);
  sub.unsubscribe();
  t.is(nc.protocol.subscriptions.size(), 0);
  await nc.close();
});

test("autounsub - check request leaks", async (t) => {
  let nc = await connect({ servers: u });
  let subj = createInbox();

  // should have no subscriptions
  t.is(nc.protocol.subscriptions.size(), 0);

  let sub = nc.subscribe(subj);
  const _ = (async () => {
    for await (const m of sub) {
      m.respond();
    }
  })();

  // should have one subscription
  t.is(nc.protocol.subscriptions.size(), 1);

  let msgs = [];
  msgs.push(nc.request(subj));
  msgs.push(nc.request(subj));

  // should have 2 mux subscriptions, and 2 subscriptions
  t.is(nc.protocol.subscriptions.size(), 2);
  t.is(nc.protocol.muxSubscriptions.size(), 2);

  await Promise.all(msgs);

  // mux subs should have pruned
  t.is(nc.protocol.muxSubscriptions.size(), 0);

  sub.unsubscribe();
  t.is(nc.protocol.subscriptions.size(), 1);
  await nc.close();
});

test("autounsub - check cancelled request leaks", async (t) => {
  let nc = await connect({ servers: u });
  let subj = createInbox();

  // should have no subscriptions
  t.is(nc.protocol.subscriptions.size(), 0);

  let rp = nc.request(subj, Empty, { timeout: 100 });

  t.is(nc.protocol.subscriptions.size(), 1);
  t.is(nc.protocol.muxSubscriptions.size(), 1);

  // the rejection should be timeout
  const lock = Lock();
  rp.catch((rej) => {
    t.true(
      rej.code === ErrorCode.Timeout || rej.code === ErrorCode.NoResponders,
    );
    lock.unlock();
  });

  await lock;
  // mux subs should have pruned
  t.is(nc.protocol.muxSubscriptions.size(), 0);
  await nc.close();
});
