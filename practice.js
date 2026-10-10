// Practice screen for one kaiwa. Interaction model from reference/template.html:
// pick a role, choose how much of your own lines you see, tap to reveal, tap
// again to mark done; a gold bar marks the next line. Added here: listen
// buttons, auto-play partner, optional mic check, long-press "hard" marks,
// progress and remembered per-kaiwa settings.
import { settings, getPrefs, savePrefs, recordDone, isHard, toggleHard, flag, setFlag, isKnown, setKnown } from "./store.js";
import { canSpeak, findVoice, speak, stop as stopSpeech, canListen, listen, matchHint } from "./speech.js";
import { esc, lineLabel, ICON } from "./ui.js";

const LEVELS = [[1, "Read"], [2, "No kana"], [3, "Cue"], [4, "Keywords"], [5, "Free"]];
const HINT = {
  1: "Your lines in Japanese, kana and English.",
  2: "Your lines without kana.",
  3: "Say your line from the English cue, tap to check.",
  4: "Build your line from the keywords, tap to check.",
  5: "Say your line freely, tap to see the model.",
};
const NO_VOICE = "No Japanese voice is installed on this device, so Listen stays silent. On Android: Settings › System › Languages › Text-to-speech › Speech Services by Google › install Japanese, then reopen Kaiwa.";

