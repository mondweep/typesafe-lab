// Cross-fitted calibration on small banks: CFPB product routing (11 classes), locally built binding.
// For n labels per class, trains the same examples with and without crossfitCalibration and reports
// test accuracy, ECE (10 bins, on `confidence`), calibrated flag and fitted temperature.
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { createTypesafe, choice } = require('/home/claude/rv/npm/packages/typesafe/dist/index.js');
const binding = require(process.env.TS_NODE ?? '/home/claude/oos/typesafe.linux-x64-gnu.node');
const M = '/home/claude/ts/node_modules/@ruvector/typesafe/models';
import { PRODUCTS, KEY } from './stage1.mjs';
const read = (f) => fs.readFileSync(f, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const train = read('train.jsonl'), test = read('test.jsonl');
const q = { product: choice(PRODUCTS) };
const texts = test.map((r) => r.text), gold = test.map((r) => KEY[r.product]);

function ece(conf, ok, bins = 10) {
  let e = 0;
  for (let b = 0; b < bins; b++) {
    const idx = conf.map((c, i) => [c, i]).filter(([c]) => (c > b / bins || (b === 0 && c === 0)) && c <= (b + 1) / bins).map(([, i]) => i);
    if (!idx.length) continue;
    const acc = idx.filter((i) => ok[i]).length / idx.length, mc = idx.reduce((s, i) => s + conf[i], 0) / idx.length;
    e += (idx.length / conf.length) * Math.abs(acc - mc);
  }
  return e;
}
let seed = 1; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const out = [];
for (const per of (process.env.PERS ?? '6,8,10').split(',').map(Number)) for (const s of (process.env.SEEDS ?? '0,1,2').split(',').map(Number)) {
  seed = 100 * per + s;
  const byLab = {};
  for (const r of [...train].sort(() => rnd() - 0.5)) { const l = KEY[r.product]; (byLab[l] ??= []).length < per && byLab[l].push({ text: r.text, label: l }); }
  // interleave labels so the positional calibration slice is stratified
  const ex = []; for (let i = 0; i < per; i++) for (const l of Object.keys(byLab).sort()) if (byLab[l][i]) ex.push(byLab[l][i]);
  for (const crossfit of [false, true]) {
    const ts = createTypesafe({ binding, warnOnHashEmbedder: false, embedder: { kind: 'onnx', modelDir: M, manifest: `${M}/manifest.json` }, engine: { crossfitCalibration: crossfit } });
    const rep = await ts.train('product', ex);
    const res = await ts.decideMany(texts, q);
    const a = res.map((r) => r.product);
    const ok = a.map((x, i) => x.choice === gold[i]);
    const row = { per_class: per, n: ex.length, seed: s, crossfit, head: a[0].head, calibrated: a[0].calibrated, temperature: +a[0].temperature.toFixed(3),
      acc: +(ok.filter(Boolean).length / ok.length).toFixed(4), ece: +ece(a.map((x) => x.confidence), ok).toFixed(4),
      mean_conf: +(a.reduce((t, x) => t + x.confidence, 0) / a.length).toFixed(4), report_calibrated: rep.calibrated };
    console.log(JSON.stringify(row)); out.push(row);
  }
}
fs.writeFileSync(process.env.OUT ?? 'calib-results.json', JSON.stringify(out, null, 1));
