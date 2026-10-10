// Kaiwa: library, hard lines and settings, plus routing to the practice
// screen. The URL holds nothing but an optional "#<kaiwa id>", so a shared
// link opens that kaiwa directly.
import {
  settings, saveSettings, loadLibrary, parseKaiwaText, putImported, deleteImported,
  getProgress, allHard, toggleHard, clearProgress, isKnown, knownCount,
} from "./store.js";
import { renderPractice } from "./practice.js";
import { canSpeak, findVoice, voiceName, speak, canListen } from "./speech.js";
import { esc, lineLabel, fmtDate, ICON } from "./ui.js";

const view = document.getElementById("view");
const toastEl = document.getElementById("toast");
const lib = { items: [], problems: [] };
const filt = { q: "", kind: "all", tag: "", showKnown: false };
let tab = "library";
let cleanup = null;
let pendingFocus = null;
let openedFromHome = false;
let report = [];        // last import result
let hardOpen = {};      // revealed cards in Hard lines

applyTheme();
boot();

async function boot() {
  await reload();
  window.addEventListener("hashchange", route);
  route();
  if ("serviceWorker" in navigator) {
    const had = Boolean(navigator.serviceWorker.controller);
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (had) toast("Kaiwa was updated. Reopen it to use the new version.");
    });
    navigator.serviceWorker.register("sw.js").catch(() => { /* offline support unavailable */ });
  }
}

async function reload() { Object.assign(lib, await loadLibrary()); }
const byId = (id) => lib.items.find((x) => x.data.id === id);
const hashId = () => { try { return decodeURIComponent(location.hash.slice(1)); } catch { return ""; } };

// ---- routing -------------------------------------------------------------
function route() {
  if (cleanup) { cleanup(); cleanup = null; }
  const id = hashId();
  if (id) {
    const item = byId(id);
    if (item) {
      document.title = item.data.page_title + " · Kaiwa";
      const focusLine = pendingFocus;
      pendingFocus = null;
      if (focusLine == null) window.scrollTo(0, 0);
      cleanup = renderPractice(view, item, { toast, share, exportOne, deleteImported: removeImported, focusLine });
      bindHomeLinks();
      return;
    }
    toast(`"${id}" is not in the library on this device. Ask for the file, or open the link once online.`);
  }
  document.title = "Kaiwa";
  renderMain();
}
function openKaiwa(id, focusLine = null) {
  pendingFocus = focusLine;
  openedFromHome = true;
  if (hashId() === id) route(); else location.hash = id;
}
function goHome() {
  if (openedFromHome) { openedFromHome = false; history.back(); return; }
  history.pushState(null, "", location.pathname + location.search);
  route();
}
function bindHomeLinks() {
  view.querySelectorAll("[data-home]").forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); goHome(); }));
}

// ---- main view (tabs) ------------------------------------------------------
function renderMain() {
  const hardCount = Object.values(allHard()).reduce((n, l) => n + l.length, 0);
  view.innerHTML = `
    <header class="apphead">
      <div class="brand"><span class="mark" lang="ja">会話</span><span class="word">Kaiwa</span></div>
      <p class="tagline">Dialogues and short stories to practise aloud, alone or with a partner.</p>
    </header>
    <nav class="tabs" role="tablist">
      ${[["library", "Library"], ["hard", `Hard lines${hardCount ? ` <span class="badge">${hardCount}</span>` : ""}`], ["settings", "Settings"]]
        .map(([k, l]) => `<button type="button" role="tab" data-tab="${k}" aria-selected="${tab === k}">${l}</button>`).join("")}
    </nav>
    <div id="panel" role="tabpanel"></div>`;
  view.querySelectorAll("[data-tab]").forEach((b) => (b.onclick = () => { tab = b.dataset.tab; renderMain(); }));
  const panel = view.querySelector("#panel");
  if (tab === "library") renderLibrary(panel);
  else if (tab === "hard") renderHard(panel);
  else renderSettings(panel);
}