export function renderPractice(root, item, ctx) {
  const D = item.data;
  const id = D.id;
  const two = D.roles.length > 1;
  const ids = D.roles.map((r) => r.id);
  const p = getPrefs(id);
  const st = {
    role: p.role === "both" || ids.includes(p.role) ? p.role : "both",
    level: LEVELS.some(([n]) => n === p.level) ? p.level : 1,
    partner: p.partner === "listen" ? "listen" : "show",
    // The app plays the other side by default; in a story, the teller (the listener has no lines).
    appRole: ids.includes(p.appRole) ? p.appRole : D.kind === "story" ? ids[0] : ids[ids.length - 1],
    open: {}, done: {}, heard: {},
  };
  if (!two && st.role !== "both" && st.role !== ids[0]) st.role = "both";
  const save = () => savePrefs(id, { role: st.role, level: st.level, partner: st.partner, appRole: st.appRole });
  const roleName = (rid) => { const r = D.roles.find((x) => x.id === rid); return r ? r.ja + " " + r.en : ""; };
  const isMine = (l) => st.role === "both" || l.who === st.role;
  const sayText = (l) => (settings.ttsFrom === "kana" ? l.kana : l.ja);
  let voiceOk = null;   // null = still checking
  let listening = -1;

  root.innerHTML = `
    <div class="topbar">
      <a class="back" href="./" data-home>${ICON.back}<span>Library</span></a>
      <button class="ghost" id="share" type="button">${ICON.share}<span>Share</span></button>
    </div>
    <header class="khead">
      <span class="eyebrow">${esc(D.eyebrow)}</span>
      <h1>${esc(D.title)}<small>${esc(D.subtitle)}</small></h1>
      <p class="scene">${esc(D.scene)}</p>
      <p class="meta">${esc(D.meta)}</p>
    </header>
    <div class="bar">
      <div class="row" id="roleRow"><span class="lab">I am</span></div>
      <div class="row" id="levelRow"><span class="lab">My lines</span></div>
      <div class="row" id="partnerRow"><span class="lab">Partner</span></div>
      <div class="row" id="voiceRow"><span class="lab">Voice</span></div>
    </div>
    <p class="hint" id="hint"></p>
    <p class="notice" id="voiceNotice" hidden></p>
    <ol class="turns" id="turns"></ol>
    <div class="row"><button class="plain" id="restart" type="button">Start again</button><button class="plain" id="swap" type="button">Swap roles</button></div>
    <p class="hint small">Long-press a line to mark it hard; it then shows up under Hard lines.</p>
    <section class="extra" id="curveSec" hidden>
      <h2>変化球<small>Curveballs: throw one in to make your partner answer off-script</small></h2>
      <div class="stack" id="curves"></div>
    </section>
    <section class="extra" id="qSec" hidden>
      <h2>質問<small id="qSub"></small></h2>
      <div class="stack" id="qs"></div>
    </section>
    <footer class="notes" id="notes"></footer>
    <section class="extra this">
      <h2>This kaiwa<small>${item.source === "imported" ? "Imported, stored on this device only." : "Part of the built-in library."}</small></h2>
      <div class="row">
        <button id="known" type="button" aria-pressed="${isKnown(id)}">${isKnown(id) ? "Known (hidden from the list)" : "Mark as known"}</button>
        <button class="plain" id="exportOne" type="button">Export file</button>
        ${item.source === "imported" ? '<button class="plain danger" id="deleteOne" type="button">Delete</button>' : ""}
      </div>
      ${item.source === "imported" ? '<p class="hint small">A share link only opens this kaiwa on phones that have it too. Send the exported file, or commit it to the library on GitHub.</p>' : ""}
    </section>
    <div class="player" id="player" hidden>
      <span class="pstat" id="pstat"></span>
      <button type="button" id="pgo">Continue</button>
      <button type="button" class="plain" id="pstop">Stop</button>
    </div>`;
  const $ = (sel) => root.querySelector(sel);
  const turns = $("#turns");

  // ---- controls --------------------------------------------------------
  function btn(row, label, pressed, fn) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.setAttribute("aria-pressed", pressed ? "true" : "false");
    b.onclick = fn;
    row.appendChild(b);
    return b;
  }
  function controls() {
    for (const rid of ["#roleRow", "#levelRow", "#partnerRow", "#voiceRow"]) {
      const r = $(rid);
      while (r.children.length > 1) r.removeChild(r.lastChild);
    }
    D.roles.forEach((r) => btn($("#roleRow"), r.ja + " " + r.en, st.role === r.id, () => { st.role = r.id; reset(); save(); render(); }));
    btn($("#roleRow"), two ? "Both (alone)" : "Just reading", st.role === "both", () => { st.role = "both"; reset(); save(); render(); });
    LEVELS.forEach(([n, l]) => btn($("#levelRow"), l, st.level === n, () => { st.level = n; st.open = {}; save(); render(); }));
    const solo = st.role === "both" || !two;
    $("#partnerRow").hidden = solo;
    btn($("#partnerRow"), "Show", st.partner === "show", () => { st.partner = "show"; st.open = {}; save(); render(); });
    btn($("#partnerRow"), "Listen only", st.partner === "listen", () => { st.partner = "listen"; st.open = {}; save(); render(); });

    const vr = $("#voiceRow");
    vr.hidden = !canSpeak() || !two;
    if (!vr.hidden) {
      const b = btn(vr, ap.on ? "Stop auto-play" : "Auto-play partner", ap.on, () => (ap.on ? apStop() : apStart()));
      b.classList.add("wide");
      if (st.role === "both") {
        const s = document.createElement("span");
        s.className = "lab inline";
        s.textContent = "App plays";
        vr.appendChild(s);
        D.roles.forEach((r) => btn(vr, r.en, st.appRole === r.id, () => { st.appRole = r.id; save(); if (ap.on) apStop(); controls(); }));
      }
    }
    $("#swap").hidden = !two || st.role === "both";
    $("#hint").textContent = HINT[st.level] + (solo ? "" : st.partner === "listen" ? " Partner lines stay hidden: listen, then tap." : " Your partner reads the other lines.");
  }

  // ---- lines -----------------------------------------------------------
  function lineHTML(l, i) {
    const mine = isMine(l), open = !!st.open[i];
    const full = (k) => `<div class="ja reveal" lang="ja">${esc(l.ja)}</div>${k ? `<div class="kana" lang="ja">${esc(l.kana)}</div>` : ""}<div class="en">${esc(l.en)}</div>`;
    let inner, shown;
    if (mine) {
      const lv = st.level;
      shown = lv <= 2 || open;
      if (lv === 1) inner = full(true);
      else if (lv === 2) inner = `<div class="ja" lang="ja">${esc(l.ja)}</div><div class="en">${esc(l.en)}</div>`;
      else if (open) inner = full(true);
      else if (lv === 3) inner = `<div class="cue">${esc(l.en)}</div><div class="tap">Tap to check</div>`;
      else if (lv === 4) inner = `<div class="cue kw" lang="ja">${esc(l.kw || "…")}</div><div class="tap">Tap to check</div>`;
      else inner = '<div class="cue">Your turn</div><div class="tap">Tap to see the model line</div>';
    } else {
      shown = true;
      if (st.partner === "listen" && !open) inner = '<div class="cue">Listen to your partner</div><div class="tap">Tap to read it</div>';
      else inner = full(st.level < 2 || st.partner === "listen");
    }
    const hardTag = isHard(id, i) ? '<span class="hardtag">Hard</span>' : "";
    const who = two ? `<div class="who">${esc(roleName(l.who))}${hardTag}</div>` : hardTag ? `<div class="who">${hardTag}</div>` : "";
    const h = st.heard[i];
    const heard = h ? `<div class="heard"><span class="lab">Heard</span> <span lang="ja">${esc(h.text)}</span> <span class="match m${h.score >= 0.85 ? 3 : h.score >= 0.6 ? 2 : 1}">${esc(h.label)}</span></div>` : "";
    const acts = [];
    if (canSpeak() && shown) acts.push(`<button type="button" class="icon" data-act="listen" aria-label="Listen to line ${esc(lineLabel(l, i))}">${ICON.speaker}</button>`);
    if (settings.mic && canListen() && mine) acts.push(`<button type="button" class="icon${listening === i ? " on" : ""}" data-act="mic" aria-label="Say line ${esc(lineLabel(l, i))} into the microphone">${ICON.mic}</button>`);
    const cls = ["turn"];
    if (mine && two && st.role !== "both") cls.push("mine");
    if (isHard(id, i)) cls.push("hard");
    return `<li class="${cls.join(" ")}" data-i="${i}" tabindex="0"><span class="n">${esc(lineLabel(l, i))}</span><div class="body">${who}${inner}${heard}</div><div class="acts">${acts.join("")}</div></li>`;
  }
  function updateLine(i) {
    const el = turns.querySelector(`.turn[data-i="${i}"]`);
    if (!el) return;
    const cls = [...el.classList].filter((c) => c === "done" || c === "current" || c === "speaking");
    el.outerHTML = lineHTML(D.lines[i], i);
    turns.querySelector(`.turn[data-i="${i}"]`).classList.add(...cls);
  }
  const firstOpen = (from = 0) => { for (let i = from; i < D.lines.length; i++) if (!st.done[i]) return i; return -1; };
  function marks() {
    const cur = firstOpen();
    turns.querySelectorAll(".turn").forEach((el) => {
      const i = +el.dataset.i;
      el.classList.toggle("done", !!st.done[i]);
      el.classList.toggle("current", i === cur);
    });
  }
  function markDone(i, value) {
    const l = D.lines[i];
    st.done[i] = value;
    if (value) recordDone(id, i, isMine(l) && st.level >= 3);
  }
  function tapTurn(i) {
    const l = D.lines[i], mine = isMine(l);
    const hidden = mine ? st.level >= 3 : st.partner === "listen";
    if (hidden && !st.open[i]) st.open[i] = true;
    else markDone(i, !st.done[i]);
    updateLine(i);
    marks();
    if (ap.on && ap.waiting === i && st.done[i]) apNext(i);
  }

  // Tap, keyboard and long-press on the list (event delegation).
  let press = null, suppress = false;
  turns.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-act]");
    const li = e.target.closest(".turn");
    if (!li) return;
    const i = +li.dataset.i;
    if (b) { e.stopPropagation(); return b.dataset.act === "listen" ? listenLine(i) : micLine(i); }
    if (suppress) { suppress = false; return; }
    tapTurn(i);
  });
  turns.addEventListener("keydown", (e) => {
    const li = e.target.closest(".turn");
    if (!li || e.target !== li) return;
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); tapTurn(+li.dataset.i); }
    if (e.key === "h" || e.key === "H") hardLine(+li.dataset.i);
  });
  turns.addEventListener("pointerdown", (e) => {
    const li = e.target.closest(".turn");
    if (!li || e.target.closest("button") || (e.pointerType === "mouse" && e.button !== 0)) return;
    suppress = false;
    press = { x: e.clientX, y: e.clientY, t: setTimeout(() => { press = null; suppress = true; hardLine(+li.dataset.i); }, 550) };
  });
  const cancelPress = () => { if (press) { clearTimeout(press.t); press = null; } };
  turns.addEventListener("pointermove", (e) => { if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 10) cancelPress(); });
  turns.addEventListener("pointerup", cancelPress);
  turns.addEventListener("pointercancel", cancelPress);
  turns.addEventListener("contextmenu", (e) => { if (e.target.closest(".turn")) e.preventDefault(); });

  function hardLine(i) {
    const on = toggleHard(id, i);
    if (navigator.vibrate) navigator.vibrate(15);
    updateLine(i);
    ctx.toast(on ? `Line ${lineLabel(D.lines[i], i)} marked hard.` : `Line ${lineLabel(D.lines[i], i)} is no longer marked hard.`);
  }

  // ---- voice -------------------------------------------------------------
  function needVoice() {
    if (voiceOk) return true;
    if (voiceOk === false) ctx.toast("No Japanese voice installed. See the note at the top.");
    return false;
  }
  function listenLine(i) {
    if (!needVoice()) return;
    if (ap.on) apStop();
    const el = turns.querySelector(`.turn[data-i="${i}"]`);
    turns.querySelectorAll(".speaking").forEach((x) => x.classList.remove("speaking"));
    el.classList.add("speaking");
    speak(sayText(D.lines[i]), settings.rate, () => {
      const x = turns.querySelector(`.turn[data-i="${i}"]`);
      if (x) x.classList.remove("speaking");
    });
  }
  function micLine(i) {
    if (listening === i) { listening = -1; updateLine(i); return; }
    stopSpeech();
    const prev = listening;
    listening = i;
    if (prev >= 0) updateLine(prev);
    updateLine(i);
    listen((err, alts) => {
      if (listening === i) listening = -1;
      if (err) { ctx.toast(err.message); updateLine(i); return; }
      st.heard[i] = Object.assign({ text: alts[0] }, matchHint(alts, D.lines[i]));
      updateLine(i);
    });
  }

  // Auto-play partner: the app speaks the other side's lines and waits on mine.
  const ap = { on: false, waiting: -1, timer: 0 };
  const appRole = () => (st.role === "both" ? st.appRole : ids.find((x) => x !== st.role));
  function apStart() {
    if (!needVoice()) return;
    const from = firstOpen();
    if (from < 0) { ctx.toast("All lines are done. Tap Start again first."); return; }
    ap.on = true;
    $("#player").hidden = false;
    document.body.classList.add("playing");
    controls();
    apStep(from);
  }
  function apStop() {
    ap.on = false;
    ap.waiting = -1;
    clearTimeout(ap.timer);
    stopSpeech();
    $("#player").hidden = true;
    document.body.classList.remove("playing");
    turns.querySelectorAll(".speaking").forEach((x) => x.classList.remove("speaking"));
    controls();
  }
  function setPlayer(text, canGo) {
    $("#pstat").textContent = text;
    $("#pgo").hidden = !canGo;
  }
  function apNext(i) {
    clearTimeout(ap.timer);
    ap.timer = setTimeout(() => apStep(firstOpen(i + 1)), 450);
  }
  function apStep(i) {
    if (!ap.on) return;
    if (i < 0) { setPlayer("End of the kaiwa.", false); ap.waiting = -1; return; }
    const l = D.lines[i];
    const el = turns.querySelector(`.turn[data-i="${i}"]`);
    el.scrollIntoView({ block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    if (l.who === appRole()) {
      ap.waiting = -1;
      setPlayer(`${roleName(l.who)} · line ${lineLabel(l, i)}`, false);
      st.open[i] = true;
      updateLine(i);
      turns.querySelector(`.turn[data-i="${i}"]`).classList.add("speaking");
      speak(sayText(l), settings.rate, () => {
        if (!ap.on) return;
        markDone(i, true);
        updateLine(i);
        turns.querySelector(`.turn[data-i="${i}"]`).classList.remove("speaking");
        marks();
        apNext(i);
      });
    } else {
      ap.waiting = i;
      setPlayer(`Your line ${lineLabel(l, i)}: say it, then Continue`, true);
    }
  }
  $("#pgo").onclick = () => {
    const i = ap.waiting;
    if (i < 0) return;
    if (!st.done[i]) { st.open[i] = true; markDone(i, true); updateLine(i); marks(); }
    apNext(i);
  };
  $("#pstop").onclick = apStop;

  // ---- extras ------------------------------------------------------------
  function answerHTML(a) {
    const k = D.lines.findIndex((l, i) => lineLabel(l, i) === String(a).trim());
    if (k < 0) return `<div class="kana" lang="ja">${esc(a)}</div>`;
    const l = D.lines[k];
    return `<div class="who">Line ${esc(lineLabel(l, k))}</div><div class="ja" lang="ja">${esc(l.ja)}</div><div class="kana" lang="ja">${esc(l.kana)}</div>`;
  }
  function extras() {
    const all = D.curveballs || [];
    const cb = all.filter((c) => st.role === "both" || c.by === st.role);
    $("#curveSec").hidden = !all.length;
    $("#curves").innerHTML = cb.length
      ? cb.map((c) => `<div class="card"><div class="who">${esc(roleName(c.by))} throws</div><div class="p">${esc(c.en)}</div>
          <details><summary>Say it like this</summary><div class="ja" lang="ja">${esc(c.ja)}</div><div class="kana" lang="ja">${esc(c.kana)}</div></details>
          <details><summary>A good answer</summary><div class="ja" lang="ja">${esc(c.reply_ja)}</div><div class="kana" lang="ja">${esc(c.reply_kana)}</div><div class="en">${esc(c.reply_en)}</div></details></div>`).join("")
      : '<p class="hint">Your partner has curveballs. Be ready to answer off-script.</p>';
    const qs = D.questions || [];
    $("#qSec").hidden = !qs.length;
    if (qs.length) {
      const asker = st.role === "both" || qs[0].by === st.role || !two;
      $("#qSub").textContent = asker ? "Ask these in any order. The answers are folded." : "Your partner asks these. Answer without looking.";
      $("#qs").innerHTML = asker
        ? qs.map((q, i) => `<div class="card"><div class="who">Q${String(i + 1).padStart(2, "0")}</div><div class="ja" lang="ja">${esc(q.ja)}</div><div class="kana" lang="ja">${esc(q.kana)}</div><div class="en">${esc(q.en)}</div><details><summary>Answer</summary>${answerHTML(q.answer)}</details></div>`).join("")
        : "";
    }
    $("#notes").innerHTML = (D.notes || []).map((n) => `<p><b>${esc(n.label)}</b> ${esc(n.text)}</p>`).join("");
  }

  function reset() { st.open = {}; st.done = {}; st.heard = {}; if (ap.on) apStop(); }
  function render() {
    controls();
    turns.innerHTML = D.lines.map(lineHTML).join("");
    marks();
    extras();
  }

  $("#restart").onclick = () => { reset(); render(); window.scrollTo({ top: 0 }); };
  $("#swap").onclick = () => { st.role = ids[(ids.indexOf(st.role) + 1) % ids.length]; reset(); save(); render(); };
  $("#share").onclick = () => ctx.share(item);
  $("#exportOne").onclick = () => ctx.exportOne(item);
  $("#known").onclick = (e) => {
    const on = !isKnown(id);
    setKnown(id, on);
    e.currentTarget.setAttribute("aria-pressed", String(on));
    e.currentTarget.textContent = on ? "Known (hidden from the list)" : "Mark as known";
    ctx.toast(on ? "Marked as known: hidden from the library. Use Show known to see it again." : "Back in the library list.");
  };
  const del = $("#deleteOne");
  if (del) del.onclick = () => ctx.deleteImported(item);

  render();

  if (canSpeak()) {
    findVoice().then((v) => {
      voiceOk = Boolean(v);
      if (!v && !flag("noVoiceWarned")) {
        setFlag("noVoiceWarned");
        const n = $("#voiceNotice");
        n.textContent = NO_VOICE;
        n.hidden = false;
      }
    });
  } else voiceOk = false;

  if (ctx.focusLine != null) {
    const el = turns.querySelector(`.turn[data-i="${ctx.focusLine}"]`);
    if (el) { el.scrollIntoView({ block: "center" }); el.classList.add("flash"); el.focus({ preventScroll: true }); }
  }

  return function cleanup() { ap.on = false; clearTimeout(ap.timer); stopSpeech(); document.body.classList.remove("playing"); };
}
