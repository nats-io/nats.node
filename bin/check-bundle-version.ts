/*
 * Copyright 2021 The NATS Authors
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
const src = await Deno.readTextFile("src/node_transport.ts");
const lines = src.split("\n");
const filtered = lines.filter((txt) => {
  return txt.indexOf("const VERSION") === 0;
});
let parsed = filtered.map((line) => {
  const chunks = line.split(" ");
  if (
    chunks.length === 4 &&
    chunks[0] === "const" &&
    chunks[1] === "VERSION" &&
    chunks[2] === "="
  ) {
    let v = chunks[3].replace(";", "");
    v = JSON.parse(v);
    return v;
  }
});
parsed = parsed ?? [];
if (parsed.length !== 1) {
  console.error(`[ERROR] unexpected number of matches on 'const VERSION'.`);
  Deno.exit(1);
}
let VERSION = "";
if (parsed.length === 1) {
  VERSION = parsed[0] ?? "";
}

const pkg = await Deno.readTextFile("package.json");
const m = JSON.parse(pkg);
if (m.version !== VERSION) {
  console.error(
    `[ERROR] expected package version ${m.version} and transport version ${VERSION} to match`,
  );
  Deno.exit(1);
} else {
  console.info(
    `[OK] package version and transport version match ${m.version}`,
  );
}