// ---- library ---------------------------------------------------------------
function renderLibrary(panel) {
  const tags = [...new Set(lib.items.flatMap((x) => x.data.tags))].sort();
  if (filt.tag && !tags.includes(filt.tag)) filt.tag = "";
  const nKnown = knownCount(lib.items.map((x) => x.data.id));
  if (!nKnown) filt.showKnown = false;
  panel.innerHTML = `
    <div class="filters">
      <input type="search" id="q" placeholder="Search title or tag" value="${esc(filt.q)}" autocomplete="off" aria-label="Search title or tag">
      <div class="row">
        <button type="button" id="upTo" aria-pressed="${settings.upToLesson}">Up to L${settings.lesson}</button>
        <span class="sep"></span>
        ${[["all", "All"], ["dialogue", "Dialogue"], ["story", "Story"]].map(([k, l]) => `<button type="button" data-kind="${k}" aria-pressed="${filt.kind === k}">${l}</button>`).join("")}
      </div>
      ${tags.length ? `<div class="row tags">${tags.map((t) => `<button type="button" class="tag" data-tag="${esc(t)}" aria-pressed="${filt.tag === t}">${esc(t)}</button>`).join("")}</div>` : ""}
      ${nKnown ? `<div class="row"><button type="button" id="showKnown" aria-pressed="${filt.showKnown}">Show known (${nKnown})</button></div>` : ""}
    </div>
    <div id="problems"></div>
    <p class="count" id="count"></p>
    <ul class="klist" id="klist"></ul>
    <section class="extra">
      <h2>Add and export<small>Imported kaiwa are kept on this device and work offline.</small></h2>
      <div class="row">
        <button type="button" class="plain" id="pick">Add files</button>
        <button type="button" class="plain" id="pasteBtn">Paste JSON</button>
        <button type="button" class="plain" id="exportAll">Export library</button>
      </div>
      <input type="file" id="file" accept=".json,application/json" multiple hidden>
      <div id="pasteBox" hidden>
        <textarea id="paste" rows="6" placeholder='Paste one kaiwa, several, or a library.json array' spellcheck="false" aria-label="Kaiwa JSON"></textarea>
        <div class="row"><button type="button" id="pasteGo">Import</button><button type="button" class="plain" id="pasteCancel">Cancel</button></div>
      </div>
      <div id="report"></div>
    </section>`;
  const $ = (s) => panel.querySelector(s);

  $("#q").oninput = (e) => { filt.q = e.target.value; renderList(); };
  $("#upTo").onclick = () => { settings.upToLesson = !settings.upToLesson; saveSettings(); renderMain(); };
  panel.querySelectorAll("[data-kind]").forEach((b) => (b.onclick = () => { filt.kind = b.dataset.kind; renderMain(); }));
  panel.querySelectorAll("[data-tag]").forEach((b) => (b.onclick = () => { filt.tag = filt.tag === b.dataset.tag ? "" : b.dataset.tag; renderMain(); }));
  if (nKnown) $("#showKnown").onclick = () => { filt.showKnown = !filt.showKnown; renderMain(); };

  $("#pick").onclick = () => $("#file").click();
  $("#file").onchange = async (e) => {
    const files = [...e.target.files];
    e.target.value = "";
    const parsed = [];
    for (const f of files) parsed.push(...parseKaiwaText(await f.text(), f.name));
    await importParsed(parsed);
  };
  $("#pasteBtn").onclick = () => { $("#pasteBox").hidden = false; $("#paste").focus(); };
  $("#pasteCancel").onclick = () => { $("#pasteBox").hidden = true; $("#paste").value = ""; };
  $("#pasteGo").onclick = async () => {
    const text = $("#paste").value;
    await importParsed(parseKaiwaText(text, "Pasted JSON"));
  };
  $("#exportAll").onclick = () => {
    if (!lib.items.length) return toast("The library is empty.");
    download("library.json", JSON.stringify(lib.items.map((x) => x.data), null, 1) + "\n");
  };

  renderProblems($("#problems"));
  renderReport($("#report"));
  renderList();

  function renderList() {
    const q = filt.q.trim().toLowerCase();
    const shown = lib.items.filter(({ data: d }) =>
      (filt.showKnown || !isKnown(d.id)) &&
      (!settings.upToLesson || d.level.minna_max <= settings.lesson) &&
      (filt.kind === "all" || d.kind === filt.kind) &&
      (!filt.tag || d.tags.includes(filt.tag)) &&
      (!q || [d.title, d.subtitle, d.page_title, ...d.tags].some((s) => String(s).toLowerCase().includes(q))));
    const above = settings.upToLesson ? lib.items.filter((x) => x.data.level.minna_max > settings.lesson).length : 0;
    const hidden = [above ? `${above} above L${settings.lesson}` : "", nKnown && !filt.showKnown ? `${nKnown} known` : ""].filter(Boolean);
    $("#count").textContent = `${shown.length} of ${lib.items.length} kaiwa` + (hidden.length ? ` · hidden: ${hidden.join(", ")}` : "");
    $("#klist").innerHTML = shown.length
      ? shown.map(cardHTML).join("")
      : `<li class="empty">${lib.items.length ? "Nothing matches these filters." : "No kaiwa yet. Add a file below."}</li>`;
    $("#klist").querySelectorAll("a[data-open]").forEach((a) => (a.onclick = (e) => { e.preventDefault(); openKaiwa(a.dataset.open); }));
  }
}

