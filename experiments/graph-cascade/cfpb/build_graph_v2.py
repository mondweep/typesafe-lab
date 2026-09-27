# Count-aware graph variants for the 1%-history regime (same sample as build_graph.py).
import pandas as pd, numpy as np
from stage_keys import KEY
h = pd.read_parquet('history.parquet'); d = h.sample(frac=0.01, random_state=7).assign(p=lambda x: x['product'].map(KEY))
def agg(col): return d.dropna(subset=[col]).groupby(['company', col]).size()
rels = [('p', 'hasProduct', 'P:'), ('issue', 'hasIssue', 'hasIssue:'), ('subproduct', 'hasSubproduct', 'hasSubproduct:'), ('response', 'respondsWith', 'respondsWith:')]
schema = []
for col, rel in [('issue', 'hasIssue'), ('subproduct', 'hasSubproduct')]:
    g = d.dropna(subset=[col]).groupby([col, 'p']).size()
    schema += [(f'{rel}:{v}', 'belongsTo', f'P:{p}') for (v, p), n in g.items()]
# A: repeat each fact 1+floor(log2 n) times
rep = list(schema)
for col, rel, pre in rels:
    for (c, v), n in agg(col).items(): rep += [(c, rel, pre + str(v))] * (1 + int(np.log2(n)))
# B: frequency bands by the company's share of complaints
band = list(schema); tot = d.company.value_counts()
for col, rel, pre in rels:
    for (c, v), n in agg(col).items():
        s = n / tot[c]; b = 'mostly' if s >= 0.5 else ('sometimes' if s >= 0.1 else 'rarely')
        band.append((c, f'{rel}_{b}', pre + str(v)))
for name, t in [('sparse-rep', rep), ('sparse-band', band)]:
    pd.DataFrame(t).to_csv(f'graph-{name}.tsv', sep='\t', header=False, index=False)
    print(name, 'triples', len(t))
