import { readFileSync, writeFileSync } from 'node:fs';
const R = (p) => JSON.parse(readFileSync(p, 'utf8'));
const s16 = R('/home/claude/receipts/tickets-onnx-16shot.json');
const z = R('/home/claude/receipts/tickets-onnx-zeroshot.json');
const cl = R('/home/claude/receipts/clinc150-onnx-8shot.json');
const hf = R('/home/claude/receipts/exp-heads-bge-small-en-v1.5-16shot.json');
const hi = R('/home/claude/receipts/exp-heads-bge-small-en-v1.5-int8-16shot.json');
const op = R('/home/claude/receipts/optimize-int8.json');
const jb = R('/home/claude/RuVector/npm/packages/typesafe/bench/jev-baseline-2026-09-21.json');
const loopReceipts = readFileSync('/home/claude/receipts/optimize-receipts-2026-09-25.jsonl','utf8').trim().split('\n').map(JSON.parse);
const bins = (m) => m.ece.bins.map(b => ({ lo: b.lo, hi: b.hi, n: b.n, conf: b.conf, acc: b.acc }));
const J = s16.metrics.jev.test, L = s16.metrics.local.test;
const ev = {
  generated: '2026-09-25',
  host: { cpus: 2, note: '2 vCPU cloud container (author ran on a 32-thread Ryzen 9 9950X), native napi-rs build with ONNX Runtime' },
  repo_commit: '5356a84 (2026-09-23)',
  jev: {
    source: 'Frozen replay recorded by the package author on 2026-09-21 against https://api.typesafe.ai/v1/systemone (model "jev-latest"). Not independently re-run: Jev is early-access.',
    gen0: { accuracy: J.choice_accuracy, ece: J.ece.ece, mean_conf: J.mean_confidence, p50: J.latency_ms.p50, p95: J.latency_ms.p95, urgent_accuracy: J.urgent_accuracy, frustration_accuracy: J.frustration_accuracy, urgent_majority: J.urgent_majority_rate, bins: bins(J), labeled_examples_used: 0 },
    champion: { accuracy: s16.metrics.jev_champion.test.choice_accuracy, ece: s16.metrics.jev_champion.test.ece.ece, note: 'criteria mutated over 8 generations; author notes mutated examples were literal ticket texts (memorisation risk)' },
    avg_input_tokens: Math.round(jb.test_rows.baseline.reduce((s, r) => s + (r.tokens?.input_tokens || 0), 0) / jb.test_rows.baseline.length),
    price_per_mtok_input: 0.042,
  },
  runs: [
    { id: 'zero', label: 'typesafe zero-shot (criteria only, like Jev gen-0)', model: 'bge-small fp32', labeled: 0, accuracy: z.metrics.local.test.choice_accuracy, ece: z.metrics.local.test.ece.ece, p95: z.metrics.local.test.latency_ms.p95, urgent_accuracy: z.metrics.local.test.urgent_accuracy, urgent_auroc: z.metrics.local.test.urgent_auroc, frustration_accuracy: z.metrics.local.test.frustration_accuracy, provenance: 'new experiment (upstream harness, --zero-shot)' },
    { id: 's16', label: 'typesafe 16-shot, department only (upstream bench)', model: 'bge-small fp32', labeled: 119, accuracy: L.choice_accuracy, ece: L.ece.ece, p95: L.latency_ms.p95, urgent_accuracy: L.urgent_accuracy, urgent_auroc: L.urgent_auroc, frustration_accuracy: L.frustration_accuracy, bins: bins(L), provenance: 'reproduced here (README: 80.0%, ECE 0.075)' },
    { id: 'all-fp32', label: 'typesafe all three heads trained', model: 'bge-small fp32', labeled: 128 + 200 + 200, accuracy: hf.department.accuracy / 100, ece: hf.department.ece, p95: hf.latency_ms_all_three_questions.p95, urgent_accuracy: hf.urgent.accuracy_at_0_5 / 100, urgent_auroc: hf.urgent.auroc, frustration_accuracy: hf.frustration.accuracy / 100, provenance: 'new experiment (not in upstream README)' },
    { id: 'all-int8', label: 'typesafe all three heads trained', model: 'bge-small int8', labeled: 128 + 200 + 200, accuracy: hi.department.accuracy / 100, ece: hi.department.ece, p95: hi.latency_ms_all_three_questions.p95, urgent_accuracy: hi.urgent.accuracy_at_0_5 / 100, urgent_auroc: hi.urgent.auroc, frustration_accuracy: hi.frustration.accuracy / 100, provenance: 'new experiment (not in upstream README)' },
    { id: 'opt-int8', label: 'typesafe governed-loop champion', model: 'bge-small int8', labeled: '137 train + 37 calib + 150 val', accuracy: op.champion.test.test, ece: op.champion.test.test_ece, p95: null, provenance: 'reproduced here (README: 84.0%, ECE 0.071)' },
  ],
  clinc150: { accuracy_incl_oos: cl.metrics.local.test.choice_accuracy, macro_f1: cl.metrics.local.test.macro_f1, ece: cl.metrics.local.test.ece.ece, oos_auroc: cl.metrics.local.test.oos_auroc, n: cl.metrics.local.test.n, n_oos: cl.metrics.local.test.n_oos, mean_abstain: cl.metrics.local.test.mean_abstain, p95: cl.metrics.local.test.latency_ms.p95, shots: 8, note: 'CLINC150, 8 shots/intent, first 1,500 in-scope test items + 150 out-of-scope. OOS release gate (AUROC >= 0.85) fails: abstain mass is ~0 everywhere.' },
  oos_probe: hf.oos_probe,
  loop: { champion: op.champion, arms: op.arms, receipts: loopReceipts },
};
const jl = R('/home/claude/receipts/jev-live.json'); const ff = R('/home/claude/receipts/fair-followups.json');
ev.jev_live = { run: '2026-09-25', model: jl.tickets.model, accuracy: jl.tickets.accuracy, ece: jl.tickets.ece, bins: jl.tickets.bins, mean_conf: jl.tickets.mean_conf, urgent_acc_0_5: jl.tickets.urgent_acc, urgent_auroc: jl.tickets.urgent_auroc, urgent_val_threshold: ff.jev_urgent.val_threshold, urgent_acc_tuned: ff.jev_urgent.test_acc_at_val_threshold, frustration_acc: jl.tickets.frustration_acc, p50: jl.tickets.p50, p95: jl.tickets.p95, avg_input_tokens: jl.tickets.avg_input_tokens, with_3_examples: jl.tickets_3ex, rows: jl.tickets.rows };
ev.oos_same_set = { n_in: jl.oos.n_in, n_oos: jl.oos.n_oos, jev_plain: jl.oos.plain, jev_other: jl.oos.with_other, jev_hand_plain: jl.oos.hand_probes_plain, jev_hand_other: jl.oos.hand_probes_other, ts: ff };
writeFileSync('/home/claude/typesafe-lab/data/evidence.json', JSON.stringify(ev, null, 1));
console.log(JSON.stringify(ev.runs.map(r => [r.id, r.accuracy, r.ece, r.urgent_accuracy, r.frustration_accuracy])), ev.jev.avg_input_tokens);
