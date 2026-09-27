// Composition test: does RotatE compose(parentOf, parentOf) find grandchildren,
// and does HolE refuse? Synthetic family forest, exact answers known.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { createKge } = require('@ruvector/kge');

// 20 families x 4 generations, branching 2 => 15 people per family, 300 entities.
const triples = []; const parent = new Map();
let id = 0; const fams = [];
for (let f = 0; f < 20; f++) {
  const gens = [[`p${id++}`]];
  for (let g = 1; g < 4; g++) {
    const next = [];
    for (const p of gens[g - 1]) for (let k = 0; k < 2; k++) { const c = `p${id++}`; next.push(c); triples.push({ s: p, r: 'parentOf', o: c }); (parent.get(p) ?? parent.set(p, []).get(p)).push(c); }
    gens.push(next);
  }
  // same-family marker so the space has some structure
  for (const gen of gens) for (const p of gen) triples.push({ s: p, r: 'inFamily', o: `fam${f}` });
  fams.push(gens);
}
const grandkids = (p) => (parent.get(p) ?? []).flatMap((c) => parent.get(c) ?? []);
const queries = fams.flatMap((g) => [...g[0], ...g[1]]); // people with grandchildren

function score(kge, fn) {
  let hits = 0, total = 0, rr = 0;
  for (const q of queries) {
    const gold = new Set(grandkids(q)); const res = fn(q);
    if (res.error) return { error: res.error };
    const top = res.candidates.slice(0, gold.size).map((c) => c.entity);
    hits += top.filter((e) => gold.has(e)).length; total += gold.size;
    const first = res.candidates.findIndex((c) => gold.has(c.entity));
    rr += first >= 0 ? 1 / (first + 1) : 0;
  }
  return { precisionAtGold: +(hits / total).toFixed(3), mrrFirstGold: +(rr / queries.length).toFixed(3) };
}

for (const scorer of ['rotate', 'hole']) {
  const kge = createKge({ scorer, dims: 64, seed: 1 });
  kge.addTriples(triples);
  const t0 = performance.now();
  await kge.train({ epochs: 60, lr: 0.1 });
  const trainS = ((performance.now() - t0) / 1000).toFixed(1);
  let comp;
  try { comp = score(kge, (q) => kge.compose({ r1: 'parentOf', r2: 'parentOf', s: q, k: 50 })); } catch (e) { comp = { error: `${e.kind}: ${e.message}` }; }
  const oneHop = score(kge, (q) => { const r = kge.predict({ s: q, r: 'parentOf', k: 50 }); return r; });
  console.log(JSON.stringify({ scorer, entities: kge.stats().entities, triples: triples.length, trainS, compose2hop: comp, predictParentOf_vs_grandkids_control: oneHop }));
}
