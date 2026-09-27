# Build the company graph (triples) and count priors from history, for two regimes:
#   full  = all complaints Mar-Jun 2026 (2.47M rows, no text needed)
#   sparse = a 1% random sample of that history (a small organisation's ticket log)
import pandas as pd, json, numpy as np
from stage_keys import KEY
h = pd.read_parquet('history.parquet')
test = pd.read_json('test.jsonl', lines=True, dtype={'id': str}); val = pd.read_json('val.jsonl', lines=True, dtype={'id': str})
keep = set(test.company) | set(val.company)
for regime, frac in [('full', 1.0), ('sparse', 0.01)]:
    d = h if frac == 1.0 else h.sample(frac=frac, random_state=7)
    d = d.assign(p=d['product'].map(KEY))
    trip = []
    def edges(col, rel, minc):
        g = d.dropna(subset=[col]).groupby(['company', col]).size()
        return [(c, rel, f'{rel}:{v}' if rel != 'hasProduct' else f'P:{v}', n) for (c, v), n in g.items() if n >= minc]
    minc = 2 if frac == 1.0 else 1
    for col, rel in [('p', 'hasProduct'), ('issue', 'hasIssue'), ('subproduct', 'hasSubproduct'), ('response', 'respondsWith')]:
        trip += edges(col, rel, minc)
    # schema edges: issue/subproduct -> product (from the same history)
    for col, rel in [('issue', 'hasIssue'), ('subproduct', 'hasSubproduct')]:
        g = d.dropna(subset=[col]).groupby([col, 'p']).size()
        trip += [(f'{rel}:{v}', 'belongsTo', f'P:{p}', n) for (v, p), n in g.items() if n >= minc]
    t = pd.DataFrame(trip, columns=['s', 'r', 'o', 'n'])
    t[['s', 'r', 'o']].to_csv(f'graph-{regime}.tsv', sep='\t', header=False, index=False)
    ents = set(t.s) | set(t.o)
    # count prior table: company -> product counts
    cp = d.groupby(['company', 'p']).size().unstack(fill_value=0)
    cp.to_json(f'counts-{regime}.json', orient='index')
    glob = d['p'].value_counts(normalize=True).to_dict()
    json.dump(glob, open(f'global-{regime}.json', 'w'))
    cc = d.company.value_counts()
    print(regime, 'rows', len(d), 'triples', len(t), t.r.value_counts().to_dict(), 'entities', len(ents),
          'test companies in graph', round(test.company.isin(set(t.s)).mean(), 3),
          'test company history<=5', round((test.company.map(cc).fillna(0) <= 5).mean(), 3))
