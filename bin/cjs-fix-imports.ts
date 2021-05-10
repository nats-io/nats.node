import { parse } from "https://deno.land/std@0.95.0/flags/mod.ts";
import {
  basename,
  extname,
  join,
  resolve,
} from "https://deno.land/std@0.95.0/path/mod.ts";

const argv = parse(
  Deno.args,
  {
    alias: {
      o: ["out"],
    },
    boolean: true,
    string: ["out"],
    default: {
      o: "build",
    },
  },
);

const requires = new Map<string, { lib: string; arg: string }>();

requires.set(
  "https://raw.githubusercontent.com/nats-io/nkeys.js",
  { lib: "nkeys.js", arg: "nkeys" },
);

// resolve the specified directories to fq
let dirs = (argv._ as string[]).map((n) => {
  return resolve(n);
});
// resolve the out dir
const out = resolve(argv.o);

// collect a list of all the files
const files: string[] = [];
for (const d of dirs) {
  for await (const fn of Deno.readDir(d)) {
    const ext = extname(fn.name);
    if (ext === ".ts" || ext === ".js") {
      files.push(join(d, fn.name));
    }
  }
}

dirs.flat();

if (argv.debug) {
  console.log(`src: ${dirs.join(" ")}`);
  console.log(`out: ${out}`);
  console.log(`files: ${files.join(",")}`);
  Deno.exit(0);
}

if (!dirs.length || argv.h || argv.help) {
  console.log(
    `deno run --allow-all cjs-fix-imports [--debug] [--out build/] dir/ dir2/`,
  );
  Deno.exit(1);
}

// create out if not exist
await Deno.lstat(out)
  .catch(async () => {
    await Deno.mkdir(out);
  });

// process each file - remove extensions from requires/import
for (const fn of files) {
  const data = await Deno.readFile(fn);
  let txt = new TextDecoder().decode(data);

  let mod = txt.replace(/from\s+"(\S+).[t|j]s"/gim, 'from "$1"');
  mod = mod.replace(/require\("(\S+).[j|t]s"\)/gim, 'require("$1")');

  // some of the imports are references to external projects
  // that in node we resolve with requires - if we encounter one that
  // the script is not configured for, the build fails
  while (true) {
    const m = mod.match(/(export [\s\S]+ from\s+"(https:\/\/\S+)")/);
    if (m) {
      for (const k of requires.keys()) {
        if (m[2].indexOf(k) === 0) {
          const entry = requires.get(k);
          mod = mod.replace(
            m[0],
            `export const ${entry!.arg} = require("${entry!.lib}")`,
          );
          break;
        }
      }
    } else {
      break;
    }
  }

  const target = join(out, basename(fn));
  await Deno.writeFile(target, new TextEncoder().encode(mod));
  if (txt.length !== mod.length) {
    console.log(`${target}`);
  }
}
