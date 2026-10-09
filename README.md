# Kaiwa

Practise Japanese dialogues and short stories aloud, alone or with a partner.
An offline-first web app (plain HTML/CSS/JS, no build step, no backend) served
with GitHub Pages: **https://rudyboe.github.io/kaiwa/**

On Android Chrome: open the link, then menu › *Add to Home screen* (or
*Install app*). After the first visit everything works in airplane mode.

## What it does

- **Library**: every kaiwa with its kind, JLPT level, Minna range, tags, line
  count and your progress. Filter by *Up to L33* (your lesson, set in
  Settings), by kind and by tag; search on title and tags.
- **Practice**: pick a role (A, B, or Both when alone). Your lines at five
  levels: Read · No kana · Cue (English) · Keywords · Free. Partner lines shown,
  or *Listen only*. Tap a line to reveal it, tap again to mark it done; the
  gold bar marks the next line. Curveballs only for the role that throws them,
  questions only for the asker. Notes at the bottom.
- **Listen**: a speaker button on each line reads it with the phone's Japanese
  voice (speed 0.7–1.0 in Settings). **Auto-play partner**: the app speaks the
  other role's lines and waits for you to say yours (tap *Continue*, or tap
  the line). In *Both* you choose which role the app plays.
- **Speak your line** (Settings, Chrome only): a microphone button on your
  lines shows what was heard next to the model line, with a rough match hint.
- **Hard lines**: long-press a line (or press H on a keyboard) to mark it
  hard. The *Hard lines* tab collects them across all kaiwa for quick review.
- Role, level and partner mode are remembered per kaiwa on each device.
  Progress: *practised* = lines marked done; *mastered* = your own lines marked
  done at Cue, Keywords or Free (said before seeing them).

## Practising with a partner

Each person opens the same kaiwa on their own phone and picks a role; nothing
syncs and nothing needs a server. *Share* sends a link like
`https://rudyboe.github.io/kaiwa/#cafe-takayama` that opens the kaiwa
directly. A kaiwa you imported yourself isn't on other phones, so *Share* sends
the file instead (or saves it, to send yourself); your partner imports it.

## Adding a kaiwa

Every kaiwa is one file in the strict **kaiwa/1** format, described in
[docs/kaiwa-format.md](docs/kaiwa-format.md). The `kaiwa` skill writes these
files.

**For everyone (in the repo):**

1. Check it: `python3 tools/validate_kaiwa.py my-kaiwa.kaiwa.json` (or
   `node tools/check.mjs` after step 2). The file name must be `<id>.kaiwa.json`.
2. Put it in `library/` and add its file name to `library/index.json`.
3. Commit and push. The *Validate library* GitHub Action checks every file;
   phones pick up the new kaiwa the next time Kaiwa opens online.

**Only on your phone:** Library › *Add files* (several at once, or a
`library.json`) or *Paste JSON*. Imported kaiwa are stored on the device
(IndexedDB) and work offline. *Export library* saves everything as
`library.json`; *Export file* on a kaiwa saves that one.

Invalid files are never dropped silently: the library shows each file that
couldn't be used with its errors, and imports report per file.

## Files

| Path | What |
|---|---|
| `index.html`, `style.css`, `app.js` | page, look, library / hard lines / settings |
| `practice.js` | practice screen |
| `speech.js` | read-aloud and speech recognition |
| `store.js` | IndexedDB (imported kaiwa), localStorage (settings, progress, hard lines), library loading |
| `validate.js` | kaiwa/1 validator, a port of `tools/validate_kaiwa.py` with the same rules and messages |
| `sw.js`, `manifest.webmanifest`, `icons/` | offline support and home-screen install |
| `library/` | the kaiwa files and `index.json` |
| `tools/validate_kaiwa.py` | the reference validator (Python 3, no dependencies) |
| `tools/check.mjs` | library check with the app's validator, plus index.json, ids and file names |
| `tools/test-validate.mjs` | tests that `validate.js` gives the Python validator's messages |
| `tools/serve.mjs`, `tools/icons.mjs` | local test server, icon drawing |
| `docs/` | the format spec and the original app brief |
| `reference/template.html` | the stand-alone reading page this app's practice screen follows |

## Changing the app

- Test locally: `node tools/serve.mjs` → http://localhost:8080/
- **Bump `VERSION` in `sw.js` and the `?v=` tags in `index.html` on every
  change**, or phones keep the cached version. Adding a kaiwa to `library/`
  needs no bump (library files are fetched network-first).
- `validate.js` differs from the Python validator only where Python would
  crash instead of reporting: a non-object file, and `curveballs` /
  `questions` / `notes` that aren't lists.
