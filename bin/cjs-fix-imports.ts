import { parse } from "https://deno.land/std@0.61.0/flags/mod.ts";
import {
  join,
  resolve,
  basename,
  extname,
} from "https://deno.land/std@0.61.0/path/mod.ts";

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
  const target = join(out, basename(fn));
  await Deno.writeFile(target, new TextEncoder().encode(mod));
  if (txt.length !== mod.length) {
    console.log(`${target}`);
  }
}
