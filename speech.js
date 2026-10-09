// Speech: read lines aloud with the browser's own Japanese voice
// (speechSynthesis, works offline when the voice is installed on the phone),
// and optionally listen to the learner (webkitSpeechRecognition, Chrome).

const synth = "speechSynthesis" in self ? self.speechSynthesis : null;
let voice = null;

function pickVoice() {
  if (!synth) return null;
  const vs = synth.getVoices().filter((v) => /^ja([-_]|$)/i.test(v.lang));
  voice = vs.find((v) => /ja[-_]JP/i.test(v.lang) && v.localService) || vs.find((v) => /ja[-_]JP/i.test(v.lang)) || vs[0] || null;
  return voice;
}

// Resolves to the Japanese voice, or null when none is installed. Voices load
// asynchronously, so wait briefly for them.
export function findVoice() {
  if (!synth) return Promise.resolve(null);
  if (pickVoice()) return Promise.resolve(voice);
  return new Promise((resolve) => {
    const done = () => { synth.removeEventListener("voiceschanged", done); clearTimeout(t); resolve(pickVoice()); };
    const t = setTimeout(done, 2500);
    synth.addEventListener("voiceschanged", done);
  });
}
export const canSpeak = () => Boolean(synth);
export const voiceName = () => (voice ? `${voice.name} (${voice.lang})` : "");

let current = null;
// Speak text; onend is called once, also when the browser forgets to fire
// "end" (some Android builds) or when the speech is cancelled.
export function speak(text, rate, onend) {
  if (!synth) { if (onend) setTimeout(onend, 0); return; }
  stop();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "ja-JP";
  if (voice) u.voice = voice;
  u.rate = rate;
  let fired = false;
  const finish = () => { if (fired) return; fired = true; clearTimeout(guard); if (current === u) current = null; if (onend) onend(); };
  const guard = setTimeout(finish, 2500 + (text.length * 320) / rate);
  u.onend = finish;
  u.onerror = finish;
  current = u;
  synth.speak(u);
}
export function stop() {
  if (!synth) return;
  const u = current;
  current = null;
  if (u) { u.onend = null; u.onerror = null; }
  synth.cancel();
}

// ---- Recognition --------------------------------------------------------
const Rec = self.SpeechRecognition || self.webkitSpeechRecognition;
export const canListen = () => Boolean(Rec);

let rec = null;
// Listen once. cb(err, alternatives[])
export function listen(cb) {
  if (!Rec) return cb(new Error("Speech recognition needs Chrome."));
  if (rec) { try { rec.abort(); } catch { /* already stopped */ } }
  const r = new Rec();
  rec = r;
  r.lang = "ja-JP";
  r.interimResults = false;
  r.maxAlternatives = 3;
  let answered = false;
  r.onresult = (e) => {
    answered = true;
    const res = e.results[0];
    cb(null, Array.from({ length: res.length }, (_, k) => res[k].transcript));
  };
  r.onerror = (e) => {
    if (answered) return;
    answered = true;
    const why = {
      "no-speech": "Didn't hear anything. Try again a little closer.",
      network: "Speech recognition needs a connection (or Japanese offline speech in the phone's settings).",
      "not-allowed": "Microphone access was refused. Allow it in the browser's site settings.",
      "service-not-allowed": "Microphone access was refused. Allow it in the browser's site settings.",
      "language-not-supported": "Japanese speech recognition isn't available on this device.",
      aborted: "Stopped.",
    }[e.error] || "Speech recognition failed (" + e.error + ").";
    cb(new Error(why));
  };
  r.onend = () => { if (rec === r) rec = null; if (!answered) { answered = true; cb(new Error("Didn't hear anything. Try again.")); } };
  r.start();
  return () => { try { r.stop(); } catch { /* ignore */ } };
}

// A simple closeness hint between what was heard and the model line:
// characters in common (longest common subsequence) over the average length,
// against both the written line and its kana reading.
const strip = (s) => String(s || "").normalize("NFKC").replace(/[\s、。，．,.!?！？「」『』（）()・…〜~ー-]/g, "");
const hira = (s) => s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
function lcs(a, b) {
  const row = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    let prev = 0;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j];
      row[j] = a[i - 1] === b[j - 1] ? prev + 1 : Math.max(row[j], row[j - 1]);
      prev = tmp;
    }
  }
  return row[b.length];
}
const ratio = (a, b) => (a.length + b.length ? (2 * lcs(a, b)) / (a.length + b.length) : 0);
export function matchHint(heard, line) {
  let best = 0;
  for (const h of heard) {
    const x = strip(h);
    best = Math.max(best, ratio(x, strip(line.ja)), ratio(hira(x), hira(strip(line.kana))));
  }
  if (best >= 0.85) return { score: best, label: "Close match" };
  if (best >= 0.6) return { score: best, label: "Partly there" };
  return { score: best, label: "Quite different" };
}
