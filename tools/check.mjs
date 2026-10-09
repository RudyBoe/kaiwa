#!/usr/bin/env node
// Check the repo library with the app's own validator (validate.js):
// every library/*.kaiwa.json is valid kaiwa/1, its name matches its id, ids
// are unique, and index.json lists exactly the files that exist.
// Usage: node tools/check.mjs   -> exit 1 on errors.
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { validateKaiwa, checkLibrary } from "../validate.js";

const LIB = join(dirname(fileURLToPath(import.meta.url)), "..", "library");
const files = readdirSync(LIB).filter((f) => f.endsWith(".kaiwa.json")).sort();
let bad = 0;

let index = [];
try {
  index = JSON.parse(readFileSync(join(LIB, "index.json"), "utf8"));
  if (!Array.isArray(index) || !index.every((x) => typeof x === "string")) throw new Error("must be an array of file names");
} catch (err) {
  console.log("FAIL library/index.json\n   - " + err.message);
  bad++;
}
for (const f of files) if (!index.includes(f)) { console.log(`FAIL library/index.json\n   - missing ${f}`); bad++; }
for (const f of index) if (!files.includes(f)) { console.log(`FAIL library/index.json\n   - lists ${f}, which does not exist`); bad++; }

const entries = files.map((name) => {
  try {
    const data = JSON.parse(readFileSync(join(LIB, name), "utf8"));
    return { name, data, errors: validateKaiwa(data) };
  } catch (err) {
    return { name, data: null, errors: ["not valid JSON: " + err.message] };
  }
});
for (const { name, errors } of checkLibrary(entries)) {
  console.log((errors.length ? "FAIL " : "OK   ") + "library/" + name);
  errors.forEach((x) => console.log("   - " + x));
  bad += errors.length ? 1 : 0;
}
process.exit(bad ? 1 : 0);
