# Kaiwa app — prompt for Claude Code

Read `claude/00-master.md` first. Paste the prompt below into Claude Code (with the GitHub setup used for Trip Kit). Attach `kaiwa-library.zip` (from the Anki thread, 2026-10-09) or copy the files from `claude/kaiwa-format.md` and `claude/kaiwa.md`.

---

## Prompt

Build **Kaiwa**, an offline-first web app (PWA, plain HTML/CSS/JS, no build step, no backend) for practising Japanese dialogues and short stories alone or with a partner. New public GitHub repo `kaiwa`, served with GitHub Pages, same approach as my Trip Kit repo (service worker, versioned cache, home-screen shortcut on Android Chrome). Don't touch the kanji-trainer or trip-kit repos.

**Content format.** Every kaiwa is a JSON file in the strict `kaiwa/1` format. The spec and a Python validator are in `kaiwa-format.md` (attached); five valid examples are in `library/`. Put them in `library/` in the repo with an `index.json` listing the files. Port the validator to JS (`validate.js`) with the same rules; use it in the app on every load or import and show clear per-file errors instead of failing silently. Add the Python validator as `tools/validate_kaiwa.py` and a GitHub Action that validates `library/*.kaiwa.json` on push.

**Library screen**
- Lists all kaiwa: title, subtitle, kind (dialogue/story), JLPT, `minna_max` and focus range, tags, number of lines.
- Filter by "my lesson" (show only kaiwa with `minna_max` ≤ my lesson; my lesson is a setting, default 33), by tag, by kind. Search on title and tags.
- Import: add `.kaiwa.json` files (file picker, several at once, or paste JSON). Imported kaiwa are stored in IndexedDB and survive offline. Export: download one kaiwa or the whole library as `library.json`. Delete imported ones.
- Per kaiwa, a small progress mark (practised / mastered lines, last practised date).

**Practice screen** (same behaviour as the current reading pages; `reference/template.html` in the zip is the working reference: copy its interaction model, not necessarily its code)
- Pick a role: A, B, or Both (alone). Swap roles button.
- My lines, five levels: Read (JP + kana + EN) · No kana · Cue (English) · Keywords (`kw`) · Free (improvise, tap for the model).
- Partner lines: Show, or Listen only (hidden until tapped).
- Tap a line to reveal it, tap again to mark it done; a marker shows the current line. Start again.
- Curveballs: only the ones thrown by my role are visible (all when Both). Questions: shown to the asker; the teller answers.
- Notes (Background, New words, Grammar, Swap in) at the bottom.
- **Listen button per line** using the browser's `speechSynthesis` with a `ja-JP` voice (rate setting 0.7–1.0). In "Both" self-practice add an **auto-play partner** mode: the app speaks the partner's lines, then pauses for me to say mine (tap to continue). If no Japanese voice is installed, say so once and tell me to install Japanese in the phone's text-to-speech settings.
- Optional (behind a toggle, Chrome only): **speak your line** with `webkitSpeechRecognition` `ja-JP`, show what was heard next to the model line. No scoring beyond a simple match hint.

**Self-practice extras**
- Mark a line "hard" with a long press; a "Hard lines" view across all kaiwa for quick review.
- Per-kaiwa level remembered per device.

**Group practice (no server)**
- Each person opens the same kaiwa on their own phone and picks a role; nothing needs to sync.
- Share link: `…/#<id>` opens that kaiwa directly (only plain `#id` in the URL). A "Share" button uses the Web Share API with a fallback to copy the link.
- Imported kaiwa that aren't in the repo can be shared as a file (export one kaiwa) or as a link to the repo once committed.

**Design:** phone-first, readable at arm's length, light and dark theme, Japanese in a Mincho face, kana in a gothic face (Google Fonts with system fallbacks). Calm, like a textbook page; no emoji.

**Deliver:** working app on GitHub Pages; README with how to add a kaiwa (drop a validated file in `library/` and add it to `index.json`, or import on the phone); test it offline in airplane mode; list anything that didn't work. Then tell me the live URL.

---

## After the app exists
- The `kaiwa` skill outputs a `<id>.kaiwa.json` file in `kaiwa/1` (validated) next to the stand-alone page, so a new kaiwa can be imported into the app or committed to `library/`.
- Record the repo, live URL and cache version in `claude/00-master.md`.

## Change log
- 2026-10-09 created (Anki thread)
