// Build per-item stage outputs for bench-v1 test and sweep cascade thresholds.
import { readFileSync, writeFileSync } from 'node:fs';
import { norm, simulate } from './cascade-core.mjs';
const J = (p) => JSON.parse(readFileSync(p, 'utf8'));
const bench = J('./data/bench-v1.json');
const base = J('./data/bench-v1-results.json');
const rr = J('/home/claude/experiments/cascade/rr-xsmall-int8-test.json');
const llm = J('/home/claude/experiments/cascade/llm-qwen15.json').res;
const TASKS = Object.keys(bench.questions);
const items = [];
for (const t of TASKS) {
  const tsRows = base.arms.ts_trained.tasks[t].rows, jevRows = base.arms.jev_zero.tasks[t].rows, jdRows = base.arms.jev_data.tasks[t].rows;
  const tsThr = base.arms.ts_trained.tasks[t].metrics.threshold ?? 0.5, jThr = base.arms.jev_zero.tasks[t].metrics.threshold ?? 0.5;
  bench.test[t].forEach((it, i) => {
    const ts = norm(t, 'ts', { ...tsRows[i].ans, probabilities: tsRows[i].raw?.probabilities }, tsThr);
    const jev = norm(t, 'jev', { ...jevRows[i].ans, probabilities: jevRows[i].raw?.probabilities, confidence: jevRows[i].raw?.confidence }, jThr);
    items.push({ task: t, id: it.id, tag: it.tag, label: it.label, text: it.text, stages: {
      ts: { ...ts, ms: tsRows[i].ms },
      rr: { ...norm(t, 'rr', rr[t][i]), ms: rr[t][i].ms },
      llm: { ...norm(t, 'llm', llm[t].rows[i]), ms: llm[t].rows[i].first ? llm[t].median_ms : llm[t].rows[i].ms },
      jev: { ...jev, ms: jevRows[i].ms },
    } });
  });
}
// single-stage baselines
const single = {};
for (const s of ['ts', 'rr', 'llm', 'jev']) single[s] = items.filter((x) => x.stages[s].pred === x.label).length / items.length;
console.log('single-stage accuracy', JSON.stringify(Object.fromEntries(Object.entries(single).map(([k, v]) => [k, +(v * 100).toFixed(1)]))));
// presets
const presets = {
  'typesafe only': { use: {}, t: {} },
  'typesafe → reranker': { use: { rr: true }, t: { ts: 0.6 } },
  'typesafe → reranker → local LLM (all local)': { use: { rr: true, llm: true }, t: { ts: 0.6, rr: 0.6 } },
  'typesafe → reranker → local LLM → Jev': { use: { rr: true, llm: true, jev: true }, t: { ts: 0.6, rr: 0.6, llm: 0.6 } },
  'typesafe → Jev': { use: { jev: true }, t: { ts: 0.6 } },
};
const table = {};
for (const [name, cfg] of Object.entries(presets)) { table[name] = simulate(items, cfg); console.log(name.padEnd(46), JSON.stringify({ acc: +(table[name].accuracy * 100).toFixed(1), ms: Math.round(table[name].mean_ms), jev: +(table[name].jev_share * 100).toFixed(0), handled: Object.fromEntries(Object.entries(table[name].handled).map(([k, v]) => [k, +(v.share * 100).toFixed(0)])) })); }
// sweep for all-local cascade
const sweep = [];
for (const a of [0, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.01]) for (const b of [0, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.01]) {
  const r = simulate(items, { use: { rr: true, llm: true }, t: { ts: a, rr: b } }); sweep.push({ ts: a, rr: b, acc: r.accuracy, ms: r.mean_ms });
}
sweep.sort((x, y) => y.acc - x.acc); console.log('best all-local', JSON.stringify(sweep.slice(0, 5)));
writeFileSync('./data/cascade-v1.json', JSON.stringify({ generated: new Date().toISOString(), host: '2 vCPU container; LLM Qwen2.5-1.5B-Instruct Q4_K_M via llama.cpp; reranker DeBERTa-v3-xsmall int8 fine-tuned on bench-v1 train', single, presets: table, items }, null, 0));
