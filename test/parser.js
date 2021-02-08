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

const {
  Kind,
  Parser,
  State,
} = require("../lib/nats-base-client/internal_mod");

let te = new TextEncoder();
const td = new TextDecoder();

class NoopDispatcher {
  push(a) {}
}

class TestDispatcher {
  constructor() {
    this.count = 0;
    this.pings = 0;
    this.pongs = 0;
    this.ok = 0;
    this.errs = [];
    this.infos = [];
    this.msgs = [];
  }

  push(a) {
    this.count++;
    switch (a.kind) {
      case Kind.OK:
        this.ok++;
        break;
      case Kind.ERR:
        this.errs.push(a);
        break;
      case Kind.MSG:
        this.msgs.push(a);
        break;
      case Kind.INFO:
        this.infos.push(a);
        break;
      case Kind.PING:
        this.pings++;
        break;
      case Kind.PONG:
        this.pongs++;
      default:
        throw new Error(`unknown parser evert ${JSON.stringify(a)}`);
    }
  }
}

// These are almost verbatim ports of the NATS parser tests

function byByteTest(t, data) {
  const e = new TestDispatcher();
  const p = new Parser(e);
  const states = [];
  t.is(p.state, State.OP_START);

  for (let i = 0; i < data.length; i++) {
    states.push(p.state);
    p.parse(Uint8Array.of(data[i]));
  }
  states.push(p.state);
  return { states, dispatcher: e };
}

test("parser - ping", (t) => {
  const states = [
    State.OP_START,
    State.OP_P,
    State.OP_PI,
    State.OP_PIN,
    State.OP_PING,
    State.OP_PING,
    State.OP_START,
  ];
  const results = byByteTest(t, te.encode("PING\r\n"));
  t.deepEqual(results.states, states);
  t.is(results.dispatcher.pings, 1);
  t.is(results.dispatcher.count, 1);

  const events = new TestDispatcher();
  const p = new Parser(events);
  p.parse(te.encode("PING\r\n"));
  t.is(p.state, State.OP_START);

  p.parse(te.encode("PING \r"));
  t.is(p.state, State.OP_PING);

  p.parse(te.encode("PING \r \n"));
  t.is(p.state, State.OP_START);

  t.is(events.pings, 2);
  t.is(events.count, 2);
});

test("parser - err", (t) => {
  const states = [
    State.OP_START,
    State.OP_MINUS,
    State.OP_MINUS_E,
    State.OP_MINUS_ER,
    State.OP_MINUS_ERR,
    State.OP_MINUS_ERR_SPC,
    State.MINUS_ERR_ARG,
    State.MINUS_ERR_ARG,
    State.MINUS_ERR_ARG,
    State.MINUS_ERR_ARG,
    State.MINUS_ERR_ARG,
    State.MINUS_ERR_ARG,
    State.MINUS_ERR_ARG,
    State.MINUS_ERR_ARG,
    State.MINUS_ERR_ARG,
    State.MINUS_ERR_ARG,
    State.MINUS_ERR_ARG,
    State.OP_START,
  ];
  const results = byByteTest(t, te.encode(`-ERR '234 6789'\r\n`));
  t.deepEqual(results.states, states);
  t.is(results.dispatcher.errs.length, 1);
  t.is(results.dispatcher.count, 1);
  t.is(td.decode(results.dispatcher.errs[0].data), `'234 6789'`);

  const events = new TestDispatcher();
  const p = new Parser(events);
  p.parse(te.encode("-ERR 'Any error'\r\n"));
  t.is(p.state, State.OP_START);
  t.is(events.errs.length, 1);
  t.is(events.count, 1);
  t.is(td.decode(events.errs[0].data), `'Any error'`);
});

test("parser - ok", (t) => {
  let states = [
    State.OP_START,
    State.OP_PLUS,
    State.OP_PLUS_O,
    State.OP_PLUS_OK,
    State.OP_PLUS_OK,
    State.OP_START,
  ];
  let result = byByteTest(t, te.encode("+OK\r\n"));
  t.deepEqual(result.states, states);

  states = [
    State.OP_START,
    State.OP_PLUS,
    State.OP_PLUS_O,
    State.OP_PLUS_OK,
    State.OP_PLUS_OK,
    State.OP_PLUS_OK,
    State.OP_PLUS_OK,
    State.OP_START,
  ];
  result = byByteTest(t, te.encode("+OKay\r\n"));

  t.deepEqual(result.states, states);
});

test("parser - info", (t) => {
  let states = [
    State.OP_START,
    State.OP_I,
    State.OP_IN,
    State.OP_INF,
    State.OP_INFO,
    State.OP_INFO_SPC,
    State.INFO_ARG,
    State.INFO_ARG,
    State.INFO_ARG,
    State.OP_START,
  ];

  const results = byByteTest(t, te.encode(`INFO {}\r\n`));
  t.deepEqual(results.states, states);
  t.is(results.dispatcher.infos.length, 1);
  t.is(results.dispatcher.count, 1);
});

