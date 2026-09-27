import json,sys,numpy as np, pandas as pd
import cascade as C
regime=sys.argv[1]
cfg={'sparse':((0.5,0.5),(0.25,0.25))}[regime] if len(sys.argv)<3 else json.loads(sys.argv[2])
h=pd.read_parquet('history.parquet'); 
hs=h if regime=='full' else h.sample(frac=0.01,random_state=7)
cnt=hs.company.value_counts()
arms={'text':([],[]),'count':([C.prior_count(regime,cfg[0][0])],[cfg[0][1]]),'kge':([C.prior_kge(regime,cfg[1][0])],[cfg[1][1]])}
rows=C.rows('test'); g={str(r['id']):C.KEY[r['product']] for r in rows}
buck=lambda n: 'unseen' if n==0 else ('1-5' if n<=5 else ('6-50' if n<=50 else '>50'))
b={str(r['id']):buck(cnt.get(r['company'],0)) for r in rows}
jc={}
try: jc=C.jev('test','company')
except Exception: pass
jt=C.jev('test','text')
out={}
for name,(prs,ws) in arms.items():
    p=C.combine('test',prs,ws)
    for k in ['unseen','1-5','6-50','>50']:
        ids=[i for i in p if b[i]==k]
        out.setdefault(k,{'n':len(ids)})[name]=round(np.mean([C.P[int(np.argmax(p[i]))]==g[i] for i in ids]),3) if ids else None
for k in out:
    ids=[i for i in g if b[i]==k]
    out[k]['jev_text']=round(np.mean([jt[i]==g[i] for i in ids]),3)
    if len(jc)==len(g): out[k]['jev_company']=round(np.mean([jc[i]==g[i] for i in ids]),3)
print(regime,json.dumps(out))
