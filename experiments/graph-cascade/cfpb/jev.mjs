// Jev stage via the lab's /api/jev endpoint. usage: node jev.mjs <split> <arm: text|company>
import fs from 'node:fs';
import { PRODUCTS, KEY } from './stage1.mjs';
const [split, arm] = process.argv.slice(2);
const LAB = 'https://typesafe-lab-276367410975.europe-west2.run.app/api/jev';
const rows = fs.readFileSync(`${split}.jsonl`, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const outF = `jev-${split}-${arm}.jsonl`;
const done = new Set(fs.existsSync(outF) ? fs.readFileSync(outF, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l).id) : []);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const q = { product: { type: 'choice', instructions: 'Which financial product is this consumer complaint about', criteria: PRODUCTS } };
let n = 0, ok = 0;
for (const r of rows) {
  if (done.has(r.id)) continue;
  const state = arm === 'company' ? `Company complained about: ${r.company}\n\nComplaint: ${r.text}` : r.text;
  const t0 = Date.now(); let out;
  for (let a = 0; a < 8; a++) {
    try {
      const res = await fetch(LAB, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ state, questions: q }) });
      if (res.status === 429 || res.status >= 500) { await sleep(10000); continue; }
      if (!res.ok) throw new Error(`HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
      out = await res.json(); break;
    } catch (e) { if (a === 7) throw e; await sleep(5000); }
  }
  const a = out.response.answers.product;
  fs.appendFileSync(outF, JSON.stringify({ id: r.id, choice: a.choice, probs: a.probabilities, conf: a.confidence, tokens: out.response.usage?.input_tokens, ms: out.ms }) + '\n');
  n++; if (a.choice === KEY[r.product]) ok++;
  const wait = 1050 - (Date.now() - t0); if (wait > 0) await sleep(wait);
}
console.log(split, arm, { new: n, acc_new: n ? +(ok / n).toFixed(3) : null });
