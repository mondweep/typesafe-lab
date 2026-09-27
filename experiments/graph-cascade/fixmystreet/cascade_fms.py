# FixMyStreet cascade: typesafe zero-shot x {count prior, KGE prior} -> Jev. Tuned on val, reported on test.
import json, numpy as np, itertools
R = {s: [json.loads(l) for l in open(f'{s}.jsonl')] for s in ('val', 'test')}
C = json.load(open('counts.json')); K = json.load(open('kge-scores.json'))
S1 = {s: {x['id']: x for x in v} for s, v in json.load(open('stage1-typesafe.json')).items()}
J = {s: {json.loads(l)['id']: json.loads(l)['choice'] for l in open(f'jev-{s}.jsonl')} for s in ('val', 'test')}
def cands(c): return sorted(C[c], key=lambda k: -C[c][k])[:80]
def dist(split, r, alpha, wc, T, wk):
    ks = cands(r['council']); t = S1[split][r['id']]['probs']
    lp = np.log(np.array([t.get(k, 0) for k in ks]) + 1e-6)
    if wc:
        n = np.array([C[r['council']][k] for k in ks], float); lp += wc * np.log((n + alpha / len(ks)) / (n.sum() + alpha))
    if wk:
        s = np.array([K[r['council']].get(k, -1e3) for k in ks]) / T; s = s - s.max(); lp += wk * (s - np.log(np.exp(s).sum()))
    p = np.exp(lp - lp.max()); return ks, p / p.sum()
def run(split, cfg, thr=None):
    ok = esc = 0; confs = []
    for r in R[split]:
        ks, p = dist(split, r, *cfg); confs.append(p.max())
        if thr is not None and p.max() < thr: esc += 1; ok += J[split][r['id']] == r['service_code']
        else: ok += ks[int(p.argmax())] == r['service_code']
    return ok / len(R[split]), esc / len(R[split]), confs
grids = {'text only': [(1, 0, 1, 0)],
         'text x count prior': [(a, w, 1, 0) for a in (0.5, 1, 5, 20) for w in (0.01, 0.02, 0.05, 0.1, 0.25, 0.5, 1)],
         'text x KGE prior': [(1, 0, T, w) for T in (0.05, 0.1, 0.25, 0.5, 1, 2) for w in (0.01, 0.02, 0.05, 0.1, 0.25, 0.5, 1)],
         'text x count x KGE': [(a, w, T, v) for a in (1, 5, 20) for w in (0.01, 0.02, 0.05, 0.1) for T in (0.5, 1, 2) for v in (0.01, 0.02, 0.05, 0.1)]}
res = {}
for name, g in grids.items():
    cfg = max(g, key=lambda c: run('val', c)[0])
    line = {'cfg': cfg, 'local_acc': round(run('test', cfg)[0], 3), 'frontier': []}
    vc = run('val', cfg)[2]
    for share in (0.1, 0.2, 0.3, 0.4, 0.5):
        a, e, _ = run('test', cfg, np.quantile(vc, share)); line['frontier'].append((share, round(e, 3), round(a, 3)))
    res[name] = line; print(name, line)
json.dump(res, open('cascade-fms.json', 'w'))
