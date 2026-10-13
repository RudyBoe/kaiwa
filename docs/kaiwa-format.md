# Kaiwa format — kaiwa/1 (strict)

Read `claude/00-master.md` first. This is the single source of truth for kaiwa files. The `kaiwa` skill writes it; the kaiwa web app reads it. Change it only by bumping the version (kaiwa/2) and noting the change below.

## File
- One kaiwa per file, named `<id>.kaiwa.json`, UTF-8, JSON (no comments).
- A library is a folder of these files plus `index.json` (array of file names), or a single `library.json` = array of kaiwa objects.

## Fields
| Key | Type | Rule |
|---|---|---|
| `format` | string | always `"kaiwa/1"` |
| `id` | string | lowercase slug, unique (`cafe-takayama`) |
| `kind` | string | `dialogue` (2 roles, 10–30 lines) or `story` (1 speaking role, 6–16 lines; role B optional = listener/asker) |
| `page_title` | string | 2–4 word romaji name (`Kissa Hida Kaiwa`) |
| `eyebrow` | string | short label line (`Kaiwa · N4 · 喫茶店で`) |
| `title` / `subtitle` | string | Japanese title / English subtitle |
| `scene` | string | one or two English sentences setting the scene |
| `level` | object | `{"jlpt":"N4","minna_max":33,"focus":[29,33]}` — highest Minna lesson used, and the recent range weighted |
| `meta` | string | one line: scope + anything beyond `minna_max`, with lesson numbers |
| `tags` | array of strings | 1–3 tags from the fixed list below (`hida`, `food`, …) |
| `created` | string | `YYYY-MM-DD` |
| `roles` | array | 1–2 of `{"id":"A"|"B","ja":"客","en":"Customer"}`; A = the learner's usual role |
| `lines` | array | each `{"who":"A","ja":"…","kana":"…","en":"…","kw":"…"}`, optional `"n":"08a"` (label override). `kana` = full reading in hiragana (katakana stays), no kanji. `kw` = 1–4 keywords joined by ・ |
| `curveballs` | array, optional | each `{"by","en","ja","kana","reply_ja","reply_kana","reply_en"}`; dialogues: 2–4, at least one per role |
| `questions` | array, optional | each `{"by","ja","kana","en","answer"}`; answer = line label or a short set reply |
| `notes` | array, optional | each `{"label","text"}`; conventional labels: Background:, New words:, Staff phrases…, Grammar (recent first):, Swap in: |

No other top-level keys. Validator below enforces all of this.

## Tags
Kaiwa in the repo library use 1–3 tags from this fixed list, so the tag row in the app stays short (`node tools/check.mjs` enforces it; imported kaiwa may use any tags):
- **Place** (at most one): `osaka` · `shiga` · `gifu` · `hida` · `toyama` · `tokyo` · `antwerp`
- **Topic** (one or two): `food` · `shopping` · `transport` (train, car, station) · `stay` (hotel, ryokan, rental house, host rules) · `onsen` · `sightseeing` · `people` (self-introduction, hosts, neighbours, small talk) · `trouble` (lost, late, forgotten) · `health` · `winter` (snow)

Need a new tag? Add it here and in `tools/check.mjs` first.

