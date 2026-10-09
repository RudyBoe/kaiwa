// Everything the app keeps on this device.
// - Imported kaiwa: IndexedDB (database "kaiwa", store "imported", key = id).
// - Small state in localStorage: settings, per-kaiwa view prefs, progress,
//   hard lines. Every access is wrapped: private windows may refuse storage,
//   and the app must still work (it just forgets).
import { validateKaiwa, checkLibrary } from "./validate.js";

// ---- localStorage -------------------------------------------------------
function read(key, fallback) {
  try {
    const v = JSON.parse(localStorage.getItem(key) || "null");
    return v === null ? fallback : v;
  } catch { return fallback; }
}
function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage refused */ }
}

const DEFAULTS = { lesson: 33, upToLesson: true, theme: "auto", rate: 0.85, ttsFrom: "ja", mic: false };
export const settings = Object.assign({}, DEFAULTS, read("kaiwa:settings", {}));
export function saveSettings() { write("kaiwa:settings", settings); }

// Per-kaiwa practice view (role, level, partner mode, app voice role).
export const getPrefs = (id) => read("kaiwa:" + id, {});
export const savePrefs = (id, p) => write("kaiwa:" + id, p);

// Progress: { id: { p: [line indexes done], m: [mine done from memory], last: "YYYY-MM-DD" } }
const progress = read("kaiwa:progress", {});
export const getProgress = (id) => progress[id] || { p: [], m: [], last: "" };
export function recordDone(id, i, fromMemory) {
  const g = progress[id] || (progress[id] = { p: [], m: [], last: "" });
  if (!g.p.includes(i)) g.p.push(i);
  if (fromMemory && !g.m.includes(i)) g.m.push(i);
  g.last = today();
  write("kaiwa:progress", progress);
}

// Hard lines: { id: [line indexes] }
const hard = read("kaiwa:hard", {});
export const isHard = (id, i) => (hard[id] || []).includes(i);
export function toggleHard(id, i) {
  const list = hard[id] || (hard[id] = []);
  const at = list.indexOf(i);
  if (at >= 0) list.splice(at, 1); else list.push(i);
  list.sort((a, b) => a - b);
  if (!list.length) delete hard[id];
  write("kaiwa:hard", hard);
  return at < 0;
}
export const allHard = () => hard;

export function clearProgress() {
  for (const k of Object.keys(progress)) delete progress[k];
  for (const k of Object.keys(hard)) delete hard[k];
  write("kaiwa:progress", progress);
  write("kaiwa:hard", hard);
}

export const flag = (k) => read("kaiwa:flag:" + k, false);
export const setFlag = (k) => write("kaiwa:flag:" + k, true);

export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ---- IndexedDB (imported kaiwa) ----------------------------------------
let dbp = null;
function db() {
  if (!dbp) {
    dbp = new Promise((resolve, reject) => {
      if (!("indexedDB" in self)) return reject(new Error("IndexedDB is not available"));
      const req = indexedDB.open("kaiwa", 1);
      req.onupgradeneeded = () => req.result.createObjectStore("imported", { keyPath: "id" });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    dbp.catch(() => { dbp = null; });
  }
  return dbp;
}
function tx(mode, fn) {
  return db().then((d) => new Promise((resolve, reject) => {
    const t = d.transaction("imported", mode);
    const out = fn(t.objectStore("imported"));
    t.oncomplete = () => resolve(out && "result" in out ? out.result : undefined);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error("storage aborted"));
  }));
}
const idbAll = () => tx("readonly", (s) => s.getAll());
export const putImported = (d) => tx("readwrite", (s) => s.put(d));
export const deleteImported = (id) => tx("readwrite", (s) => s.delete(id));

// ---- Library ------------------------------------------------------------
// items: [{ data, source: "repo"|"imported", name }]
// problems: [{ name, source, id, errors }]
export async function loadLibrary() {
  const entries = [];
  const problems = [];
  try {
    const res = await fetch("library/index.json");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const names = await res.json();
    if (!Array.isArray(names)) throw new Error("index.json must be an array of file names");
    const loaded = await Promise.all(names.map(async (name) => {
      try {
        const r = await fetch("library/" + encodeURIComponent(name));
        if (!r.ok) throw new Error(`could not load (HTTP ${r.status})`);
        let data;
        try { data = await r.json(); } catch (err) { throw new Error("not valid JSON: " + err.message); }
        return { name, data, source: "repo", errors: validateKaiwa(data) };
      } catch (err) {
        return { name, data: null, source: "repo", errors: [err.message] };
      }
    }));
    entries.push(...loaded);
  } catch (err) {
    problems.push({ name: "library/index.json", source: "repo", errors: ["could not load the built-in library: " + err.message] });
  }
  checkLibrary(entries);

  let stored = [];
  try { stored = await idbAll(); } catch (err) {
    problems.push({ name: "Imported kaiwa", source: "imported", errors: ["storage not available: " + err.message] });
  }
  const repoIds = new Set(entries.filter((e) => !e.errors.length).map((e) => e.data.id));
  for (const data of stored) {
    const errors = validateKaiwa(data);
    if (!errors.length && repoIds.has(data.id)) errors.push(`id "${data.id}" is also in the built-in library; the built-in one is shown`);
    entries.push({ name: (data && data.id ? data.id : "?") + ".kaiwa.json", data, source: "imported", errors });
  }

  const items = [];
  for (const e of entries) {
    if (e.errors.length) problems.push({ name: e.name, source: e.source, id: e.data && e.data.id, errors: e.errors });
    else items.push({ data: e.data, source: e.source, name: e.name });
  }
  return { items, problems };
}

// Parse text from a file or the paste box: one kaiwa object, an array of them
// (library.json), or several objects pasted one after another.
export function parseKaiwaText(text, label) {
  const out = [];
  const src = text.replace(/^﻿/, "").trim();
  if (!src) return [{ label, data: null, errors: ["empty"] }];
  let parsed;
  try {
    parsed = [JSON.parse(src)];
  } catch (err) {
    const parts = splitObjects(src);
    if (parts.length < 2) return [{ label, data: null, errors: ["not valid JSON: " + err.message] }];
    try { parsed = parts.map((p) => JSON.parse(p)); } catch (err2) {
      return [{ label, data: null, errors: ["not valid JSON: " + err2.message] }];
    }
  }
  const list = parsed.length === 1 && Array.isArray(parsed[0]) ? parsed[0] : parsed;
  list.forEach((data, k) => {
    const name = list.length > 1 ? `${label} #${k + 1}` : label;
    out.push({ label: data && typeof data.id === "string" ? `${name} (${data.id})` : name, data, errors: validateKaiwa(data) });
  });
  return out;
}
// Split "{...}{...}" or "{...}\n\n{...}" at top-level brace boundaries.
function splitObjects(s) {
  const parts = [];
  let depth = 0, start = -1, inStr = false, esc = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === "{") { if (depth++ === 0) start = i; }
    else if (c === "}" && --depth === 0) parts.push(s.slice(start, i + 1));
  }
  return parts;
}
