// Opt-in catch-all option vs an ordinary "other" option. CLINC150 (150 intents) and the
// 8-department tickets question with the lab's off-topic states. bge-small ONNX, zero-shot.
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { createTypesafe, choice } = require('/home/claude/rv/npm/packages/typesafe/dist/index.js');
const binding = require('/home/claude/oos/typesafe-catchall.node');
const M = '/home/claude/ts/node_modules/@ruvector/typesafe/models';
const D = JSON.parse(fs.readFileSync('/home/claude/oos/data_full.json', 'utf8'));
const hum = (l) => String(l).replace(/[._]+/g, ' ').trim();
const OTHER = 'Anything that is not one of the other options';
const mk = (engine) => createTypesafe({ binding, warnOnHashEmbedder: false, embedder: { kind: 'onnx', modelDir: M, manifest: `${M}/manifest.json` }, engine });

async function run(ts, criteria, instr, texts) {
  const q = { q: choice({ ...criteria, other: OTHER }, instr) };
  const out = [];
  for (let i = 0; i < texts.length; i += 64) out.push(...(await ts.decideMany(texts.slice(i, i + 64), q)).map((r) => r.q));
  return out;
}
const rate = (xs, f) => xs.filter(f).length / xs.length;
function report(tag, ans, gold, oos) {
  const inI = ans.filter((_, i) => !oos[i]), inG = gold.filter((_, i) => !oos[i]), outI = ans.filter((_, i) => oos[i]);
  return { tag, oos_caught: +rate(outI, (a) => a.choice === 'other').toFixed(3), false_alarms: +rate(inI, (a) => a.choice === 'other').toFixed(3),
    in_scope_acc: +(inI.filter((a, i) => a.choice === inG[i]).length / inI.length).toFixed(3) };
}
const res = {};
// ---- CLINC150
const labels = [...new Set(D.train.map((x) => x[1]))].sort();
const crit = Object.fromEntries(labels.map((l) => [l, hum(l)]));
const instr = 'Which assistant intent does this utterance express';
const val = [...D.val.map(([t, l]) => [t, l, false]), ...D.oos_val.map(([t]) => [t, 'other', true])];
const tst = [...D.test.map(([t, l]) => [t, l, false]), ...D.oos_test.map(([t]) => [t, 'other', true])];
const ordinary = mk({});
res.clinc_ordinary = report('CLINC150, "other" as an ordinary option', await run(ordinary, crit, instr, tst.map((x) => x[0])), tst.map((x) => x[1]), tst.map((x) => x[2]));
console.log(JSON.stringify(res.clinc_ordinary));
// tune the threshold on validation using the catch-all's probability
const probe = mk({ catchAll: 'other', catchAllThreshold: 2 }); // never chosen: read p(other)
const pv = (await run(probe, crit, instr, val.map((x) => x[0]))).map((a) => a.probabilities.other);
let best = { j: -1 };
for (const t of [...new Set(pv.map((p) => +p.toFixed(4)))].sort()) {
  const tpr = rate(pv.filter((_, i) => val[i][2]), (p) => p >= t), fpr = rate(pv.filter((_, i) => !val[i][2]), (p) => p >= t);
  if (tpr - fpr > best.j) best = { j: tpr - fpr, t };
}
res.threshold = best.t; console.log('threshold (val, Youden)', best.t);
const cat = mk({ catchAll: 'other', catchAllThreshold: best.t });
res.clinc_catch_all = report(`CLINC150, catch-all at ${best.t}`, await run(cat, crit, instr, tst.map((x) => x[0])), tst.map((x) => x[1]), tst.map((x) => x[2]));
console.log(JSON.stringify(res.clinc_catch_all));
// ---- tickets (8 departments) + lab off-topic states, same threshold (transfer)
const fx = JSON.parse(fs.readFileSync('/home/claude/rv/npm/packages/typesafe/bench/fixtures/tickets-decisions.json', 'utf8'));
const live = JSON.parse(fs.readFileSync('/home/claude/lab/receipts/jev-live.json', 'utf8')).oos.states;
const tcrit = fx.gen0_questions.department.criteria, tinstr = fx.gen0_questions.department.instructions ?? '';
const tt = fx.split.test.slice(0, 100);
const tItems = [...tt.map((t) => [t.text, t.label.department, false]), ...live.oos.map((s) => [s, 'other', true])];
res.tickets_ordinary = report('tickets, "other" as an ordinary option', await run(ordinary, tcrit, tinstr, tItems.map((x) => x[0])), tItems.map((x) => x[1]), tItems.map((x) => x[2]));
res.tickets_catch_all = report(`tickets, catch-all at ${best.t} (threshold from CLINC150)`, await run(cat, tcrit, tinstr, tItems.map((x) => x[0])), tItems.map((x) => x[1]), tItems.map((x) => x[2]));
console.log(JSON.stringify(res.tickets_ordinary)); console.log(JSON.stringify(res.tickets_catch_all));
fs.writeFileSync('/home/claude/oos/catchall-results.json', JSON.stringify(res, null, 1));
