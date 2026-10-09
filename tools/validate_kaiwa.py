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