## Validator (python3, no dependencies)
```python
"""Validate kaiwa/1 files. Usage: python3 validate_kaiwa.py file.kaiwa.json [...]  -> exit 1 on errors."""
import json,sys,re
KANJI=re.compile(r'[一-鿿]')
def check(d):
    e=[]
    req={'format':str,'id':str,'kind':str,'page_title':str,'eyebrow':str,'title':str,'subtitle':str,'scene':str,'level':dict,'meta':str,'tags':list,'created':str,'roles':list,'lines':list}
    for k,t in req.items():
        if not isinstance(d.get(k),t): e.append(f'missing/wrong type: {k}')
    if e: return e
    if d['format']!='kaiwa/1': e.append('format must be "kaiwa/1"')
    if not re.fullmatch(r'[a-z0-9]+(-[a-z0-9]+)*',d['id']): e.append('id must be a lowercase slug')
    if d['kind'] not in ('dialogue','story'): e.append('kind must be dialogue or story')
    if not re.fullmatch(r'\d{4}-\d{2}-\d{2}',d['created']): e.append('created must be YYYY-MM-DD')
    lv=d['level']
    if lv.get('jlpt') not in ('N5','N4','N3','N2','N1'): e.append('level.jlpt must be N5..N1')
    if not isinstance(lv.get('minna_max'),int) or not 1<=lv['minna_max']<=50: e.append('level.minna_max must be 1..50')
    f=lv.get('focus')
    if not (isinstance(f,list) and len(f)==2 and all(isinstance(x,int) for x in f) and f[0]<=f[1]<=lv.get('minna_max',50)): e.append('level.focus must be [from,to] within minna_max')
    ids=[]
    for i,r in enumerate(d['roles']):
        if not (isinstance(r,dict) and r.get('id') in ('A','B') and r.get('ja') and r.get('en')): e.append(f'roles[{i}] needs id A|B, ja, en')
        else: ids.append(r['id'])
    if len(ids)!=len(set(ids)) or not 1<=len(ids)<=2: e.append('roles: 1 or 2 roles, unique ids')
    if d['kind']=='dialogue' and len(ids)!=2: e.append('dialogue needs 2 roles')
    n=len(d['lines'])
    if d['kind']=='dialogue' and not 10<=n<=30: e.append(f'dialogue should have 10-30 lines (has {n})')
    if d['kind']=='story' and not 6<=n<=16: e.append(f'story should have 6-16 lines (has {n})')
    for i,l in enumerate(d['lines']):
        for k in ('who','ja','kana','en','kw'):
            if not isinstance(l.get(k),str) or not l.get(k).strip(): e.append(f'lines[{i}].{k} missing')
        if l.get('who') not in ids: e.append(f'lines[{i}].who not a role id')
        if KANJI.search(l.get('kana','')): e.append(f'lines[{i}].kana contains kanji')
        if 'n' in l and not isinstance(l['n'],str): e.append(f'lines[{i}].n must be a string')
    for i,c in enumerate(d.get('curveballs',[])):
        for k in ('by','en','ja','kana','reply_ja','reply_kana','reply_en'):
            if not c.get(k): e.append(f'curveballs[{i}].{k} missing')
        if c.get('by') not in ids: e.append(f'curveballs[{i}].by not a role id')
        if KANJI.search(c.get('kana','')+c.get('reply_kana','')): e.append(f'curveballs[{i}] kana contains kanji')
    for i,q in enumerate(d.get('questions',[])):
        for k in ('by','ja','kana','en','answer'):
            if not q.get(k): e.append(f'questions[{i}].{k} missing')
    for i,x in enumerate(d.get('notes',[])):
        if not (x.get('label') and x.get('text')): e.append(f'notes[{i}] needs label and text')
    allowed={'format','id','kind','page_title','eyebrow','title','subtitle','scene','level','meta','tags','created','roles','lines','curveballs','questions','notes'}
    extra=set(d)-allowed
    if extra: e.append(f'unknown top-level keys: {sorted(extra)}')
    return e
bad=0
for p in sys.argv[1:]:
    errs=check(json.load(open(p,encoding='utf-8')))
    print(('OK   ' if not errs else 'FAIL ')+p); [print('   - '+x) for x in errs]; bad+=bool(errs)
sys.exit(1 if bad else 0)

```