function cardHTML({ data: d, source }) {
  const pr = getProgress(d.id);
  const n = d.lines.length;
  const done = pr.p.filter((i) => i < n).length, mastered = pr.m.filter((i) => i < n).length;
  const prog = done
    ? `<span class="kprog"><span class="pbar" aria-hidden="true"><i style="width:${(100 * done) / n}%"></i><b style="width:${(100 * mastered) / n}%"></b></span>${done}/${n} practised · ${mastered} mastered · ${esc(fmtDate(pr.last))}</span>`
    : '<span class="kprog none">Not practised yet</span>';
  const f = d.level.focus;
  return `<li><a class="kcard" href="#${esc(d.id)}" data-open="${esc(d.id)}">
    <span class="kmeta">${d.kind === "story" ? "Story" : "Dialogue"} · ${esc(d.level.jlpt)} · Minna ≤ L${d.level.minna_max} · focus L${f[0]}–${f[1]} · ${n} lines${source === "imported" ? ' · <span class="imp">imported</span>' : ""}${isKnown(d.id) ? ' · <span class="imp">known</span>' : ""}</span>
    <span class="ktitle" lang="ja">${esc(d.title)}</span>
    <span class="ksub">${esc(d.subtitle)}</span>
    <span class="ktags">${d.tags.map(esc).join(" · ")}</span>
    ${prog}
  </a></li>`;
}

function renderProblems(box) {
  if (!lib.problems.length) { box.innerHTML = ""; return; }
  box.innerHTML = `<details class="problems" open><summary>${lib.problems.length} file${lib.problems.length > 1 ? "s" : ""} could not be used</summary>
    ${lib.problems.map((p, k) => `<div class="prob"><b>${esc(p.name)}</b> <span class="src">${p.source === "imported" ? "imported" : "library"}</span>
      <ul>${p.errors.map((e) => `<li>${esc(e)}</li>`).join("")}</ul>
      ${p.source === "imported" && p.id ? `<div class="row"><button type="button" class="plain danger" data-del="${k}">Delete from this device</button></div>` : ""}</div>`).join("")}
  </details>`;
  box.querySelectorAll("[data-del]").forEach((b) => (b.onclick = async () => {
    const p = lib.problems[+b.dataset.del];
    if (!confirm(`Delete the imported "${p.id}" from this device?`)) return;
    await deleteImported(p.id);
    await reload();
    renderMain();
  }));
}

