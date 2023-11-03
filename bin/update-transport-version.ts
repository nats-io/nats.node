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

type SemVer = {
  major: number;
  minor: number;
  micro: number;
  qualifier: number;
};
function parseSemVer(
  s = "",
): SemVer {
  const m = s.match(/(\d+).(\d+).(\d+)(.*)/);
  if (m) {
    let qualifier = Number.MAX_SAFE_INTEGER;
    if (m[4] !== null) {
      const mm = m[4].match(/(\d+)/);
      if (mm) {
        qualifier = parseInt(mm[1]);
      }
    }
    return {
      major: parseInt(m[1]),
      minor: parseInt(m[2]),
      micro: parseInt(m[3]),
      qualifier,
    };
  }
  throw new Error(`'${s}' is not a semver value`);
}
function compare(a: SemVer, b: SemVer): number {
  if (a.major < b.major) return -1;
  if (a.major > b.major) return 1;
  if (a.minor < b.minor) return -1;
  if (a.minor > b.minor) return 1;
  if (a.micro < b.micro) return -1;
  if (a.micro > b.micro) return 1;
  if (a.qualifier < b.qualifier) return -1;
  if (a.qualifier > b.qualifier) return 1;

  return 0;
}

const SRC = "src/node_transport.ts";
async function getPackageVersion(): Promise<string> {
  const pkg = await Deno.readTextFile("package.json");
  const m = JSON.parse(pkg);
  return m.version;
}

async function replaceSourceVersion(from: string, to: string): Promise<void> {
  const src = await Deno.readTextFile(SRC);
  const s = `const VERSION = "${from}";`;
  const t = `const VERSION = "${to}";`;
  const w = src.replace(s, t);
  await Deno.writeTextFile(SRC, w);
}

async function getSourceVersion(): Promise<string> {
  const src = await Deno.readTextFile(SRC);
  const lines = src.split("\n");
  const line = lines.find((txt) => {
    return txt.indexOf("const VERSION") === 0;
  });

  if (!line) {
    return Promise.reject(new Error("didn't find 'const VERSION'"));
  }
  const chunks = line?.split(" ");
  if (
    chunks.length === 4 &&
    chunks[0] === "const" &&
    chunks[1] === "VERSION" &&
    chunks[2] === "="
  ) {
    const v = chunks[3].replace(";", "");
    return JSON.parse(v);
  } else {
    return Promise.reject(`unable to parse ${line}`);
  }
}
try {
  const pv = await getPackageVersion();
  const sv = await await getSourceVersion();
  const pkg = parseSemVer(pv);
  const src = parseSemVer(sv);

  if (compare(pkg, src) <= 0) {
    throw new Error(
      `package version is not greater than source was expected ${pv} > ${sv}`,
    );
  }

  await replaceSourceVersion(sv, pv);
} catch (err) {
  console.error(`[ERROR] ${err.message}`);
  Deno.exit(1);
}

Deno.exit(0);
