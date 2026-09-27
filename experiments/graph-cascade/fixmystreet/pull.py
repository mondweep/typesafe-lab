import json, time, urllib.request, datetime as dt
out=open('reports.jsonl','a'); seen=set()
start=dt.datetime(2026,8,1); end=dt.datetime(2026,9,26)
t=start; step=dt.timedelta(hours=4); n=0
while t<end:
    u=f"https://www.fixmystreet.com/open311/v2/requests.json?jurisdiction_id=fixmystreet.com&start_date={t:%Y-%m-%dT%H:%M:%SZ}&end_date={(t+step):%Y-%m-%dT%H:%M:%SZ}&max_requests=1000"
    for a in range(4):
        try:
            d=json.load(urllib.request.urlopen(urllib.request.Request(u,headers={'User-Agent':'research-eval'}),timeout=120))['service_requests']; break
        except Exception as e: time.sleep(10); d=[]
    if len(d)>=1000: print('cap hit',t,flush=True)
    for r in d:
        if r['service_request_id'] in seen: continue
        seen.add(r['service_request_id'])
        out.write(json.dumps({k:r.get(k) for k in ('service_request_id','requested_datetime','service_code','title','detail','agency_responsible','lat','long','status')})+'\n'); n+=1
    out.flush(); t+=step; time.sleep(2)
print('done',n,flush=True)
