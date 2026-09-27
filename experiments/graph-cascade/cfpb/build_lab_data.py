# Build lab/data/graph-cascade-v1.json from the offline CFPB and FixMyStreet runs.
import json, sys, numpy as np, importlib
sys.path.insert(0, '/home/claude/cfpb')
import os
os.chdir('/home/claude/cfpb')
import cascade as C
SH = [round(x, 2) for x in np.arange(0, 0.61, 0.05)]
LABEL = {v: k for k, v in C.KEY.items()}
def top3(p, keys): i = np.argsort(-p)[:3]; return [[keys[j], round(float(p[j]), 3)] for j in i]
def frontier(split_probs_val, split_probs_test, jv, gold):
    out = []
    vc = [p.max() for p in split_probs_val.values()]
    for s in SH:
        thr = -1 if s == 0 else np.quantile(vc, s); ok = esc = 0
        for i, p in split_probs_test.items():
            if p.max() < thr: esc += 1; ok += jv[i] == gold[i]
            else: ok += C.P[int(np.argmax(p))] == gold[i]
        out.append({'target': s, 'sent': round(esc / len(gold), 3), 'acc': round(ok / len(gold), 4)})
    return out
reg = 'full'
arms = {'text': ([], []), 'count': ([C.prior_count(reg, 0.5)], [1.5]), 'kge': ([C.prior_kge(reg, 1)], [1.5]),
        'both': ([C.prior_count(reg, 0.5), C.prior_kge(reg, 0.25)], [1.5, 0.25])}
gold = {str(r['id']): C.KEY[r['product']] for r in C.rows('test')}
jt, jc = C.jev('test', 'text'), C.jev('test', 'company')
cf = {'dataset': 'CFPB Consumer Complaint Database (narratives archive, Mar-Jul 2026)', 'n_test': 600, 'n_val': 400, 'n_train_text': 3300,
      'history_rows': 2473972, 'labels': {k: LABEL[k] for k in C.P}, 'arms': {}, 'jev': {}, 'items': []}
probs = {}
for a, (prs, ws) in arms.items():
    pv, pt = C.combine('val', prs, ws), C.combine('test', prs, ws); probs[a] = pt
    cf['arms'][a] = {'local_acc': round(float(C.acc('test', pt)), 4), 'frontier': frontier(pv, pt, jt, gold)}
cf['jev'] = {'text': round(np.mean([jt[i] == gold[i] for i in gold]), 4), 'company': round(np.mean([jc[i] == gold[i] for i in gold]), 4), 'text_x_count': 0.747,
             'mean_tokens': round(np.mean([json.loads(l)['tokens'] for l in open('jev-test-text.jsonl')]))}
cf['sparse'] = json.load(open('cascade-sparse.json')) if os.path.exists('cascade-sparse.json') else None
cf['significance'] = {'count_vs_both_local': {'fixes': 8, 'breaks': 5, 'p': 0.581, 'diff': 0.005, 'ci95': [-0.007, 0.017]}}
cf['cost'] = {'kge_train_min_full': 88.3, 'kge_train_min_sparse': 12, 'kge_entities_full': 2257, 'kge_triples_full': 21628, 'kge_predict_p50_ms': 2.91}
rng = np.random.default_rng(5); ids = list(gold); pick = set(rng.choice(ids, 80, replace=False))
cp, kp = C.prior_count(reg, 0.5), C.prior_kge(reg, 1)
for r in C.rows('test'):
    i = str(r['id'])
    if i not in pick: continue
    cf['items'].append({'id': i, 'company': r['company'], 'text': r['text'][:700], 'gold': gold[i],
                        'typesafe': top3(C.textp('test')[i], C.P), 'count_prior': top3(cp(r['company']), C.P), 'kge_prior': top3(kp(r['company']), C.P),
                        'with_count': top3(probs['count'][i], C.P), 'with_both': top3(probs['both'][i], C.P), 'jev_text': jt[i], 'jev_company': jc[i]})
comp = {}
K = json.load(open('kge-scores-full.json')); CT = json.load(open('counts-full.json'))
for c in K:
    n = CT.get(c, {}); tot = sum(n.values())
    if tot < 1: continue
    comp[c] = {'n': tot, 'count': {p: round(n.get(p, 0) / tot, 4) for p in C.P}, 'kge': {p: round(float(v), 4) for p, v in zip(C.P, kp(c))}}
cf['companies'] = comp
# ---- FixMyStreet ----
os.chdir('/home/claude/fms')
src = open('cascade_fms.py').read().split('res = {}')[0]
ns = {}; exec(src, ns)
F = {'dataset': 'FixMyStreet reports via Open311 API (1 Aug - 25 Sep 2026)', 'n_test': 300, 'n_val': 200, 'history_rows': 108719, 'councils': 409, 'categories': 4814, 'arms': {}, 'jev': {}, 'items': []}
cfgs = json.load(open('cascade-fms.json'))
Jt = ns['J']['test']
for a, key in [('text', 'text only'), ('count', 'text x count prior'), ('kge', 'text x KGE prior'), ('both', 'text x count x KGE')]:
    cfg = tuple(cfgs[key]['cfg']); vc = ns['run']('val', cfg)[2]; fr = []
    for s in SH:
        acc_, e, _ = ns['run']('test', cfg, -1 if s == 0 else np.quantile(vc, s)); fr.append({'target': s, 'sent': round(e, 3), 'acc': round(acc_, 4)})
    F['arms'][a] = {'local_acc': cfgs[key]['local_acc'], 'frontier': fr, 'cfg': cfg}
F['jev'] = {'text': 0.6967, 'text_x_count': 0.743, 'mean_tokens': round(np.mean([json.loads(l)['tokens'] for l in open('jev-test.jsonl')]))}
F['cost'] = {'kge_train_min': 51.7, 'kge_entities': 5733, 'kge_triples': 9628, 'kge_epochs': 10}
R = ns['R']['test']; pick = set(np.random.default_rng(6).choice([r['id'] for r in R], 60, replace=False))
cc, bc = tuple(cfgs['text x count prior']['cfg']), tuple(cfgs['text x count x KGE']['cfg'])
for r in R:
    if r['id'] not in pick: continue
    ks, p0 = ns['dist']('test', r, 1, 0, 1, 0); _, p1 = ns['dist']('test', r, *cc); _, pk = ns['dist']('test', r, *tuple(cfgs['text x KGE prior']['cfg']))
    n = np.array([ns['C'][r['council']][k] for k in ks], float)
    F['items'].append({'id': r['id'], 'council': r['council'], 'text': ((r.get('title') or '') + '. ' + r['text'])[:600], 'gold': r['service_code'], 'n_options': len(ks),
                       'typesafe': top3(p0, ks), 'count_prior': top3(n / n.sum(), ks), 'with_count': top3(p1, ks), 'with_kge': top3(pk, ks), 'jev_text': Jt[r['id']]})
out = {'generated': '2026-09-27', 'cfpb': cf, 'fms': F, 'shares': SH}
json.dump(out, open('/home/claude/lab/lab/data/graph-cascade-v1.json', 'w'))
print('ok', len(json.dumps(out)) // 1024, 'KiB', {k: v['local_acc'] for k, v in cf['arms'].items()}, {k: v['local_acc'] for k, v in F['arms'].items()})
