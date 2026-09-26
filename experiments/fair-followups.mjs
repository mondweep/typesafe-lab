// Follow-ups for fairness: (1) Jev urgent threshold chosen on the val split, applied to test;
// (2) typesafe on the SAME OOS set, plain and with an "other" option, zero-shot and trained.
import { readFileSync, writeFileSync } from 'node:fs';
import { createTypesafe } from '/home/claude/RuVector/npm/packages/typesafe/dist/index.js';
const KEY = readFileSync(process.env.JEV_KEY_FILE, 'utf8').trim();
const PKG = '/home/claude/RuVector/npm/packages/typesafe';
const fx = JSON.parse(readFileSync(`${PKG}/bench/fixtures/tickets-decisions.json`, 'utf8'));
const Q = fx.gen0_questions; const { train, val, test } = fx.split;
const live = JSON.parse(readFileSync('/home/claude/receipts/jev-live.json', 'utf8'));
const auroc = (s, y) => { const p = s.filter((_, i) => y[i]), n = s.filter((_, i) => !y[i]); let w = 0; for (const a of p) for (const b of n) w += a > b ? 1 : a === b ? 0.5 : 0; return w / (p.length * n.length); };
async function jev(body) { for (let i = 0; i < 5; i++) { const r = await fetch('https://api.typesafe.ai/v1/systemone', { method: 'POST', headers: { authorization: `Bearer ${KEY}`, 'content-type': 'application/json' }, body: JSON.stringify({ model: 'jev-latest', ...body }) }); if (r.status === 429 || r.status >= 500) { await new Promise((s) => setTimeout(s, 500 * 2 ** i)); continue; } return r.json(); } }
async function pool(items, w, fn) { const out = []; let i = 0; await Promise.all(Array.from({ length: w }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]); } })); return out; }
const out = {};

// (1) Jev urgent threshold on val
const vs = await pool(val, 4, async (t) => (await jev({ state: t.text, questions: { urgent: Q.urgent } })).answers.urgent.noul);
let best = { thr: 0.5, acc: 0 };
for (let thr = 0.3; thr <= 0.95; thr += 0.01) { const acc = val.filter((t, i) => (vs[i] >= thr) === t.label.urgent).length / val.length; if (acc > best.acc) best = { thr: +thr.toFixed(2), acc }; }
const testScores = live.tickets.rows.map((r) => r.urgent);
out.jev_urgent = { val_threshold: best.thr, val_acc: best.acc, test_acc_at_val_threshold: test.filter((t, i) => (testScores[i] >= best.thr) === t.label.urgent).length / test.length, test_acc_at_0_5: live.tickets.urgent_acc, test_auroc: live.tickets.urgent_auroc };
console.log('jev urgent', JSON.stringify(out.jev_urgent));

// (2) typesafe on the same OOS set
const embedder = { kind: 'onnx', modelDir: `${PKG}/models`, manifest: `${PKG}/models/manifest.json`, model: 'bge-small-en-v1.5-int8' };
const { inScope, oos } = live.oos.states;
const y = [...inScope.map(() => false), ...oos.map(() => true)];
const all = [...inScope, ...oos];
const withOther = { ...Q.department, criteria: { ...Q.department.criteria, other: 'Anything that is not a customer-support message for this company' } };
async function evalEngine(ts, question) {
  const rs = []; for (const s of all) rs.push((await ts.systemOne({ state: s, questions: { department: question } })).answers.department);
  return { auroc_1_minus_conf: auroc(rs.map((r) => 1 - r.confidence), y), auroc_abstain: auroc(rs.map((r) => r.abstain), y), oos_to_other: rs.slice(inScope.length).filter((r) => r.choice === 'other').length / oos.length, in_to_other: rs.slice(0, inScope.length).filter((r) => r.choice === 'other').length / inScope.length, mean_conf_oos: rs.slice(inScope.length).reduce((s, r) => s + r.confidence, 0) / oos.length, mean_conf_in: rs.slice(0, inScope.length).reduce((s, r) => s + r.confidence, 0) / inScope.length, head: rs[0].head };
}
const zero = createTypesafe({ embedder });
out.ts_zero_plain = await evalEngine(zero, Q.department);
out.ts_zero_other = await evalEngine(zero, withOther);
const trained = createTypesafe({ embedder });
const per = {}; const ex = [];
for (const r of train) { const k = r.label.department; per[k] = (per[k] ?? 0) + 1; if (per[k] <= 16) ex.push({ text: r.text, label: k }); }
await trained.train('department', ex);
out.ts_trained_plain = await evalEngine(trained, Q.department);
out.ts_trained_other_noexamples = await evalEngine(trained, withOther);
for (const k of Object.keys(out)) console.log(k, JSON.stringify(out[k]));
writeFileSync('/home/claude/receipts/fair-followups.json', JSON.stringify(out, null, 1));
