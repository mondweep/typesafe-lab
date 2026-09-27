// Same as oos.mjs but after training 8 shots per intent (probe head), as in the original evaluation.
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire('/home/claude/ts/package.json');
const { createTypesafe, choice } = require('@ruvector/typesafe');
const M = '/home/claude/ts/node_modules/@ruvector/typesafe/models';
const D = JSON.parse(fs.readFileSync('data_full.json', 'utf8'));
const hum = (l) => String(l).replace(/[._]+/g, ' ').replace(/\s+/g, ' ').trim();
function auroc(pos, neg) { let w = 0; for (const p of pos) for (const n of neg) w += p > n ? 1 : p === n ? 0.5 : 0; return w / (pos.length * neg.length); }
const shots = +(process.argv[2] || 8);
const ts = createTypesafe({ embedder: { kind: 'onnx', modelDir: M, manifest: `${M}/manifest.json` } });
const labels = [...new Set(D.train.map((x) => x[1]))].sort();
const q = { intent: choice(Object.fromEntries(labels.map((l) => [l, hum(l)])), 'Which assistant intent does this utterance express') };
const per = {}; const ex = [];
for (const [t, l] of D.train) { per[l] = (per[l] || 0) + 1; if (per[l] <= shots) ex.push({ text: t, label: l }); }
let rep; for (let i = 0; i < ex.length; i += 50) rep = await ts.train('intent', ex.slice(i, i + 50));
console.log('train report', JSON.stringify(rep));
const inI = D.test.filter((_, i) => i % 3 === 0), oosI = D.oos_test;
const texts = [...inI.map((x) => x[0]), ...oosI.map((x) => x[0])];
const res = await ts.decideMany(texts, q);
const a = res.map((r) => r.intent);
const A = a.map((x) => x.abstain);
const inA = A.slice(0, inI.length), oosA = A.slice(inI.length);
const acc = inI.filter((x, i) => a[i].choice === x[1]).length / inI.length;
const med = (v) => [...v].sort((x, y) => x - y)[v.length >> 1];
console.log(JSON.stringify({ shots, head: a[0].head, calibrated: a[0].calibrated, temperature: a[0].temperature, in_acc: +acc.toFixed(3),
  abstain_auroc: +auroc(oosA, inA).toFixed(4), median_in: med(inA), median_oos: med(oosA),
  conf_auroc_low_is_oos: +auroc(a.slice(inI.length).map((x) => -x.confidence), a.slice(0, inI.length).map((x) => -x.confidence)).toFixed(4) }));
