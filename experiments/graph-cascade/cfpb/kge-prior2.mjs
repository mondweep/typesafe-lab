// Train @ruvector/kge on a company graph and export product scores for val/test companies.
// usage: node kge-prior.mjs <regime> <epochs> [dims] [n3]
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire('/home/claude/kge/package.json');
const { createKge } = require('@ruvector/kge');
const [regime, epochsArg, dimsArg = '128', n3Arg = '0.05'] = process.argv.slice(2);
const epochs = +epochsArg, dims = +dimsArg, n3 = +n3Arg;
const triples = fs.readFileSync(`graph-${regime}.tsv`, 'utf8').trim().split('\n').map((l) => { const [s, r, o] = l.split('\t'); return { s, r, o }; });
const kge = createKge({ scorer: 'hole', dims, seed: 42 });
kge.addTriples(triples);
const products = [...new Set(triples.filter((t) => t.r.startsWith('hasProduct') || t.r === 'belongsTo').map((t) => t.o))];
const t0 = performance.now();
const rep = await kge.train({ epochs, lr: 0.1, n3_lambda: n3, seed: 7 });
const trainMin = (performance.now() - t0) / 60000;
const read = (f) => fs.readFileSync(f, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const companies = [...new Set([...read('val.jsonl'), ...read('test.jsonl')].map((r) => r.company))];
const known = new Set(triples.map((t) => t.s));
const out = {}; const lat = [];
const rels = (process.env.RELS || 'hasProduct').split(',');
for (const c of companies) {
  if (!known.has(c)) continue;
  const q0 = performance.now(); const all = {};
  for (const rel of rels) {
    let res; try { res = kge.predict({ s: c, r: rel, k: Math.min(1000, kge.stats().entities), useIndex: false }); } catch { continue; }
    const sc = {}; for (const cand of res.candidates) if (products.includes(cand.entity)) sc[cand.entity.slice(2)] = cand.score;
    all[rel] = sc;
  }
  lat.push(performance.now() - q0);
  out[c] = rels.length === 1 ? all[rels[0]] : all;
}
lat.sort((a, b) => a - b);
fs.writeFileSync(`kge-scores-${regime}.json`, JSON.stringify(out));
console.log(JSON.stringify({ regime, dims, epochs, n3, entities: kge.stats().entities, triples: triples.length, trainMin: +trainMin.toFixed(1), loss: rep.loss, companiesScored: Object.keys(out).length, predictP50ms: +lat[Math.floor(lat.length / 2)].toFixed(2) }));
