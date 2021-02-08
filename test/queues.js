/*
 * Copyright 2018-2020 The NATS Authors
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
const { connect, createInbox } = require(
  "../",
);

const u = "demo.nats.io:4222";

test("queues - deliver to single queue", async (t) => {
  const nc = await connect({ servers: u });
  const subj = createInbox();
  const subs = [];
  for (let i = 0; i < 5; i++) {
    const s = nc.subscribe(subj, { queue: "a" });
    subs.push(s);
  }
  nc.publish(subj);
  await nc.flush();
  const received = subs.map((s) => s.getReceived());
  const sum = received.reduce((p, c) => p + c);
  t.is(sum, 1);
  await nc.close();
});

test("queues - deliver to multiple queues", async (t) => {
  const nc = await connect({ servers: u });
  const subj = createInbox();

  const fn = (queue) => {
    const subs = [];
    for (let i = 0; i < 5; i++) {
      const s = nc.subscribe(subj, { queue: queue });
      subs.push(s);
    }
    return subs;
  };

  const subsa = fn("a");
  const subsb = fn("b");

  nc.publish(subj);
  await nc.flush();

  const mc = (subs) => {
    const received = subs.map((s) => s.getReceived());
    return received.reduce((p, c) => p + c);
  };

  t.is(mc(subsa), 1);
  t.is(mc(subsb), 1);
  await nc.close();
});

test("queues - queues and subs independent", async (t) => {
  const nc = await connect({ servers: u });
  const subj = createInbox();
  const subs = [];
  let queueCount = 0;
  for (let i = 0; i < 5; i++) {
    let s = nc.subscribe(subj, {
      callback: () => {
        queueCount++;
      },
      queue: "a",
    });
    subs.push(s);
  }

  let count = 0;
  subs.push(nc.subscribe(subj, {
    callback: () => {
      count++;
    },
  }));
  await Promise.all(subs);

  nc.publish(subj);
  await nc.flush();
  t.is(queueCount, 1);
  t.is(count, 1);
  await nc.close();
});