## Example (complete)
```json
{
 "format": "kaiwa/1",
 "id": "train-edogawa",
 "kind": "dialogue",
 "page_title": "Edogawa Densha Kaiwa",
 "eyebrow": "Kaiwa · N4 · 東京駅で",
 "title": "江戸川への電車",
 "subtitle": "Finding the train to Edogawa at Tokyo Station",
 "scene": "Five in the afternoon, Tokyo Station. A traveller with a suitcase asks a station attendant how to get to Koiwa in Edogawa ward.",
 "level": {
  "jlpt": "N4",
  "minna_max": 33,
  "focus": [
   29,
   33
  ]
 },
 "meta": "Minna L1–33, focus L29–33. Beyond L33: 乗り遅れないように (L36, staff curveball only).",
 "tags": [
  "tokyo",
  "transport"
 ],
 "created": "2026-10-09",
 "roles": [
  {
   "id": "A",
   "ja": "旅行者",
   "en": "Traveller"
  },
  {
   "id": "B",
   "ja": "駅員",
   "en": "Station staff"
  }
 ],
 "lines": [
  {
   "who": "A",
   "ja": "すみません、ちょっといいですか。",
   "kana": "すみません、ちょっといいですか。",
   "en": "Excuse me, do you have a moment?",
   "kw": "すみません・ちょっと"
  },
  {
   "who": "B",
   "ja": "はい、どうしましたか。",
   "kana": "はい、どうしましたか。",
   "en": "Yes, what's the matter?",
   "kw": "どうしました"
  },
  {
   "who": "A",
   "ja": "江戸川区の小岩へ行きたいんですが、どの電車に乗ったらいいですか。",
   "kana": "えどがわくのこいわへいきたいんですが、どのでんしゃにのったらいいですか。",
   "en": "I want to go to Koiwa in Edogawa. Which train should I take?",
   "kw": "小岩・行きたいんですが・乗ったらいい"
  },
  {
   "who": "B",
   "ja": "小岩ですね。総武線快速に乗って、錦糸町で各駅停車に乗り換えてください。",
   "kana": "こいわですね。そうぶせんかいそくにのって、きんしちょうでかくえきていしゃにのりかえてください。",
   "en": "Koiwa. Take the Sōbu Line Rapid and change to a local train at Kinshichō.",
   "kw": "総武線快速・錦糸町・各駅停車・乗り換える"
  },
  {
   "who": "A",
   "ja": "総武線快速はどこから出ますか。",
   "kana": "そうぶせんかいそくはどこからでますか。",
   "en": "Where does the Sōbu Rapid leave from?",
   "kw": "どこから・出る"
  },
  {
   "who": "B",
   "ja": "地下のホームから出ます。「総武線」と書いてある看板の方へ行ってください。",
   "kana": "ちかのホームからでます。「そうぶせん」とかいてあるかんばんのほうへいってください。",
   "en": "From the underground platform. Follow the signs that say \"Sōbu Line\".",
   "kw": "地下・と書いてある・看板の方"
  },
  {
   "who": "A",
   "ja": "地下ですね。切符はどこで買えますか。",
   "kana": "ちかですね。きっぷはどこでかえますか。",
   "en": "Underground, OK. Where can I buy a ticket?",
   "kw": "切符・買える"
  },
  {
   "who": "B",
   "ja": "ICカードを持っていますか。",
   "kana": "アイシーカードをもっていますか。",
   "en": "Do you have an IC card?",
   "kw": "ICカード・持っている"
  },
  {
   "who": "A",
   "ja": "はい、持っています。昨日チャージしておきました。",
   "kana": "はい、もっています。きのうチャージしておきました。",
   "en": "Yes. I topped it up yesterday, just in case.",
   "kw": "チャージ・しておいた"
  },
  {
   "who": "B",
   "ja": "じゃ、切符は要りません。そのまま改札を通ってください。",
   "kana": "じゃ、きっぷはいりません。そのままかいさつをとおってください。",
   "en": "Then you don't need a ticket. Just go through the gate.",
   "kw": "要らない・改札・通る"
  },
  {
   "who": "A",
   "ja": "錦糸町までどのくらいかかりますか。",
   "kana": "きんしちょうまでどのくらいかかりますか。",
   "en": "How long does it take to Kinshichō?",
   "kw": "どのくらい・かかる"
  },
  {
   "who": "B",
   "ja": "十分ぐらいです。でも、今は五時ですから、電車は混んでいるでしょう。",
   "kana": "じゅっぷんぐらいです。でも、いまはごじですから、でんしゃはこんでいるでしょう。",
   "en": "About ten minutes. But it's five o'clock now, so the train will probably be crowded.",
   "kw": "十分・混んでいる・でしょう"
  },
  {
   "who": "A",
   "ja": "そうですか。大きいスーツケースがあるんですが……。",
   "kana": "そうですか。おおきいスーツケースがあるんですが……。",
   "en": "I see. I have a big suitcase, though…",
   "kw": "スーツケース・あるんですが"
  },
  {
   "who": "B",
   "ja": "それなら、一番後ろの車両に乗ったほうがいいですよ。",
   "kana": "それなら、いちばんうしろのしゃりょうにのったほうがいいですよ。",
   "en": "In that case, you'd better get on the very last carriage.",
   "kw": "一番後ろ・車両・ほうがいい"
  },
  {
   "who": "A",
   "ja": "わかりました。錦糸町で乗り換えるとき、同じホームですか。",
   "kana": "わかりました。きんしちょうでのりかえるとき、おなじホームですか。",
   "en": "Got it. When I change at Kinshichō, is it the same platform?",
   "kw": "乗り換えるとき・同じホーム"
  },
  {
   "who": "B",
   "ja": "いいえ、違うホームかもしれません。「各駅停車」という表示を見てください。",
   "kana": "いいえ、ちがうホームかもしれません。「かくえきていしゃ」というひょうじをみてください。",
   "en": "No, it might be a different one. Look for the sign that says \"Kakueki-teisha\".",
   "kw": "違う・かもしれない・という表示"
  },
  {
   "who": "A",
   "ja": "「各駅停車」はどういう意味ですか。",
   "kana": "「かくえきていしゃ」はどういういみですか。",
   "en": "What does \"kakueki-teisha\" mean?",
   "kw": "どういう意味"
  },
  {
   "who": "B",
   "ja": "全部の駅に止まるという意味です。快速は小岩に止まりませんから、気をつけてください。",
   "kana": "ぜんぶのえきにとまるといういみです。かいそくはこいわにとまりませんから、きをつけてください。",
   "en": "It means it stops at every station. The Rapid doesn't stop at Koiwa, so be careful.",
   "kw": "全部の駅・止まる・という意味・気をつける"
  },
  {
   "who": "A",
   "ja": "よくわかりました。小岩駅から友達の家まで歩こうと思います。",
   "kana": "よくわかりました。こいわえきからともだちのいえまであるこうとおもいます。",
   "en": "That's clear. I'm thinking of walking from Koiwa station to my friend's house.",
   "kw": "友達の家まで・歩こうと思う"
  },
  {
   "who": "B",
   "ja": "遠いですか。",
   "kana": "とおいですか。",
   "en": "Is it far?",
   "kw": "遠い"
  },
  {
   "who": "A",
   "ja": "地図には十五分と書いてあります。",
   "kana": "ちずにはじゅうごふんとかいてあります。",
   "en": "The map says fifteen minutes.",
   "kw": "地図・十五分・と書いてある"
  },
  {
   "who": "B",
   "ja": "そろそろ暗くなるでしょうから、気をつけてくださいね。いってらっしゃい。",
   "kana": "そろそろくらくなるでしょうから、きをつけてくださいね。いってらっしゃい。",
   "en": "It'll be getting dark soon, so take care. Have a good trip.",
   "kw": "暗くなる・でしょう・いってらっしゃい"
  },
  {
   "who": "A",
   "ja": "ありがとうございました。",
   "kana": "ありがとうございました。",
   "en": "Thank you very much.",
   "kw": "ありがとう"
  }
 ],
 "curveballs": [
  {
   "by": "B",
   "en": "After line 05: the Sōbu Rapid has stopped because of an accident.",
   "ja": "すみません、今、総武線快速は事故で止まっています。",
   "kana": "すみません、いま、そうぶせんかいそくはじこでとまっています。",
   "reply_ja": "そうですか。じゃ、ほかの行き方はありますか。",
   "reply_kana": "そうですか。じゃ、ほかのいきかたはありますか。",
   "reply_en": "I see. Is there another way to get there?"
  },
  {
   "by": "B",
   "en": "At the gate: the IC card doesn't have enough money on it.",
   "ja": "お客さん、カードのお金が足りませんよ。あの機械でチャージしてください。",
   "kana": "おきゃくさん、カードのおかねがたりませんよ。あのきかいでチャージしてください。",
   "reply_ja": "すみません。現金でチャージできますか。",
   "reply_kana": "すみません。げんきんでチャージできますか。",
   "reply_en": "Sorry. Can I top it up with cash?"
  },
  {
   "by": "A",
   "en": "After line 04: ask the attendant to write it down.",
   "ja": "すみません、紙に書いていただけませんか。",
   "kana": "すみません、かみにかいていただけませんか。",
   "reply_ja": "はい、どうぞ。「錦糸町で乗り換え」と書きました。",
   "reply_kana": "はい、どうぞ。「きんしちょうでのりかえ」とかきました。",
   "reply_en": "Sure. I've written \"change at Kinshichō\"."
  },
  {
   "by": "A",
   "en": "At the end: ask what time the last train back is.",
   "ja": "小岩から東京までの終電は何時ですか。",
   "kana": "こいわからとうきょうまでのしゅうでんはなんじですか。",
   "reply_ja": "十二時ごろだと思います。乗り遅れないように気をつけてください。",
   "reply_kana": "じゅうにじごろだとおもいます。のりおくれないようにきをつけてください。",
   "reply_en": "Around midnight, I think. Make sure you don't miss it."
  }
 ],
 "notes": [
  {
   "label": "New words:",
   "text": "江戸川区 えどがわく Edogawa ward · 小岩 こいわ · 錦糸町 きんしちょう · 総武線 そうぶせん Sōbu Line · 快速 かいそく rapid train · 各駅停車 かくえきていしゃ local (stops everywhere) · 地下 ちか underground · 車両 しゃりょう carriage · 表示 ひょうじ sign, display · 終電 しゅうでん last train · 事故 じこ accident"
  },
  {
   "label": "Staff phrases to recognise:",
   "text": "どうしましたか what's the matter · そのまま just as you are · それなら in that case · お客さん sir/madam · いってらっしゃい have a good trip"
  },
  {
   "label": "Grammar (recent first):",
   "text": "～と書いてあります (L33) · ～という意味です (L33) · ～ようと思います (L31) · ～でしょう / ～かもしれません / ～たほうがいい (L32) · ～ておきました (L30) · 混んでいる state (L29) · ～たらいいですか / ～んですが (L26) · 買える potential (L27) · ～とき (L23)"
  },
  {
   "label": "Swap in:",
   "text": "小岩 → 葛西（かさい, Tōzai Line from 大手町 おおてまち）· スーツケース → 自転車（じてんしゃ）· 歩こう → タクシーに乗ろう"
  },
  {
   "label": "Check before you go:",
   "text": "real routes and times change; use a transit app on the day."
  }
 ]
}
```

## Change log
- 2026-10-09 kaiwa/1 defined; the five existing kaiwa converted and validated (Anki thread)
- 2026-10-13 fixed tag list for the repo library (17 tags), checked by tools/check.mjs; format unchanged
