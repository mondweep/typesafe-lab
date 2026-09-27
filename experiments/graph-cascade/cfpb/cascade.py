# Cascade analysis: typesafe (text) x {count prior, KGE prior} -> Jev on low-confidence items.
# Weights/temperatures and escalation thresholds are tuned on VAL; everything reported on TEST.
import json, sys, numpy as np
from stage_keys import KEY
P = sorted(set(KEY.values()))
_R={}
def rows(split):
    if split not in _R: _R[split]=[json.loads(l) for l in open(f'{split}.jsonl')]
    return _R[split]
S1 = json.load(open('stage1-typesafe.json'))['trained']
from functools import lru_cache
@lru_cache(None)
def textp(split):
    return {str(r['id']): np.array([r['probs'].get(p, 0.0) for p in P]) + 1e-6 for r in S1[split]}
def jev(split, arm='text'):
    return {str(json.loads(l)['id']): json.loads(l)['choice'] for l in open(f'jev-{split}-{arm}.jsonl')}
def prior_count(regime, alpha):
    C = json.load(open(f'counts-{regime}.json')); G = json.load(open(f'global-{regime}.json'))
    g = np.array([G.get(p, 1e-4) for p in P])
    def f(company):
        c = C.get(company)
        v = np.array([c.get(p, 0) for p in P]) if c else np.zeros(len(P))
        return (v + alpha * g) / (v.sum() + alpha)
    return f
def prior_kge(regime, T):
    K = json.load(open(f'kge-scores-{regime}.json')); G = json.load(open(f'global-{regime}.json'))
    g = np.array([G.get(p, 1e-4) for p in P])
    def f(company):
        s = K.get(company)
        if not s: return g / g.sum()
        v = np.array([s.get(p, min(s.values())) for p in P]) / T
        e = np.exp(v - v.max()); return e / e.sum()
    return f
def combine(split, priors, ws):
    out = {}
    for r in rows(split):
        i = str(r['id']); lp = np.log(textp(split)[i])
        for pr, w in zip(priors, ws): lp = lp + w * np.log(pr(r['company']) + 1e-9)
        p = np.exp(lp - lp.max()); out[i] = p / p.sum()
    return out
def acc(split, probs):
    g = {str(r['id']): KEY[r['product']] for r in rows(split)}
    return np.mean([P[int(np.argmax(probs[i]))] == g[i] for i in probs])
def cascade(split, probs, thr, jv):
    g = {str(r['id']): KEY[r['product']] for r in rows(split)}
    ok = esc = 0
    for i, p in probs.items():
        if p.max() < thr: esc += 1; ok += jv[i] == g[i]
        else: ok += P[int(np.argmax(p))] == g[i]
    return ok / len(probs), esc / len(probs)
def tune(priorfns, grids):
    # grid over each prior's hyperparameter and weight, maximise val local accuracy
    best = (-1, None)
    import itertools
    for combo in itertools.product(*grids):
        prs = [fn(h) for fn, (h, w) in zip(priorfns, combo)]; ws = [w for h, w in combo]
        a = acc('val', combine('val', prs, ws))
        if a > best[0]: best = (a, combo)
    return best
if __name__ == '__main__':
    regime = sys.argv[1]
    jv_val, jv_test = jev('val'), jev('test')
    cgrid = [(a, w) for a in (0.5, 1, 5, 20, 100) for w in (0.25, 0.5, 1.0, 1.5, 2.0)]
    kgrid = [(T, w) for T in (0.02, 0.05, 0.1, 0.25, 0.5, 1, 2) for w in (0.25, 0.5, 1.0, 1.5, 2.0)]
    arms = {'text only': ([], [])}
    b = tune([lambda a: prior_count(regime, a)], [cgrid]); arms['text x count prior'] = ([prior_count(regime, b[1][0][0])], [b[1][0][1]]); print('count tuned', b)
    b = tune([lambda T: prior_kge(regime, T)], [kgrid]); arms['text x KGE prior'] = ([prior_kge(regime, b[1][0][0])], [b[1][0][1]]); print('kge tuned', b)
    b = tune([lambda a: prior_count(regime, a), lambda T: prior_kge(regime, T)], [cgrid, kgrid])
    arms['text x count x KGE'] = ([prior_count(regime, b[1][0][0]), prior_kge(regime, b[1][1][0])], [b[1][0][1], b[1][1][1]]); print('both tuned', b)
    res = {}
    for name, (prs, ws) in arms.items():
        pv, pt = combine('val', prs, ws), combine('test', prs, ws)
        line = {'local_acc': round(acc('test', pt), 3), 'frontier': []}
        for share in (0.1, 0.2, 0.3, 0.4, 0.5):
            thr = np.quantile([p.max() for p in pv.values()], share)
            a, e = cascade('test', pt, thr, jv_test); line['frontier'].append((share, round(e, 3), round(a, 3)))
        res[name] = line; print(regime, name, line)
    json.dump(res, open(f'cascade-{regime}.json', 'w'))
