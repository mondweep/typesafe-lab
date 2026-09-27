# FixMyStreet: council-specific category routing. history < VAL_START; val/test later windows.
import pandas as pd, json, sys, numpy as np
VAL_START, TEST_START, END = sys.argv[1:4]
d = pd.read_json('reports.jsonl', lines=True, dtype={'service_request_id': str})
def first(a):
    r = (a or {}).get('recipient') or []
    return r[0] if len(r) == 1 else None
d['council'] = d.agency_responsible.map(first)
d = d[d.council.notna() & d.detail.fillna('').str.len().gt(20) & d.service_code.notna()].copy()
d['date'] = d.requested_datetime.str[:10]
d['text'] = d.detail.str.replace(r'\s+', ' ', regex=True).str.slice(0, 2000)
h = d[d.date < VAL_START]
cand = h.groupby('council').service_code.value_counts()
C = {c: g.droplevel(0).to_dict() for c, g in cand.groupby(level=0)}
def ok(r): return r.council in C and len(C[r.council]) >= 2
va = d[(d.date >= VAL_START) & (d.date < TEST_START)]; te = d[(d.date >= TEST_START) & (d.date < END)]
va = va[va.apply(ok, axis=1)].sample(200, random_state=1); te = te[te.apply(ok, axis=1)].sample(300, random_state=2)
for name, x in [('val', va), ('test', te)]:
    seen = x.apply(lambda r: r.service_code in C[r.council], axis=1).mean()
    ncand = x.council.map(lambda c: len(C[c]))
    print(name, len(x), 'gold in council history', round(seen, 3), 'candidates median', ncand.median(), 'max', ncand.max())
    x.rename(columns={'service_request_id': 'id'})[['id', 'date', 'council', 'service_code', 'title', 'text']].to_json(f'{name}.jsonl', orient='records', lines=True)
json.dump(C, open('counts.json', 'w'))
# KGE graph: council -offers-> category (n>=1), category -sameName-> normalised name (lets councils share structure)
import re
norm = lambda s: re.sub(r'[^a-z ]', '', s.lower().replace('-', ' ')).split()[0] if re.sub(r'[^a-z ]', '', s.lower().replace('-', ' ')).split() else 'x'
trip = []
for c, cats in C.items():
    for k, n in cats.items():
        trip.append((f'C:{c}', 'offers', f'K:{c}|{k}')); trip.append((f'K:{c}|{k}', 'hasKeyword', f'W:{norm(k)}'))
pd.DataFrame(trip).drop_duplicates().to_csv('graph.tsv', sep='\t', header=False, index=False)
print('history', len(h), 'councils', len(C), 'triples', len(set(trip)), 'categories', sum(len(v) for v in C.values()))
