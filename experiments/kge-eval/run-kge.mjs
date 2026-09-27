// Train + evaluate @ruvector/kge on a prepared dataset directory.
// usage: node run-kge.mjs <dir> '<trainConfigJson>' [dims] [scorer] [evalEvery]
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { createKge } = require('@ruvector/kge');

const [dir, cfgJson = '{}', dimsArg = '128', scorer = 'hole', everyArg = '0'] = process.argv.slice(2);
const cfg = JSON.parse(cfgJson);
const dims = parseInt(dimsArg, 10);
const every = parseInt(everyArg, 10);
const read = (s) => fs.readFileSync(`${dir}/${s}.txt`, 'utf8').trim().split('\n').map((l) => { const [a, r, b] = l.split('\t'); return { s: a, r, o: b, split: s }; });
const kge = createKge({ scorer, dims, seed: 42 });
const all = [...read('train'), ...read('valid'), ...read('test')];
kge.addTriples(all);
const log = (o) => console.log(JSON.stringify(o));
log({ dir, dims, scorer, cfg, stats: kge.stats?.() });

const total = cfg.epochs ?? 100;
const chunk = every > 0 ? every : total;
let done = 0; let trainMs = 0;
while (done < total) {
  const n = Math.min(chunk, total - done);
  const t0 = performance.now();
  const rep = await kge.train({ ...cfg, epochs: n, seed: 7 + done });
  const ms = performance.now() - t0; trainMs += ms; done += n;
  const e0 = performance.now();
  const v = kge.evaluate({ split: 'valid', tieBreak: 'random' });
  const evalMs = performance.now() - e0;
  log({ epochs: done, epochMs: Math.round(ms / n), loss: rep.loss, triplesPerSec: rep.triplesPerSec, validMrr: v.report?.combined?.mrr, evalMs: Math.round(evalMs) });
}
const e0 = performance.now();
const t = kge.evaluate({ split: 'test', tieBreak: 'random' });
const c = t.report.combined;
log({ final: true, epochs: done, trainMin: +(trainMs / 60000).toFixed(2), testMrr: c.mrr, h1: c.hits?.['1'] ?? c.hits1, h3: c.hits?.['3'] ?? c.hits3, h10: c.hits?.['10'] ?? c.hits10, testEvalMs: Math.round(performance.now() - e0) });
if (process.env.SAVE) fs.writeFileSync(process.env.SAVE, JSON.stringify(kge.save()));
