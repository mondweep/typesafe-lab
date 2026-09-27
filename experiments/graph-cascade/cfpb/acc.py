import json,sys
from stage_keys import KEY
def load(f): return {r['id']:r for r in map(json.loads,open(f))}
def gold(split): return {str(r['id']):KEY[r['product']] for r in map(json.loads,open(split+'.jsonl'))}
if __name__=='__main__':
    split,f=sys.argv[1],sys.argv[2]; g=gold(split); p=load(f)
    ok=sum(p[i]['choice']==g[str(i)] for i in p); print(f,len(p),round(ok/len(p),3),'mean tokens',round(sum(p[i]['tokens'] for i in p)/len(p)))
