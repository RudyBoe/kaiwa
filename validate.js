// kaiwa/1 validator: a line-for-line port of tools/validate_kaiwa.py.
// Same rules and the same error messages, so the app, the GitHub Action and
// the Python checker agree. validateKaiwa(obj) returns a list of errors
// (empty = valid). Change the rules only together with kaiwa-format.md.

const KANJI = /[一-鿿]/;
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const isDict = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const TYPES = {
  str: (v) => typeof v === "string",
  dict: isDict,
  list: Array.isArray,
};
// Python truthiness: '', 0, false, None, [] and {} are all false.
function truthy(v) {
  if (Array.isArray(v)) return v.length > 0;
  if (isDict(v)) return Object.keys(v).length > 0;
  return Boolean(v);
}
const get = (o, k) => (isDict(o) ? o[k] : undefined);
const str = (v) => (typeof v === "string" ? v : "");
// Python's repr of a sorted list of strings: ['a', 'b']
const pyList = (xs) => "[" + xs.map((x) => "'" + x + "'").join(", ") + "]";

const REQUIRED = {
  format: "str", id: "str", kind: "str", page_title: "str", eyebrow: "str", title: "str",
  subtitle: "str", scene: "str", level: "dict", meta: "str", tags: "list", created: "str",
  roles: "list", lines: "list",
};
const ALLOWED = new Set([...Object.keys(REQUIRED), "curveballs", "questions", "notes"]);

export function validateKaiwa(d) {
  const e = [];
  if (!isDict(d)) return ["not a JSON object"];
  for (const [k, t] of Object.entries(REQUIRED)) {
    if (!TYPES[t](d[k])) e.push(`missing/wrong type: ${k}`);
  }
  if (e.length) return e;

  if (d.format !== "kaiwa/1") e.push('format must be "kaiwa/1"');
  if (!SLUG.test(d.id)) e.push("id must be a lowercase slug");
  if (d.kind !== "dialogue" && d.kind !== "story") e.push("kind must be dialogue or story");
  if (!DATE.test(d.created)) e.push("created must be YYYY-MM-DD");

  const lv = d.level;
  if (!["N5", "N4", "N3", "N2", "N1"].includes(lv.jlpt)) e.push("level.jlpt must be N5..N1");
  const mm = lv.minna_max;
  if (!Number.isInteger(mm) || mm < 1 || mm > 50) e.push("level.minna_max must be 1..50");
  const f = lv.focus;
  const top = "minna_max" in lv ? mm : 50;
  if (!(Array.isArray(f) && f.length === 2 && f.every(Number.isInteger) && f[0] <= f[1] && f[1] <= top)) {
    e.push("level.focus must be [from,to] within minna_max");
  }

  const ids = [];
  d.roles.forEach((r, i) => {
    if (!(isDict(r) && (r.id === "A" || r.id === "B") && truthy(r.ja) && truthy(r.en))) {
      e.push(`roles[${i}] needs id A|B, ja, en`);
    } else ids.push(r.id);
  });
  if (ids.length !== new Set(ids).size || ids.length < 1 || ids.length > 2) e.push("roles: 1 or 2 roles, unique ids");
  if (d.kind === "dialogue" && ids.length !== 2) e.push("dialogue needs 2 roles");

  const n = d.lines.length;
  if (d.kind === "dialogue" && !(n >= 10 && n <= 30)) e.push(`dialogue should have 10-30 lines (has ${n})`);
  if (d.kind === "story" && !(n >= 6 && n <= 16)) e.push(`story should have 6-16 lines (has ${n})`);
  d.lines.forEach((l, i) => {
    for (const k of ["who", "ja", "kana", "en", "kw"]) {
      const v = get(l, k);
      if (typeof v !== "string" || !v.trim()) e.push(`lines[${i}].${k} missing`);
    }
    if (!ids.includes(get(l, "who"))) e.push(`lines[${i}].who not a role id`);
    if (KANJI.test(str(get(l, "kana")))) e.push(`lines[${i}].kana contains kanji`);
    if (isDict(l) && "n" in l && typeof l.n !== "string") e.push(`lines[${i}].n must be a string`);
  });

  for (const [key, label] of [["curveballs", "curveballs"], ["questions", "questions"], ["notes", "notes"]]) {
    if (key in d && !Array.isArray(d[key])) e.push(`${label} must be a list`);
  }
  const list = (k) => (Array.isArray(d[k]) ? d[k] : []);
  list("curveballs").forEach((c, i) => {
    for (const k of ["by", "en", "ja", "kana", "reply_ja", "reply_kana", "reply_en"]) {
      if (!truthy(get(c, k))) e.push(`curveballs[${i}].${k} missing`);
    }
    if (!ids.includes(get(c, "by"))) e.push(`curveballs[${i}].by not a role id`);
    if (KANJI.test(str(get(c, "kana")) + str(get(c, "reply_kana")))) e.push(`curveballs[${i}] kana contains kanji`);
  });
  list("questions").forEach((q, i) => {
    for (const k of ["by", "ja", "kana", "en", "answer"]) {
      if (!truthy(get(q, k))) e.push(`questions[${i}].${k} missing`);
    }
  });
  list("notes").forEach((x, i) => {
    if (!(truthy(get(x, "label")) && truthy(get(x, "text")))) e.push(`notes[${i}] needs label and text`);
  });

  const extra = Object.keys(d).filter((k) => !ALLOWED.has(k)).sort();
  if (extra.length) e.push(`unknown top-level keys: ${pyList(extra)}`);
  return e;
}

// Checks across a set of kaiwa that a single file can't see: unique ids and,
// for repo files, the file name matching the id. Returns [{name, errors}].
export function checkLibrary(entries) {
  const seen = new Map();
  for (const ent of entries) {
    const id = ent.data && ent.data.id;
    if (ent.name && id && ent.name !== `${id}.kaiwa.json` && !ent.errors.length) {
      ent.errors.push(`file name should be ${id}.kaiwa.json`);
    }
    if (!id || ent.errors.length) continue;
    if (seen.has(id)) ent.errors.push(`duplicate id "${id}" (also in ${seen.get(id)})`);
    else seen.set(id, ent.name || id);
  }
  return entries;
}
