// OOS scoring on CLINC150 with the published @ruvector/typesafe (ONNX bge-small, zero-shot).
// Recovers each item's max prototype cosine m from the engine's own output, then compares
// the current (K+1)-softmax abstain with K-independent alternatives. Prototype head, no not_for.
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire('/home/claude/ts/package.json');
const { createTypesafe, choice } = require('@ruvector/typesafe');
const M = '/home/claude/ts/node_modules/@ruvector/typesafe/models';
const D = JSON.parse(fs.readFileSync('data_full.json', 'utf8'));
const hum = (l) => String(l).replace(/[._]+/g, ' ').replace(/\s+/g, ' ').trim();
const TAU = 0.35, SCALE = 0.5;
const ts = createTypesafe({ embedder: { kind: 'onnx', modelDir: M, manifest: `${M}/manifest.json` } });

function auroc(pos, neg) { // P(score_pos > score_neg), ties 0.5
  const all = [...pos.map((s) => [s, 1]), ...neg.map((s) => [s, 0])].sort((a, b) => a[0] - b[0]);
  let r = 0, i = 0, rankSumPos = 0;
  while (i < all.length) { let j = i; while (j < all.length && all[j][0] === all[i][0]) j++; const avg = (i + j + 1) / 2; for (let k = i; k < j; k++) if (all[k][1]) rankSumPos += avg; i = j; }
  r = (rankSumPos - pos.length * (pos.length + 1) / 2) / (pos.length * neg.length); return r;
}
const sigmoid = (x) => 1 / (1 + Math.exp(-x));

async function run(labels, inItems, oosItems, tag) {
  const q = { intent: choice(Object.fromEntries(labels.map((l) => [l, hum(l)])), 'Which assistant intent does this utterance express') };
  const rows = [];
  for (const [text, label, oos] of [...inItems.map((x) => [...x, false]), ...oosItems.map((x) => [x[0], 'oos', true])]) {
    const r = await ts.decide(text, q);
    const a = r.intent;
    const probs = a.probabilities; const pmax = Math.max(...Object.values(probs));
    const A = a.abstain, T = a.temperature || 1;
    // T·log(A/((1-A)·pmax)) = (TAU - m)/SCALE - m  =>  m
    const m = (TAU / SCALE - T * Math.log(A / ((1 - A) * pmax))) / (1 / SCALE + 1);
    const K = labels.length;
    rows.push({ oos, correct: a.choice === label, A, m,
      // candidate K-independent scores
      sigmoid: sigmoid((TAU - m) / SCALE),               // sigmoid of the existing abstain logit
      normK: (() => { // (K+1)-softmax with the abstain logit shifted by ln K
        const s = Object.values(probs).map((p) => m + T * Math.log(p / pmax));
        const z = s.reduce((acc, v) => acc + Math.exp(v / T), 0); const e = Math.exp(((TAU - m) / SCALE + Math.log(K)) / T); return e / (z + e);
      })() });
  }
  const pos = (k) => rows.filter((r) => r.oos).map((r) => r[k]), neg = (k) => rows.filter((r) => !r.oos).map((r) => r[k]);
  const out = { tag, K: labels.length, n_in: inItems.length, n_oos: oosItems.length,
    in_scope_acc: rows.filter((r) => !r.oos && r.correct).length / inItems.length };
  for (const k of ['A', 'sigmoid', 'normK']) {
    const p = pos(k), n = neg(k);
    out[k] = { auroc: +auroc(p, n).toFixed(4), median_oos: +p.sort((a, b) => a - b)[p.length >> 1].toFixed(4), median_in: +n.sort((a, b) => a - b)[n.length >> 1].toFixed(4) };
  }
  // consistency check: does sigmoid(recovered logit) rank exactly as -m?
  out.m_auroc = +auroc(pos('m').map((x) => -x), neg('m').map((x) => -x)).toFixed(4);
  out.rows_sig = rows.map((r) => [r.oos ? 1 : 0, +r.sigmoid.toFixed(5), +r.A.toExponential(3)]);
  return { out, rows };
}

const labels150 = [...new Set(D.train.map((x) => x[1]))].sort();
const r150 = await run(labels150, D.test, D.oos_test, 'CLINC150, 150 intents');
const v150 = await run(labels150, D.val, D.oos_val, 'CLINC150 val');
const strip = (o) => { const { rows_sig, ...rest } = o; return rest; };
console.log(JSON.stringify(strip(r150.out)));
// 8-intent check: 5 random 8-intent subsets (seeded), in-scope test items of those intents + all OOS test items
let seed = 7; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const small = [];
for (let s = 0; s < 5; s++) {
  const pick = [...labels150].sort(() => rnd() - 0.5).slice(0, 8).sort();
  const r = await run(pick, D.test.filter((x) => pick.includes(x[1])), D.oos_test.slice(0, 200), `8 intents #${s}`);
  console.log(JSON.stringify(strip(r.out))); small.push(r.out);
}
fs.writeFileSync('oos-results.json', JSON.stringify({ k150: r150.out, v150: v150.out, k8: small }));