test("parser - errors", (t) => {
  const bad = [
    " PING",
    "POO",
    "Px",
    "PIx",
    "PINx",
    "PONx",
    "ZOO",
    "Mx\r\n",
    "MSx\r\n",
    "MSGx\r\n",
    "MSG foo\r\n",
    "MSG \r\n",
    "MSG foo 1\r\n",
    "MSG foo bar 1\r\n",
    "MSG foo bar 1 baz\r\n",
    "MSG foo 1 bar baz\r\n",
    "+x\r\n",
    "+0x\r\n",
    "-x\r\n",
    "-Ex\r\n",
    "-ERx\r\n",
    "-ERRx\r\n",
  ];

  t.plan(bad.length);

  bad.forEach((s) => {
    const p = new Parser(new NoopDispatcher());
    try {
      p.parse(te.encode(s));
      t.fail();
    } catch (err) {
      t.truthy(err);
    }
  });
});
//
// test("parser - split msg", (t) => {
//   assertThrows(() => {
//     const p = new Parser(new NoopDispatcher());
//     p.parse(te.encode("MSG a\r\n"));
//   });
//
//   assertThrows(() => {
//     const p = new Parser(new NoopDispatcher());
//     p.parse(te.encode("MSG a b c\r\n"));
//   });
//
//   let d = new TestDispatcher();
//   let p = new Parser(d);
//   p.parse(te.encode("MSG a"));
//   assert(p.argBuf);
//   p.parse(te.encode(" 1 3\r\nf"));
//   t.is(p.ma.size, 3, "size");
//   t.is(p.ma.sid, 1, "sid");
//   t.is(p.ma.subject, te.encode("a"), "subject");
//   assert(p.msgBuf, "should message buffer");
//   p.parse(te.encode("oo\r\n"));
//   t.is(d.count, 1);
//   t.is(d.msgs.length, 1);
//   t.is(td.decode(d.msgs[0].msg?.subject), "a");
//   t.is(td.decode(d.msgs[0].data), "foo");
//   t.is(p.msgBuf, undefined);
//
//   p.parse(te.encode("MSG a 1 3\r\nba"));
//   t.is(p.ma.size, 3, "size");
//   t.is(p.ma.sid, 1, "sid");
//   t.is(p.ma.subject, te.encode("a"), "subject");
//   assert(p.msgBuf, "should message buffer");
//   p.parse(te.encode("r\r\n"));
//   t.is(d.msgs.length, 2);
//   t.is(td.decode(d.msgs[1].data), "bar");
//   t.is(p.msgBuf, undefined);
//
//   p.parse(te.encode("MSG a 1 6\r\nfo"));
//   t.is(p.ma.size, 6, "size");
//   t.is(p.ma.sid, 1, "sid");
//   t.is(p.ma.subject, te.encode("a"), "subject");
//   assert(p.msgBuf, "should message buffer");
//   p.parse(te.encode("ob"));
//   p.parse(te.encode("ar\r\n"));
//
//   t.is(d.msgs.length, 3);
//   t.is(td.decode(d.msgs[2].data), "foobar");
//   t.is(p.msgBuf, undefined);
//
//   const payload = new Uint8Array(100);
//   const buf = te.encode("MSG a 1 b 103\r\nfoo");
//   p.parse(buf);
//   t.is(p.ma.size, 103);
//   t.is(p.ma.sid, 1);
//   t.is(td.decode(p.ma.subject), "a");
//   t.is(td.decode(p.ma.reply), "b");
//   assert(p.argBuf);
//   const a = "a".charCodeAt(0); //97
//   for (let i = 0; i < payload.length; i++) {
//     payload[i] = a + (i % 26);
//   }
//   p.parse(payload);
//   t.is(p.state, State.MSG_PAYLOAD);
//   t.is(p.ma.size, 103);
//   t.is(p.msgBuf.length, 103);
//   p.parse(te.encode("\r\n"));
//   t.is(p.state, State.OP_START);
//   t.is(p.msgBuf, undefined);
//   t.is(d.msgs.length, 4);
//   const db = d.msgs[3].data;
//   t.is(td.decode(db.subarray(0, 3)), "foo");
//   const gen = db.subarray(3);
//   for (let k = 0; k < 100; k++) {
//     t.is(gen[k], a + (k % 26));
//   }
// });
//
// test("parser - info arg", (t) => {
//   const arg = {
//     server_id: "test",
//     host: "localhost",
//     port: 4222,
//     version: "1.2.3",
//     auth_required: true,
//     tls_required: true,
//     max_payload: 2 * 1024 * 1024,
//     connect_urls: [
//       "localhost:5222",
//       "localhost:6222",
//     ],
//   };
//
//   const d = new TestDispatcher();
//   const p = new Parser(d);
//   const info = te.encode(`INFO ${JSON.stringify(arg)}\r\n`);
//
//   p.parse(info.subarray(0, 9));
//   t.is(p.state, State.INFO_ARG);
//   assert(p.argBuf);
//
//   p.parse(info.subarray(9, 11));
//   t.is(p.state, State.INFO_ARG);
//   assert(p.argBuf);
//
//   p.parse(info.subarray(11));
//   t.is(p.state, State.OP_START);
//   t.is(p.argBuf, undefined);
//
//   t.is(d.infos.length, 1);
//   t.is(d.count, 1);
//
//   const arg2 = JSON.parse(td.decode(d.infos[0]?.data));
//   t.is(arg2, arg);
//
//   const good = [
//     "INFO {}\r\n",
//     "INFO  {}\r\n",
//     "INFO {} \r\n",
//     'INFO { "server_id": "test"  }   \r\n',
//     'INFO {"connect_urls":[]}\r\n',
//   ];
//   good.forEach((info) => {
//     p.parse(te.encode(info));
//   });
//   t.is(d.infos.length, good.length + 1);
//
//   const bad = [
//     "IxNFO {}\r\n",
//     "INxFO {}\r\n",
//     "INFxO {}\r\n",
//     "INFOx {}\r\n",
//     "INFO{}\r\n",
//     "INFO {}",
//   ];
//
//   let count = 0;
//   bad.forEach((info) => {
//     assertThrows(() => {
//       count++;
//       p.parse(te.encode(info));
//     });
//   });
//   t.is(count, bad.length);
// });
//
// test("parser - header", (t) => {
//   const d = new TestDispatcher();
//   const p = new Parser(d);
//   const h = headers();
//   h.set("x", "y");
//   const hdr = h.encode();
//
//   p.parse(te.encode(`HMSG a 1 ${hdr.length} ${hdr.length + 3}\r\n`));
//   p.parse(hdr);
//   t.is(p.ma.size, hdr.length + 3, "size");
//   t.is(p.ma.sid, 1, "sid");
//   t.is(p.ma.subject, te.encode("a"), "subject");
//   assert(p.msgBuf, "should message buffer");
//   p.parse(te.encode("bar\r\n"));
//
//   t.is(d.msgs.length, 1);
//   const payload = d.msgs[0].data;
//   const h2 = MsgHdrsImpl.decode(payload.subarray(0, d.msgs[0].msg.hdr));
//   assert(h2.equals(h));
//   t.is(td.decode(payload.subarray(d.msgs[0].msg.hdr)), "bar");
// });
//
// test("parser - msg buffers don't clobber", (t) => {
//   parserClobberTest(false);
// });
//
// test("parser - hmsg buffers don't clobber", (t) => {
//   parserClobberTest(true);
// });
//
// function parserClobberTest(hdrs = false) {
//   const d = new TestDispatcher();
//   const p = new Parser(d);
//
//   const a = "a".charCodeAt(0);
//   const fill = (n, b) => {
//     const v = n % 26 + a;
//     for (let i = 0; i < b.length; i++) {
//       b[i] = v;
//     }
//   };
//
//   const code = (n) => {
//     return n % 26 + a;
//   };
//
//   const subj = new Uint8Array(26);
//   const reply = new Uint8Array(26);
//   const payload = new Uint8Array(1024 * 1024);
//   const kv = new Uint8Array(12);
//
//   const check = (n, m) => {
//     const s = code(n + 1);
//     t.is(m.subject.length, subj.length);
//     te.encode(m.subject).forEach((c) => {
//       t.is(c, s, "subject char");
//     });
//
//     const r = code(n + 2);
//     t.is(m.reply?.length, reply.length);
//     te.encode(m.reply).forEach((c) => {
//       t.is(r, c, "reply char");
//     });
//     t.is(m.data.length, payload.length);
//     const pc = code(n);
//     m.data.forEach((c) => {
//       t.is(c, pc);
//     }, "payload");
//
//     if (hdrs) {
//       assert(m.headers);
//       fill(n + 3, kv);
//       const hv = td.decode(kv);
//       t.is(m.headers.get(hv), hv);
//     }
//   };
//
//   const buf = new Buffer();
//   const N = 100;
//   for (let i = 0; i < N; i++) {
//     buf.reset();
//     fill(i, payload);
//     fill(i + 1, subj);
//     fill(i + 2, reply);
//     let hdrdata = Empty;
//     if (hdrs) {
//       fill(i + 3, kv);
//       const h = headers();
//       const kvs = td.decode(kv);
//       h.set(kvs, kvs);
//       hdrdata = h.encode();
//     }
//     const len = hdrdata.length + payload.length;
//
//     if (hdrs) {
//       buf.writeString("HMSG ");
//     } else {
//       buf.writeString("MSG ");
//     }
//     buf.write(subj);
//     buf.writeString(` 1`);
//     if (reply) {
//       buf.writeString(" ");
//       buf.write(reply);
//     }
//     if (hdrs) {
//       buf.writeString(` ${hdrdata.length}`);
//     }
//     buf.writeString(` ${len}\r\n`);
//     if (hdrs) {
//       buf.write(hdrdata);
//     }
//     buf.write(payload);
//     buf.writeString(`\r\n`);
//
//     p.parse(buf.bytes());
//   }
//
//   t.is(d.msgs.length, 100);
//   for (let i = 0; i < 100; i++) {
//     const e = d.msgs[i];
//     const m = new MsgImpl(e.msg, e.data, {});
//     check(i, m);
//   }
// }
