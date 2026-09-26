// Live Jev benchmark on the frozen tickets fixture + out-of-scope probes.
// Key is read from a 0600 file populated from Secret Manager; never printed.
import { readFileSync, writeFileSync } from 'node:fs';
const KEY = readFileSync(process.env.JEV_KEY_FILE, 'utf8').trim();
const PKG = '/home/claude/RuVector/npm/packages/typesafe';
const fx = JSON.parse(readFileSync(`${PKG}/bench/fixtures/tickets-decisions.json`, 'utf8'));
const Q = fx.gen0_questions;
const { train, test } = fx.split;

async function jev(body, tries = 5) {
  for (let i = 0; i < tries; i++) {
    const t0 = performance.now();
    const r = await fetch('https://api.typesafe.ai/v1/systemone', { method: 'POST', headers: { authorization: `Bearer ${KEY}`, 'content-type': 'application/json' }, body: JSON.stringify({ model: 'jev-latest', ...body }) });
    const ms = performance.now() - t0;
    if (r.status === 429 || r.status === 529 || r.status >= 500) { await new Promise((s) => setTimeout(s, 500 * 2 ** i)); continue; }
    const j = await r.json();
    if (!r.ok) throw new Error(`HTTP ${r.status} ${JSON.stringify(j).slice(0, 300)}`);
    return { ms, j };
  }
  throw new Error('retries exhausted');
}
async function pool(items, width, fn) {
  const out = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: width }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); } }));
  return out;
}
const ece = (pairs, bins = 10) => { const b = Array.from({ length: bins }, (_, i) => ({ lo: i / bins, hi: (i + 1) / bins, n: 0, c: 0, a: 0 })); for (const [c, ok] of pairs) { const x = b[Math.min(bins - 1, Math.floor(c * bins))]; x.n++; x.c += c; x.a += ok ? 1 : 0; } const N = pairs.length; return { ece: b.reduce((s, x) => s + (x.n ? (x.n / N) * Math.abs(x.c / x.n - x.a / x.n) : 0), 0), bins: b.map((x) => ({ lo: x.lo, hi: x.hi, n: x.n, conf: x.n ? x.c / x.n : 0, acc: x.n ? x.a / x.n : 0 })) }; };
const auroc = (s, y) => { const p = s.filter((_, i) => y[i]), n = s.filter((_, i) => !y[i]); let w = 0; for (const a of p) for (const b of n) w += a > b ? 1 : a === b ? 0.5 : 0; return w / (p.length * n.length); };
const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(p * (s.length - 1))]; };

const results = { generated: new Date().toISOString() };

// ---- A. tickets gen-0, live ------------------------------------------------
{
  const rows = await pool(test, 4, async (t) => { const { ms, j } = await jev({ state: t.text, questions: Q }); return { id: t.id, ms, a: j.answers, usage: j.usage, model: j.model, label: t.label }; });
  const dept = rows.map((r) => [r.a.department.confidence, r.a.department.choice === r.label.department]);
  const E = ece(dept);
  results.tickets = {
    model: rows[0].model, n: rows.length,
    accuracy: dept.filter((x) => x[1]).length / rows.length, ece: E.ece, bins: E.bins,
    mean_conf: dept.reduce((s, x) => s + x[0], 0) / rows.length,
    urgent_acc: rows.filter((r) => (r.a.urgent.noul >= 0.5) === r.label.urgent).length / rows.length,
    urgent_auroc: auroc(rows.map((r) => r.a.urgent.noul), rows.map((r) => r.label.urgent)),
    frustration_acc: rows.filter((r) => Math.round(r.a.frustration.score) === r.label.frustration).length / rows.length,
    p50: q(rows.map((r) => r.ms), 0.5), p95: q(rows.map((r) => r.ms), 0.95),
    avg_input_tokens: rows.reduce((s, r) => s + r.usage.input_tokens, 0) / rows.length,
    rows: rows.map((r) => ({ id: r.id, ms: Math.round(r.ms), department: r.a.department, urgent: r.a.urgent.noul, frustration: r.a.frustration.score, tokens: r.usage })),
  };
  console.log('A tickets', JSON.stringify({ ...results.tickets, rows: undefined, bins: undefined }));
}

// ---- B. Jev with 3 examples/option in criteria (few-shot via criteria) -------
{
  const per = {}; const ex = {};
  for (const r of train) { const k = r.label.department; per[k] = (per[k] ?? 0) + 1; if (per[k] <= 3) (ex[k] ??= []).push(r.text); }
  const crit = {}; for (const [k, v] of Object.entries(Q.department.criteria)) crit[k] = { what: v, examples: ex[k] };
  const dq = { department: { ...Q.department, criteria: crit } };
  const rows = await pool(test, 4, async (t) => { const { j } = await jev({ state: t.text, questions: dq }); return [j.answers.department.confidence, j.answers.department.choice === t.label.department, j.usage.input_tokens]; });
  results.tickets_3ex = { accuracy: rows.filter((x) => x[1]).length / rows.length, ece: ece(rows).ece, avg_input_tokens: rows.reduce((s, x) => s + x[2], 0) / rows.length, examples_per_option: 3 };
  console.log('B 3-ex', JSON.stringify(results.tickets_3ex));
}

// ---- C. out-of-scope: CLINC150 oos_test sample + hand probes vs in-scope tickets
{
  const clinc = JSON.parse(readFileSync(`${PKG}/bench/.cache/clinc150-data_full.json`, 'utf8'));
  const oos = [...clinc.oos_test.map((x) => x[0]).filter((_, i) => i % 7 === 0).slice(0, 100),
    'What is the capital of Australia?', 'Write me a haiku about autumn leaves.', 'My neighbour’s dog keeps barking at night, any tips?', 'Can you recommend a good lasagne recipe?', 'Who won the football last night?', 'asdf qwerty zxcv'];
  const inScope = test.slice(0, 100).map((t) => t.text);
  const withOther = { department: { ...Q.department, criteria: { ...Q.department.criteria, other: 'Anything that is not a customer-support message for this company' } } };
  const run = async (questions) => pool([...inScope, ...oos], 4, async (s) => { const { j } = await jev({ state: s, questions }); const d = j.answers.department; return { choice: d.choice, conf: d.confidence }; });
  const plain = await run({ department: Q.department });
  const other = await run(withOther);
  const y = [...inScope.map(() => false), ...oos.map(() => true)];
  results.oos = {
    n_in: inScope.length, n_oos: oos.length,
    plain: { auroc_1_minus_conf: auroc(plain.map((r) => 1 - r.conf), y), mean_conf_oos: plain.slice(inScope.length).reduce((s, r) => s + r.conf, 0) / oos.length, mean_conf_in: plain.slice(0, inScope.length).reduce((s, r) => s + r.conf, 0) / inScope.length },
    with_other: { oos_routed_to_other: other.slice(inScope.length).filter((r) => r.choice === 'other').length / oos.length, in_scope_routed_to_other: other.slice(0, inScope.length).filter((r) => r.choice === 'other').length / inScope.length, auroc_p_other: null },
    hand_probes_plain: plain.slice(-6).map((r, i) => ({ state: oos[oos.length - 6 + i], ...r })),
    hand_probes_other: other.slice(-6).map((r, i) => ({ state: oos[oos.length - 6 + i], ...r })),
    states: { inScope, oos },
  };
  console.log('C oos', JSON.stringify({ ...results.oos, states: undefined }));
}
writeFileSync('/home/claude/receipts/jev-live.json', JSON.stringify(results, null, 1));