function renderReport(box) {
  if (!report.length) { box.innerHTML = ""; return; }
  box.innerHTML = `<div class="report"><div class="row"><b>Import</b><span class="grow"></span><button type="button" class="plain small" id="clearReport">Close</button></div>
    ${report.map((r) => `<div class="rline ${r.ok ? "ok" : "bad"}"><span class="st">${r.ok ? r.ok : "Not imported"}</span> ${esc(r.label)}
      ${r.errors.length ? `<ul>${r.errors.map((e) => `<li>${esc(e)}</li>`).join("")}</ul>` : ""}</div>`).join("")}</div>`;
  box.querySelector("#clearReport").onclick = () => { report = []; box.innerHTML = ""; };
}

async function importParsed(parsed) {
  report = [];
  for (const p of parsed) {
    if (p.errors.length) { report.push({ label: p.label, ok: "", errors: p.errors }); continue; }
    const existing = byId(p.data.id);
    if (existing && existing.source === "repo") {
      report.push({ label: p.label, ok: "", errors: [`id "${p.data.id}" is already in the built-in library. Change the id to import a copy.`] });
      continue;
    }
    try {
      await putImported(p.data);
      report.push({ label: p.label, ok: existing ? "Updated" : "Imported", errors: [] });
    } catch (err) {
      report.push({ label: p.label, ok: "", errors: ["could not store it on this device: " + err.message] });
    }
  }
  await reload();
  tab = "library";
  renderMain();
  const good = report.filter((r) => r.ok).length;
  toast(good ? `${good} kaiwa added.` : "Nothing was imported. See the errors below the list.");
  view.querySelector("#report")?.scrollIntoView({ block: "nearest" });
}

// ---- export / share / delete -----------------------------------------------
function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
const fileText = (d) => JSON.stringify(d, null, 1) + "\n";
function exportOne(item) { download(`${item.data.id}.kaiwa.json`, fileText(item.data)); }

async function share(item) {
  const d = item.data;
  if (item.source === "imported") {
    const file = new File([fileText(d)], `${d.id}.kaiwa.json`, { type: "application/json" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: d.page_title }); } catch { /* cancelled */ }
      return;
    }
    exportOne(item);
    toast("This kaiwa is only on this device, so a link won't open it elsewhere. The file was saved: send it to your partner to import.");
    return;
  }
  const url = location.origin + location.pathname + "#" + d.id;
  if (navigator.share) {
    try { await navigator.share({ title: `${d.page_title} · Kaiwa`, text: `${d.title}: ${d.subtitle}`, url }); return; }
    catch (err) { if (err && err.name === "AbortError") return; }
  }
  try { await navigator.clipboard.writeText(url); toast("Link copied: " + url); }
  catch { window.prompt("Copy this link:", url); }
}

async function removeImported(item) {
  if (!confirm(`Delete "${item.data.page_title}" from this device? Export it first if you want to keep it.`)) return;
  await deleteImported(item.data.id);
  await reload();
  toast("Deleted.");
  goHome();
}

