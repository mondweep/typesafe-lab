# Compare count-aware KGE variants against counts in the 1%-history regime (tuned on val, reported on test).
import json, itertools, numpy as np
import cascade as C
reg = 'sparse'
G = json.load(open('global-sparse.json')); g = np.array([G.get(p, 1e-4) for p in C.P])
def kge_prior(fname, combo=None):
    K = json.load(open(fname))
    def make(T, beta=0.0, gamma=0.0):
        def f(company):
            s = K.get(company)
            if not s: return g / g.sum()
            if combo:
                def vec(rel):
                    d = s.get(rel) or {}; lo = min(d.values()) if d else 0.0
                    return np.array([d.get(p, lo) for p in C.P])
                v = vec('hasProduct_mostly') + beta * vec('hasProduct_sometimes') + gamma * vec('hasProduct_rarely')
            else:
                v = np.array([s.get(p, min(s.values())) for p in C.P])
            v = v / T; e = np.exp(v - v.max()); return e / e.sum()
        return f
    return make
def best(make, grid):
    top = (-1, None)
    for hp in grid:
        prs = [make(*hp[:-1])]; w = hp[-1]
        a = C.acc('val', C.combine('val', prs, [w]))
        if a > top[0]: top = (a, hp)
    return top
Ts = (0.02, 0.05, 0.1, 0.25, 0.5, 1, 2); Ws = (0.25, 0.5, 1.0, 1.5, 2.0)
arms = {
    'KGE, original (binary facts)': (kge_prior('kge-scores-sparse.json'), [(T, w) for T in Ts for w in Ws]),
    'KGE, A: facts repeated by count': (kge_prior('kge-scores-sparse-rep.json'), [(T, w) for T in Ts for w in Ws]),
    'KGE, B: frequency bands': (kge_prior('kge-scores-sparse-band.json', combo=True), [(T, b, c, w) for T in Ts for b in (0, 0.5, 1) for c in (0, 0.25) for w in Ws]),
}
res = {}
gold = {str(r['id']): C.KEY[r['product']] for r in C.rows('test')}
cp = C.prior_count(reg, 0.5); pc = C.combine('test', [cp], [0.5]); count_ok = np.array([C.P[int(np.argmax(pc[i]))] == gold[i] for i in gold])
res['counts'] = {'val': None, 'test': round(float(count_ok.mean()), 4)}
for name, (make, grid) in arms.items():
    va, hp = best(make, grid)
    pt = C.combine('test', [make(*hp[:-1])], [hp[-1]])
    ok = np.array([C.P[int(np.argmax(pt[i]))] == gold[i] for i in gold])
    # both: counts x this KGE, weights tuned on val
    b2 = max(((wc, wk) for wc in (0.25, 0.5, 1.0) for wk in (0, 0.1, 0.25, 0.5)), key=lambda z: C.acc('val', C.combine('val', [cp, make(*hp[:-1])], list(z))))
    pb = C.combine('test', [cp, make(*hp[:-1])], list(b2)); okb = np.array([C.P[int(np.argmax(pb[i]))] == gold[i] for i in gold])
    res[name] = {'val': round(va, 4), 'test': round(float(ok.mean()), 4), 'hp': hp, 'with_counts_test': round(float(okb.mean()), 4), 'with_counts_w': b2,
                 'vs_counts_fixes': int((~count_ok & okb).sum()), 'vs_counts_breaks': int((count_ok & ~okb).sum())}
    print(name, res[name])
print('counts', res['counts'])
json.dump(res, open('kge-v2-results.json', 'w'), indent=1)
