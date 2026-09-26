// Independent experiment: train ALL three question types on the tickets train
// split (not just `department`, which is all the upstream bench trains), then
// score test. Also probes out-of-scope abstention with hand-written OOS states.
import { readFileSync, writeFileSync } from 'node:fs';
import { createTypesafe } from '/home/claude/RuVector/npm/packages/typesafe/dist/index.js';

const PKG = '/home/claude/RuVector/npm/packages/typesafe';
const fx = JSON.parse(readFileSync(`${PKG}/bench/fixtures/tickets-decisions.json`, 'utf8'));
const Q = fx.gen0_questions;
const { train, test } = fx.split;
const shots = Number(process.argv[2] ?? 16);
const model = process.argv[3] ?? 'bge-small-en-v1.5';

const ts = createTypesafe({
  embedder: { kind: 'onnx', modelDir: `${PKG}/models`, manifest: `${PKG}/models/manifest.json`, model },
});

// department: N per class (as upstream); urgent + frustration: whole train split
const perClass = {};
const deptEx = [];
for (const r of train) {
  const k = r.label.department;
  perClass[k] = (perClass[k] ?? 0) + 1;
  if (perClass[k] <= shots) deptEx.push({ text: r.text, label: k });
}
const legend = Q.frustration.criteria;
const urgEx = train.map((r) => ({ text: r.text, label: r.label.urgent ? 'yes' : 'no' }));
const fruEx = train.map((r) => ({ text: r.text, label: legend[r.label.frustration] }));

const reports = {
  department: await ts.train('department', deptEx),
  urgent: await ts.train('urgent', urgEx),
  frustration: await ts.train('frustration', fruEx),
};

function ece(pairs, bins = 10) {
  const b = Array.from({ length: bins }, () => ({ n: 0, c: 0, a: 0 }));
  for (const [conf, ok] of pairs) {
    const i = Math.min(bins - 1, Math.floor(conf * bins));
    b[i].n++; b[i].c += conf; b[i].a += ok ? 1 : 0;
  }
  const N = pairs.length;
  return b.reduce((s, x) => s + (x.n ? (x.n / N) * Math.abs(x.c / x.n - x.a / x.n) : 0), 0);
}
function auroc(scores, labels) {
  const pos = scores.filter((_, i) => labels[i]), neg = scores.filter((_, i) => !labels[i]);
  let w = 0;
  for (const p of pos) for (const n of neg) w += p > n ? 1 : p === n ? 0.5 : 0;
  return w / (pos.length * neg.length);
}

const rows = [];
const lat = [];
for (const r of test) {
  const t0 = performance.now();
  const res = await ts.systemOne({ state: r.text, questions: Q });
  lat.push(performance.now() - t0);
  const a = res.answers ?? res;
  rows.push({ r, a });
}
const pct = (x) => Math.round(x * 1000) / 10;
const dept = rows.map(({ r, a }) => [a.department.confidence, a.department.choice === r.label.department]);
const urgScores = rows.map(({ a }) => a.urgent.noul);
const urgLabels = rows.map(({ r }) => r.label.urgent);
const urgAcc = rows.filter(({ r, a }) => (a.urgent.noul >= 0.5) === r.label.urgent).length / rows.length;
const fruAcc = rows.filter(({ r, a }) => a.frustration.score === r.label.frustration).length / rows.length;
lat.sort((x, y) => x - y);
const q = (p) => lat[Math.floor(p * (lat.length - 1))];

// Out-of-scope probe: nothing here belongs to any department.
const oos = [
  'What is the capital of Australia?',
  'Write me a haiku about autumn leaves.',
  'My neighbour’s dog keeps barking at night, any tips?',
  'Can you recommend a good lasagne recipe?',
  'Who won the football last night?',
  'asdf qwerty zxcv',
];
const oosOut = [];
for (const s of oos) {
  const res = await ts.systemOne({ state: s, questions: { department: Q.department } });
  const d = (res.answers ?? res).department;
  oosOut.push({ state: s, choice: d.choice, confidence: d.confidence, abstain: d.abstain });
}
const inAbstain = rows.map(({ a }) => a.department.abstain);
const summary = {
  model, shots,
  train_reports: reports,
  department: { accuracy: pct(dept.filter((x) => x[1]).length / dept.length), ece: +ece(dept).toFixed(4), calibrated: rows[0].a.department.calibrated, head: rows[0].a.department.head, mean_abstain_in_scope: +(inAbstain.reduce((s, x) => s + x, 0) / inAbstain.length).toFixed(4) },
  urgent: { accuracy_at_0_5: pct(urgAcc), majority_baseline: pct(urgLabels.filter((x) => !x).length / urgLabels.length), auroc: +auroc(urgScores, urgLabels).toFixed(3), head: rows[0].a.urgent.head, calibrated: rows[0].a.urgent.calibrated },
  frustration: { accuracy: pct(fruAcc), head: rows[0].a.frustration.head, calibrated: rows[0].a.frustration.calibrated },
  latency_ms_all_three_questions: { p50: +q(0.5).toFixed(1), p95: +q(0.95).toFixed(1) },
  oos_probe: oosOut,
};
console.log(JSON.stringify(summary, null, 2));
writeFileSync(`/home/claude/receipts/exp-heads-${model}-${shots}shot.json`, JSON.stringify(summary, null, 2));