// ---- hard lines ------------------------------------------------------------
function renderHard(panel) {
  const groups = Object.entries(allHard())
    .map(([id, idx]) => ({ item: byId(id), idx }))
    .filter((g) => g.item && g.idx.some((i) => i < g.item.data.lines.length));
  if (!groups.length) {
    panel.innerHTML = '<p class="empty">No hard lines yet. While practising, long-press a line to mark it hard; it shows up here for quick review.</p>';
    return;
  }
  panel.innerHTML = `<p class="hint">Say the line from the English, then tap to check. Tap the speaker to hear it.</p>` +
    groups.map(({ item, idx }) => {
      const d = item.data;
      return `<section class="hgroup"><h2><a href="#${esc(d.id)}" data-open="${esc(d.id)}" lang="ja">${esc(d.title)}</a><small>${esc(d.subtitle)}</small></h2><div class="stack">` +
        idx.filter((i) => i < d.lines.length).map((i) => {
          const l = d.lines[i], key = d.id + ":" + i, open = hardOpen[key];
          const role = d.roles.find((r) => r.id === l.who);
          return `<div class="card hline${open ? " open" : ""}" data-key="${esc(key)}" tabindex="0">
            <div class="who">Line ${esc(lineLabel(l, i))}${d.roles.length > 1 && role ? " · " + esc(role.ja + " " + role.en) : ""}</div>
            ${open ? `<div class="ja" lang="ja">${esc(l.ja)}</div><div class="kana" lang="ja">${esc(l.kana)}</div><div class="en">${esc(l.en)}</div>`
                   : `<div class="cue">${esc(l.en)}</div><div class="tap">Tap to check</div>`}
            <div class="row">
              ${canSpeak() ? `<button type="button" class="icon" data-say="${esc(key)}" aria-label="Listen">${ICON.speaker}</button>` : ""}
              <span class="grow"></span>
              <button type="button" class="plain small" data-go="${esc(key)}">Open in kaiwa</button>
              <button type="button" class="plain small" data-unhard="${esc(key)}">Not hard</button>
            </div></div>`;
        }).join("") + "</div></section>";
    }).join("");
  const split = (k) => { const at = k.lastIndexOf(":"); return [k.slice(0, at), +k.slice(at + 1)]; };
  panel.querySelectorAll("a[data-open]").forEach((a) => (a.onclick = (e) => { e.preventDefault(); openKaiwa(a.dataset.open); }));
  panel.querySelectorAll(".hline").forEach((c) => {
    const flip = () => { hardOpen[c.dataset.key] = !hardOpen[c.dataset.key]; renderMain(); view.querySelector(`.hline[data-key="${CSS.escape(c.dataset.key)}"]`)?.focus({ preventScroll: true }); };
    c.onclick = (e) => { if (!e.target.closest("button")) flip(); };
    c.onkeydown = (e) => { if (e.target === c && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); flip(); } };
  });
  panel.querySelectorAll("[data-say]").forEach((b) => (b.onclick = async () => {
    const [id, i] = split(b.dataset.say);
    if (!(await findVoice())) return toast("No Japanese voice installed. See Settings.");
    const l = byId(id).data.lines[i];
    speak(settings.ttsFrom === "kana" ? l.kana : l.ja, settings.rate);
  }));
  panel.querySelectorAll("[data-go]").forEach((b) => (b.onclick = () => { const [id, i] = split(b.dataset.go); openKaiwa(id, i); }));
  panel.querySelectorAll("[data-unhard]").forEach((b) => (b.onclick = () => { const [id, i] = split(b.dataset.unhard); toggleHard(id, i); renderMain(); }));
}

