/*
 * Copyright 2020 The NATS Authors
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
require("../lib/src/mod");
const { NatsError, MsgHdrsImpl, canonicalMIMEHeaderKey } = require(
  "../lib/nats-base-client/internal_mod",
);

test("msgheaders - basics", (t) => {
  const h = new MsgHdrsImpl();
  t.is(h.size(), 0);
  t.false(h.has("foo"));
  h.append("foo", "bar");
  h.append("foo", "bam");
  h.append("foo-bar", "baz");

  t.is(h.size(), 2);
  h.set("bar-foo", "foo");
  t.is(h.size(), 3);
  h.delete("bar-foo");
  t.is(h.size(), 2);

  let header = canonicalMIMEHeaderKey("foo");
  t.is("Foo", header);
  t.false(h.has("Foo"));
  t.true(h.has("foo"));
  // we are case sensitive
  let foos = h.values(header);
  t.is(foos.length, 0);

  foos = h.values("foo");
  t.is(foos.length, 2);
  t.true(foos.indexOf("bar") > -1);
  t.true(foos.indexOf("bam") > -1);
  t.is(foos.indexOf("baz"), -1);

  const a = h.encode();
  const hh = MsgHdrsImpl.decode(a);
  t.true(h.equals(hh));
  t.is(hh.size(), 2);
  t.true(hh.has("foo"));
  t.false(hh.has("bar-foo"));

  hh.set("foo-bar-baz", "fbb");
  t.false(h.equals(hh));
});

test("msgheaders - illegal key", (t) => {
  const h = new MsgHdrsImpl();
  ["bad:", "bad ", String.fromCharCode(127)].forEach((v) => {
    t.throws(() => {
      h.set(v, "aaa");
    }, { instanceOf: NatsError });
  });

  ["\r", "\n"].forEach((v) => {
    t.throws(() => {
      h.set("a", v);
    }, { instanceOf: NatsError });
  });
});
