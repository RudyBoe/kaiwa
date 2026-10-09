#!/usr/bin/env node
// Parity tests for validate.js: each case breaks a valid kaiwa in one way and
// expects exactly the message tools/validate_kaiwa.py prints for it.
// Usage: node tools/test-validate.mjs
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { validateKaiwa } from "../validate.js";

const LIB = join(dirname(fileURLToPath(import.meta.url)), "..", "library");
const base = () => JSON.parse(readFileSync(join(LIB, "train-edogawa.kaiwa.json"), "utf8"));
const story = () => JSON.parse(readFileSync(join(LIB, "jikoshokai.kaiwa.json"), "utf8"));

const CASES = [
  ["valid dialogue", (d) => d, []],
  ["valid story", () => story(), []],
  ["not an object", () => [1], ["not a JSON object"]],
  ["missing title", (d) => { delete d.title; }, ["missing/wrong type: title"]],
  ["tags not a list", (d) => { d.tags = "food"; d.level = []; }, ["missing/wrong type: level", "missing/wrong type: tags"]],
  ["format", (d) => { d.format = "kaiwa/2"; }, ['format must be "kaiwa/1"']],
  ["id slug", (d) => { d.id = "Train_Edogawa"; }, ["id must be a lowercase slug"]],
  ["id trailing dash", (d) => { d.id = "train-"; }, ["id must be a lowercase slug"]],
  ["kind", (d) => { d.kind = "monologue"; }, ["kind must be dialogue or story"]],
  ["created", (d) => { d.created = "9 Oct 2026"; }, ["created must be YYYY-MM-DD"]],
  ["jlpt", (d) => { d.level.jlpt = "N6"; }, ["level.jlpt must be N5..N1"]],
  ["minna_max", (d) => { d.level.minna_max = 51; }, ["level.minna_max must be 1..50"]],
  ["focus order", (d) => { d.level.focus = [33, 29]; }, ["level.focus must be [from,to] within minna_max"]],
  ["focus beyond max", (d) => { d.level.focus = [29, 34]; }, ["level.focus must be [from,to] within minna_max"]],
  ["role id", (d) => { d.roles[1].id = "C"; },
    ["roles[1] needs id A|B, ja, en", "dialogue needs 2 roles", ...Array.from({ length: 11 }, (_, k) => `lines[${2 * k + 1}].who not a role id`), "curveballs[0].by not a role id", "curveballs[1].by not a role id"]],
  ["duplicate role", (d) => { d.roles[1].id = "A"; },
    ["roles: 1 or 2 roles, unique ids", ...Array.from({ length: 11 }, (_, k) => `lines[${2 * k + 1}].who not a role id`), "curveballs[0].by not a role id", "curveballs[1].by not a role id"]],
  ["too few lines", (d) => { d.lines = d.lines.slice(0, 9); }, ["dialogue should have 10-30 lines (has 9)"]],
  ["story too long", () => { const s = story(); s.lines = [...s.lines, ...s.lines]; return s; }, ["story should have 6-16 lines (has 20)"]],
  ["empty kw", (d) => { d.lines[3].kw = "  "; }, ["lines[3].kw missing"]],
  ["kanji in kana", (d) => { d.lines[0].kana = "少し"; }, ["lines[0].kana contains kanji"]],
  ["n not string", (d) => { d.lines[0].n = 1; }, ["lines[0].n must be a string"]],
  ["curveball", (d) => { delete d.curveballs[0].reply_en; d.curveballs[1].by = "C"; d.curveballs[2].reply_kana = "書"; },
    ["curveballs[0].reply_en missing", "curveballs[1].by not a role id", "curveballs[2] kana contains kanji"]],
  ["question", () => { const s = story(); s.questions[0].answer = ""; return s; }, ["questions[0].answer missing"]],
  ["note", (d) => { d.notes[0].text = ""; }, ["notes[0] needs label and text"]],
  ["extra keys", (d) => { d.zeta = 1; d.audio = 2; }, ["unknown top-level keys: ['audio', 'zeta']"]],
];

let fail = 0;
for (const [name, mutate, want] of CASES) {
  const d = base();
  const out = mutate(d);
  const got = validateKaiwa(out === undefined ? d : out);
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { fail++; console.log(`FAIL ${name}\n   want ${JSON.stringify(want)}\n   got  ${JSON.stringify(got)}`); }
  else console.log(`ok   ${name}`);
}
console.log(fail ? `${fail} failed` : `all ${CASES.length} passed`);
process.exit(fail ? 1 : 0);
