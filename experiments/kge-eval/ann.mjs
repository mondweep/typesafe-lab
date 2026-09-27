import fs from 'node:fs'; import { createRequire } from 'node:module';
const { loadKge } = createRequire(import.meta.url)('@ruvector/kge');
const dir='data/wn18rr-3000'; const read=(s)=>fs.readFileSync(`${dir}/${s}.txt`,'utf8').trim().split('\n').map(l=>l.split('\t'));
const kge=loadKge(JSON.parse(fs.readFileSync('wn3000-model.json','utf8')));
const qs=[...read('test'),...read('valid')];
const pct=(a,p)=>{a=[...a].sort((x,y)=>x-y);return +a[Math.floor(p*(a.length-1))].toFixed(3)};
const ex=[],exT=[]; for(const [s,r] of qs){const t=performance.now();ex.push(kge.predict({s,r,k:10,useIndex:false}).candidates.map(c=>c.entity));exT.push(performance.now()-t);}
const b0=performance.now(); kge.buildIndex(); const buildMs=performance.now()-b0;
let rec=0; const annT=[]; let flags;
qs.forEach(([s,r],i)=>{const t=performance.now();const res=kge.predict({s,r,k:10});annT.push(performance.now()-t);flags={exact:res.exact,ann:res.ann};const set=new Set(ex[i]);rec+=res.candidates.filter(c=>set.has(c.entity)).length/10;});
console.log(JSON.stringify({backend:process.env.KGE_BACKEND??'native',entities:kge.stats().entities,queries:qs.length,buildMs:Math.round(buildMs),annRecall10:+(rec/qs.length).toFixed(3),flags,exactMs:{p50:pct(exT,.5),p95:pct(exT,.95)},annMs:{p50:pct(annT,.5),p95:pct(annT,.95)}}));
