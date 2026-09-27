// Build standard-split subgraphs (top-N entities by train degree, harness rule) as TSVs
// shared by the kge runs and the PyTorch reference.
import fs from 'node:fs';
import { parseTriplesTsv, limitSubgraph } from '/home/claude/rv/npm/packages/kge/bench/datasets/lib.mjs';
const C = '/home/claude/rv/npm/packages/kge/bench/.cache';
const [ds, nArg] = process.argv.slice(2);
const read = (s) => parseTriplesTsv(fs.readFileSync(`${C}/${ds}-${s}.txt`, 'utf8'));
let d = { train: read('train'), valid: read('valid'), test: read('test') };
const n = nArg === 'full' ? 0 : parseInt(nArg, 10);
if (n) d = limitSubgraph(d, n);
const dir = `data/${ds}-${nArg}`;
fs.mkdirSync(dir, { recursive: true });
for (const s of ['train', 'valid', 'test']) {
  const rows = d[s].map((t) => (Array.isArray(t) ? t : [t.s, t.r, t.o]).join('\t'));
  fs.writeFileSync(`${dir}/${s}.txt`, rows.join('\n') + '\n');
}
const ents = new Set(); const rels = new Set();
for (const s of ['train', 'valid', 'test']) for (const t of d[s]) { const [a, r, b] = Array.isArray(t) ? t : [t.s, t.r, t.o]; ents.add(a); ents.add(b); rels.add(r); }
console.log(dir, { train: d.train.length, valid: d.valid.length, test: d.test.length, entities: ents.size, relations: rels.size });