// ---- settings --------------------------------------------------------------
function renderSettings(panel) {
  const imported = lib.items.filter((x) => x.source === "imported").length;
  panel.innerHTML = `
    <div class="settings">
      <div class="set">
        <label for="lesson">My Minna lesson</label>
        <div class="row">
          <button type="button" class="step" id="lessonDown" aria-label="One lesson lower">−</button>
          <input type="number" id="lesson" min="1" max="50" inputmode="numeric" value="${settings.lesson}">
          <button type="button" class="step" id="lessonUp" aria-label="One lesson higher">+</button>
        </div>
        <label class="check"><input type="checkbox" id="upTo2" ${settings.upToLesson ? "checked" : ""}> Show only kaiwa up to this lesson</label>
      </div>
      <div class="set">
        <span class="lbl">Theme</span>
        <div class="row">${[["auto", "Auto"], ["light", "Light"], ["dark", "Dark"]].map(([k, l]) => `<button type="button" data-theme-set="${k}" aria-pressed="${settings.theme === k}">${l}</button>`).join("")}</div>
      </div>
      <div class="set">
        <label for="rate">Listen speed <output id="rateOut">${settings.rate.toFixed(2)}</output></label>
        <input type="range" id="rate" min="0.7" max="1" step="0.05" value="${settings.rate}">
        <span class="lbl">Read aloud from</span>
        <div class="row">
          <button type="button" data-from="ja" aria-pressed="${settings.ttsFrom === "ja"}">Japanese text</button>
          <button type="button" data-from="kana" aria-pressed="${settings.ttsFrom === "kana"}">Kana reading</button>
        </div>
        <p class="hint small">Kana gives the exact reading of names (錦糸町, 飛騨牛); the Japanese text usually sounds more natural.</p>
        <div class="row"><button type="button" class="plain" id="testVoice">Test the voice</button></div>
        <p class="hint small" id="voiceStatus">${canSpeak() ? "Looking for a Japanese voice…" : "This browser cannot read aloud."}</p>
      </div>
      <div class="set">
        <label class="check"><input type="checkbox" id="mic" ${settings.mic && canListen() ? "checked" : ""} ${canListen() ? "" : "disabled"}> Speak your line (microphone)</label>
        <p class="hint small">${canListen()
          ? "Adds a microphone button to your lines and shows what was heard next to the model line, with a rough match hint. Uses Chrome's speech recognition, which usually needs a connection."
          : "Needs Chrome (on Android or desktop). Not available in this browser."}</p>
      </div>
      <div class="set">
        <span class="lbl">This device</span>
        <p class="hint small">${lib.items.length} kaiwa in the library, ${imported} imported. Progress and hard lines are kept on this device only.</p>
        <div class="row"><button type="button" class="plain danger" id="clearProg">Clear progress and hard marks</button></div>
      </div>
      <p class="hint small about">Kaiwa <span id="ver"></span> · files in the <a href="https://github.com/RudyBoe/kaiwa/blob/main/docs/kaiwa-format.md">kaiwa/1 format</a> · <a href="https://github.com/RudyBoe/kaiwa">source on GitHub</a></p>
    </div>`;
  const $ = (s) => panel.querySelector(s);
  const setLesson = (n) => {
    settings.lesson = Math.min(50, Math.max(1, Math.round(Number(n)) || 33));
    saveSettings();
    $("#lesson").value = settings.lesson;
  };
  $("#lesson").onchange = (e) => setLesson(e.target.value);
  $("#lessonDown").onclick = () => setLesson(settings.lesson - 1);
  $("#lessonUp").onclick = () => setLesson(settings.lesson + 1);
  $("#upTo2").onchange = (e) => { settings.upToLesson = e.target.checked; saveSettings(); };
  panel.querySelectorAll("[data-theme-set]").forEach((b) => (b.onclick = () => { settings.theme = b.dataset.themeSet; saveSettings(); applyTheme(); renderMain(); }));
  $("#rate").oninput = (e) => { settings.rate = Number(e.target.value); $("#rateOut").textContent = settings.rate.toFixed(2); saveSettings(); };
  panel.querySelectorAll("[data-from]").forEach((b) => (b.onclick = () => { settings.ttsFrom = b.dataset.from; saveSettings(); renderMain(); }));
  $("#testVoice").onclick = async () => {
    if (!(await findVoice())) return toast("No Japanese voice installed.");
    speak(settings.ttsFrom === "kana" ? "こんにちは。ゆっくりはなしてください。" : "こんにちは。ゆっくり話してください。", settings.rate);
  };
  $("#mic").onchange = (e) => { settings.mic = e.target.checked; saveSettings(); };
  $("#clearProg").onclick = () => {
    if (!confirm("Clear all progress marks and hard lines on this device?")) return;
    clearProgress();
    toast("Progress cleared.");
    renderMain();
  };
  if (canSpeak()) {
    findVoice().then((v) => {
      const el = $("#voiceStatus");
      if (!el) return;
      el.textContent = v
        ? "Japanese voice: " + voiceName() + "."
        : "No Japanese voice found. On Android: Settings › System › Languages › Text-to-speech › Speech Services by Google › install Japanese. Then reopen Kaiwa.";
      el.classList.toggle("warn", !v);
    });
  }
  if ("caches" in self) {
    caches.keys().then((keys) => {
      const k = keys.find((x) => /^kaiwa-v\d+$/.test(x));
      const el = $("#ver");
      if (k && el) el.textContent = "cache " + k.slice(6);
    }).catch(() => {});
  }
}

// ---- misc ------------------------------------------------------------------
function applyTheme() {
  const root = document.documentElement;
  if (settings.theme === "light" || settings.theme === "dark") root.dataset.theme = settings.theme;
  else delete root.dataset.theme;
}

let toastTimer = 0;
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("show"), Math.min(9000, 2500 + msg.length * 40));
}
