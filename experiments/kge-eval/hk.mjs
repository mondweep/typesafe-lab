import fs from 'node:fs'; import { createRequire } from 'node:module';
const { loadKge } = createRequire(import.meta.url)('@ruvector/kge');
const dir='data/wn18rr-3000'; const read=(s)=>fs.readFileSync(`${dir}/${s}.txt`,'utf8').trim().split('\n').map(l=>l.split('\t'));
const all=[...read('train'),...read('valid'),...read('test')]; const known=new Map();
for(const [s,r,o] of all){const k=`${s}|${r}`;(known.get(k)??known.set(k,new Set()).get(k)).add(o);}
const kge=loadKge(JSON.parse(fs.readFileSync('wn3000-model.json','utf8')));
const res={};
for(const [s,r,o] of read('test')){ if(r!=='_hypernym')continue; const others=known.get(`${s}|${r}`);
 const c=kge.predict({s,r,k:Math.min(1000,500+others.size),useIndex:false}).candidates.map(c=>c.entity).filter(e=>e===o||!others.has(e));
 const rank=c.indexOf(o); for(const K of [10,50,200,500]) res[K]=(res[K]??0)+(rank>=0&&rank<K?1:0); res.n=(res.n??0)+1;}
console.log(JSON.stringify(res));
// how many test hypernym heads have ANY hypernym in train?
