// Evaluate the local-LLM stage on bench-v1 test (all items), few-shot from the train split.
//   node run-llm-stage.mjs <model.gguf> <template chatml|phi3> <out.json> [limitPerTask]
import { readFileSync, writeFileSync } from 'node:fs';
import { createLlmStage } from './llm-stage.mjs';
const [modelPath, template = 'chatml', out = 'llm-test.json', lim] = process.argv.slice(2);
const bench = JSON.parse(readFileSync(new URL('./data/bench-v1.json', import.meta.url), 'utf8'));
const stage = await createLlmStage({ modelPath, template, threads: Number(process.env.THREADS || 2) });
const res = {};
for (const task of Object.keys(bench.questions)) {
  const q = bench.questions[task]; const items = bench.test[task].slice(0, lim ? +lim : undefined);
  const rows = []; let first = true;
  for (const it of items) {
    const r = await stage.score(q, bench.train[task], it.text, task);
    rows.push({ id: it.id, label: it.label, tag: it.tag, ...r, first });
    first = false;
  }
  const acc = rows.filter((r) => r.pred === r.label).length / rows.length;
  const warm = rows.filter((r) => !r.first).map((r) => r.ms).sort((a, b) => a - b);
  res[task] = { accuracy: acc, prefix_ms: Math.round(rows[0].ms), median_ms: Math.round(warm[Math.floor(warm.length / 2)]), rows };
  console.log(task, 'acc', (acc * 100).toFixed(1) + '%', 'first(prefix) ms', Math.round(rows[0].ms), 'median ms', res[task].median_ms);
}
writeFileSync(out, JSON.stringify({ model: modelPath.split('/').pop(), template, res }, null, 1));
