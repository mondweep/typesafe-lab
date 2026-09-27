// FixMyStreet text stages: typesafe zero-shot and Jev, each choosing among the council's own categories.
// usage: node stages-fms.mjs typesafe | jev <split>
import fs from 'node:fs';
import { createRequire } from 'node:module';
const [stage, splitArg] = process.argv.slice(2);
const read = (f) => fs.readFileSync(f, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const C = JSON.parse(fs.readFileSync('counts.json', 'utf8'));
const MAXC = 80; // cap options per call (most frequent in the council's history)
const cands = (c) => Object.entries(C[c]).sort((a, b) => b[1] - a[1]).slice(0, MAXC).map(([k]) => k);
const keyOf = (cats) => Object.fromEntries(cats.map((k, i) => [`c${i}`, k]));
if (stage === 'typesafe') {
  const require = createRequire('/home/claude/ts/package.json');
  const { createTypesafe } = require('@ruvector/typesafe');
  const M = '/home/claude/ts/node_modules/@ruvector/typesafe/models';
  const ts = createTypesafe({ embedder: { kind: 'onnx', modelDir: M, manifest: `${M}/manifest.json` } });
  const out = {};
  for (const split of ['val', 'test']) {
    out[split] = [];
    for (const r of read(`${split}.jsonl`)) {
      const km = keyOf(cands(r.council));
      const res = await ts.systemOne({ state: `${r.title ?? ''}. ${r.text}`, questions: { cat: { type: 'choice', instructions: 'Which council service category does this street report belong to', criteria: km } } });
      const a = res.answers.cat;
      out[split].push({ id: r.id, probs: Object.fromEntries(Object.entries(a.probabilities).map(([k, v]) => [km[k], v])), choice: km[a.choice] });
    }
    const acc = out[split].filter((x, i) => x.choice === read(`${split}.jsonl`)[i].service_code).length / out[split].length;
    console.log('typesafe zero-shot', split, acc.toFixed(3));
  }
  fs.writeFileSync('stage1-typesafe.json', JSON.stringify(out));
} else {
  const LAB = 'https://typesafe-lab-276367410975.europe-west2.run.app/api/jev';
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const outF = `jev-${splitArg}.jsonl`;
  const done = new Set(fs.existsSync(outF) ? read(outF).map((x) => x.id) : []);
  for (const r of read(`${splitArg}.jsonl`)) {
    if (done.has(r.id)) continue;
    const km = keyOf(cands(r.council)); const t0 = Date.now(); let out;
    for (let a = 0; a < 8; a++) {
      const res = await fetch(LAB, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ state: `${r.title ?? ''}. ${r.text}`, questions: { cat: { type: 'choice', instructions: `Which ${r.council} service category does this street report belong to`, criteria: km } } }) }).catch(() => null);
      if (!res || res.status === 429 || res.status >= 500) { await sleep(10000); continue; }
      out = await res.json(); break;
    }
    const a = out.response.answers.cat;
    fs.appendFileSync(outF, JSON.stringify({ id: r.id, choice: km[a.choice], probs: Object.fromEntries(Object.entries(a.probabilities).map(([k, v]) => [km[k], v])), tokens: out.response.usage?.input_tokens }) + '\n');
    const w = 1050 - (Date.now() - t0); if (w > 0) await sleep(w);
  }
  const g = Object.fromEntries(read(`${splitArg}.jsonl`).map((r) => [r.id, r.service_code]));
  const rs = read(outF); console.log('jev', splitArg, (rs.filter((x) => x.choice === g[x.id]).length / rs.length).toFixed(3), 'tokens', Math.round(rs.reduce((s, x) => s + (x.tokens ?? 0), 0) / rs.length));
}
