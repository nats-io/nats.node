/*
 * Copyright 2020-2021 The NATS Authors
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
// install globals
require("../");
const { deferred, delay, DebugEvents, Heartbeat } = require(
  "../lib/nats-base-client/internal_mod",
);

function pm(
  lag,
  disconnect,
  statusHandler,
  skip,
) {
  let counter = 0;
  return {
    flush() {
      counter++;
      const d = deferred();
      if (skip && skip.indexOf(counter) !== -1) {
        return d;
      }
      delay(lag)
        .then(() => d.resolve());
      return d;
    },
    disconnect() {
      disconnect();
    },
    dispatchStatus(status) {
      statusHandler(status);
    },
  };
}
test("heartbeat - timers fire", async (t) => {
  const status = [];
  const ph = pm(25, () => {
    t.fail("shouldn't have disconnected");
  }, (s) => {
    status.push(s);
  });

  const hb = new Heartbeat(ph, 100, 3);
  hb._schedule();
  await delay(400);
  t.truthy(hb.timer);
  hb.cancel();
  t.is(hb.timer, undefined);
  t.true(status.length >= 3);
  t.is(status[0].type, DebugEvents.PingTimer);
});

test("heartbeat - errors fire on missed maxOut", async (t) => {
  const disconnect = deferred();
  const status = [];
  const ph = pm(25, () => {
    disconnect.resolve();
  }, (s) => {
    status.push(s);
  }, [4, 5, 6]);

  const hb = new Heartbeat(ph, 100, 3);
  hb._schedule();

  await disconnect;
  t.is(hb.timer, undefined);
  t.true(status.length >= 7, `${status.length} >= 7`);
  t.is(status[0].type, DebugEvents.PingTimer);
});

test("heartbeat - recovers from missed", async (t) => {
  const status = [];
  const ph = pm(25, () => {
    t.fail("shouldn't have disconnected");
  }, (s) => {
    status.push(s);
  }, [4, 5]);

  const hb = new Heartbeat(ph, 100, 3);
  hb._schedule();
  await delay(800);
  hb.cancel();
  t.is(hb.timer, undefined);
  t.true(status.length >= 7, `${status.length} >= 7`);
});
