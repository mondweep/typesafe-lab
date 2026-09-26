// Offline runner for bench-v1: 4 arms × 150 test items (+ train split for threshold tuning).
//   JEV_KEY_FILE=… node run-bench.mjs [out.json]
// Arms: ts_zero (criteria only), ts_trained (train split), jev_zero (criteria only), jev_data (train split in state).
import { readFileSync, writeFileSync } from 'node:fs';
import { createTypesafe } from './vendor/typesafe/dist/index.js';
import * as B from './bench-core.mjs';

const bench = JSON.parse(readFileSync(new URL('./data/bench-v1.json', import.meta.url), 'utf8'));
const KEY = process.env.JEV_KEY_FILE ? readFileSync(process.env.JEV_KEY_FILE, 'utf8').trim() : '';
const PKG = new URL('./vendor/typesafe/', import.meta.url).pathname;
const embedder = { kind: 'onnx', modelDir: PKG + 'models', manifest: PKG + 'models/manifest.json', model: 'bge-small-en-v1.5-int8' };
const TASKS = Object.keys(bench.questions);

async function jev(body) {
  for (let i = 0; i < 6; i++) {
    const t0 = performance.now();
    const r = await fetch('https://api.typesafe.ai/v1/systemone', { method: 'POST', headers: { authorization: `Bearer ${KEY}`, 'content-type': 'application/json' }, body: JSON.stringify({ model: 'jev-latest', ...body }) });
    if (r.status === 429 || r.status >= 500) { await new Promise((s) => setTimeout(s, 500 * 2 ** i)); continue; }
    const j = await r.json();
    if (!r.ok) throw new Error(`Jev ${r.status} ${JSON.stringify(j).slice(0, 200)}`);
    return { ms: performance.now() - t0, j };
  }
  throw new Error('Jev retries exhausted');
}
async function pool(items, w, fn) { const out = []; let i = 0; await Promise.all(Array.from({ length: w }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); } })); return out; }

const zero = createTypesafe({ embedder });
const trained = createTypesafe({ embedder });
const trainReports = {};
for (const t of TASKS) trainReports[t] = await trained.train(t, B.tsTrainExamples(bench, t));

const arms = {
  ts_zero: async (task, item) => { const t0 = performance.now(); const r = await zero.systemOne({ state: item.text, questions: { [task]: bench.questions[task] } }); return { ms: performance.now() - t0, a: r.answers[task] }; },
  ts_trained: async (task, item) => { const t0 = performance.now(); const r = await trained.systemOne({ state: item.text, questions: { [task]: bench.questions[task] } }); return { ms: performance.now() - t0, a: r.answers[task] }; },
  jev_zero: async (task, item) => { const { ms, j } = await jev(B.jevNoDataRequest(bench, task, item.text)); return { ms, a: j.answers[task], tokens: j.usage?.input_tokens, model: j.model }; },
  jev_data: async (task, item) => { const { ms, j } = await jev(B.jevWithDataRequest(bench, task, item.text, item.id)); return { ms, a: j.answers[task], tokens: j.usage?.input_tokens, model: j.model }; },
};

const result = { dataset: bench.name, generated: new Date().toISOString(), embedder: embedder.model, train_reports: trainReports, arms: {} };
const only = process.env.ARMS ? process.env.ARMS.split(',') : null;
for (const [arm, fn] of Object.entries(arms)) {
  if (only && !only.includes(arm)) continue;
  const width = arm.startsWith('jev') ? 4 : 1;
  result.arms[arm] = { tasks: {} };
  for (const task of TASKS) {
    // threshold for the noul task is tuned on the TRAIN split (jev_data uses leave-one-out for train items)
    let thr = 0.5;
    if (task === 'deadline') {
      const tr = await pool(bench.train[task], width, (it) => fn(task, it));
      thr = B.bestThreshold(tr.map((x) => x.a.noul), bench.train[task].map((x) => x.label)).thr;
    }
    const raw = await pool(bench.test[task], width, (it) => fn(task, it));
    const rows = bench.test[task].map((it, i) => ({ id: it.id, label: it.label, tag: it.tag, ms: +raw[i].ms.toFixed(1), tokens: raw[i].tokens, ans: B.readAnswer(task, raw[i].a), raw: raw[i].a }));
    const lat = rows.map((r) => r.ms).sort((a, b) => a - b);
    result.arms[arm].tasks[task] = { metrics: { ...B.metrics(task, rows, thr), p50_ms: lat[Math.floor(lat.length / 2)], p95_ms: lat[Math.floor(0.95 * (lat.length - 1))], mean_tokens: rows[0].tokens ? rows.reduce((s, r) => s + (r.tokens || 0), 0) / rows.length : null }, rows };
    if (raw[0].model) result.arms[arm].model = raw[0].model;
    console.log(arm, task, JSON.stringify(result.arms[arm].tasks[task].metrics));
  }
  // per-tag breakdown across all tasks
  const byTag = {};
  for (const task of TASKS) { const T = result.arms[arm].tasks[task]; for (const r of T.rows) { const c = B.correct(task, r, T.metrics.threshold ?? 0.5); (byTag[r.tag] ??= { n: 0, ok: 0 }); byTag[r.tag].n++; byTag[r.tag].ok += c ? 1 : 0; } }
  result.arms[arm].by_tag = Object.fromEntries(Object.entries(byTag).map(([k, v]) => [k, { n: v.n, accuracy: v.ok / v.n }]));
  const all = Object.values(byTag).reduce((s, v) => ({ n: s.n + v.n, ok: s.ok + v.ok }), { n: 0, ok: 0 });
  result.arms[arm].overall_accuracy = all.ok / all.n;
  console.log(arm, 'overall', result.arms[arm].overall_accuracy.toFixed(3), JSON.stringify(result.arms[arm].by_tag));
}
writeFileSync(process.argv[2] || new URL('./data/bench-v1-results.json', import.meta.url).pathname, JSON.stringify(result, null, 1));
