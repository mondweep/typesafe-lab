import fs from 'node:fs'; import { createRequire } from 'node:module';
const { createKge } = createRequire('/home/claude/kge/package.json')('@ruvector/kge');
const epochs=+process.argv[2];
const triples=fs.readFileSync('graph.tsv','utf8').trim().split('\n').map(l=>{const [s,r,o]=l.split('\t');return {s,r,o};});
const kge=createKge({scorer:'hole',dims:128,seed:42}); kge.addTriples(triples);
const t0=performance.now(); const rep=await kge.train({epochs,lr:0.1,n3_lambda:0.05,seed:7});
const read=f=>fs.readFileSync(f,'utf8').trim().split('\n').map(l=>JSON.parse(l));
const C=JSON.parse(fs.readFileSync('counts.json','utf8')); const out={};
for (const c of new Set([...read('val.jsonl'),...read('test.jsonl')].map(r=>r.council))) {
  const res=kge.predict({s:`C:${c}`,r:'offers',k:Math.min(1000,kge.stats().entities),useIndex:false});
  const sc={}; for (const x of res.candidates) if (x.entity.startsWith(`K:${c}|`)) sc[x.entity.slice(3+c.length)]=x.score;
  const lo=Math.min(...Object.values(sc)); for (const k of Object.keys(C[c])) if (!(k in sc)) sc[k]=lo-1;
  out[c]=sc; }
fs.writeFileSync('kge-scores.json',JSON.stringify(out));
console.log(JSON.stringify({epochs,entities:kge.stats().entities,triples:triples.length,trainMin:+((performance.now()-t0)/60000).toFixed(1),loss:rep.loss}));
