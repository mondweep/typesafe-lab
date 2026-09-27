// kge -> Jev cascade on WN18RR (tail prediction): kge retrieves the filtered top-K,
// Jev (via the lab's /api/jev playground endpoint) picks one. Mirrors the lab cascade.
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { loadKge } = require('@ruvector/kge');
const [dir, modelPath, kArg = '10', limitArg = '999'] = process.argv.slice(2);
const K = parseInt(kArg, 10);
const LAB = 'https://typesafe-lab-276367410975.europe-west2.run.app/api/jev';
const read = (s) => fs.readFileSync(`${dir}/${s}.txt`, 'utf8').trim().split('\n').map((l) => l.split('\t'));
const all = [...read('train'), ...read('valid'), ...read('test')];
const known = new Map();
for (const [s, r, o] of all) { const k = `${s}|${r}`; (known.get(k) ?? known.set(k, new Set()).get(k)).add(o); }
const kge = loadKge(JSON.parse(fs.readFileSync(modelPath, 'utf8')));
const test = read('test').slice(0, parseInt(limitArg, 10));
const words = (syn) => { const [w, pos] = syn.split('.'); return `${w.replace(/_/g, ' ')} (${{ n: 'noun', v: 'verb', a: 'adjective', s: 'adjective', r: 'adverb' }[pos] ?? pos})`; };
const relText = { _hypernym: 'is a kind of', _derivationally_related_form: 'is a derivationally related word form of', _instance_hypernym: 'is an instance of', _also_see: 'is related (see also) to', _member_meronym: 'has as a member', _synset_domain_topic_of: 'belongs to the topic domain of', _has_part: 'has as a part', _member_of_domain_usage: 'has usage-domain member', _member_of_domain_region: 'has region-domain member', _verb_group: 'is in the same verb group as', _similar_to: 'is similar to' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function jev(state, questions) {
  for (let a = 0; a < 5; a++) {
    const res = await fetch(LAB, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ state, questions }) });
    if (res.status === 429) { await sleep(15000); continue; }
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return res.json();
  }
  throw new Error('rate limited');
}
let n = 0, kH1 = 0, kHK = 0, jH1 = 0, jInK = 0, tokens = 0; const rows = [];
for (const [s, r, o] of test) {
  const others = known.get(`${s}|${r}`); // filtered setting
  const res = kge.predict({ s, r, k: K + others.size, useIndex: false });
  const cands = res.candidates.map((c) => c.entity).filter((e) => e === o || !others.has(e)).slice(0, K);
  n++; const inK = cands.includes(o); if (cands[0] === o) kH1++; if (inK) kHK++;
  const criteria = Object.fromEntries(cands.map((c) => [c, words(c)]));
  const q = { answer: { type: 'choice', instructions: `Pick the option that correctly completes this WordNet fact: "${words(s)}" ${relText[r] ?? r} ___`, criteria } };
  const out = await jev(`WordNet fact to complete. Subject: ${s}. Relation: ${r}.`, q);
  const pick = out.response.answers.answer.choice; tokens += out.response.usage?.input_tokens ?? 0;
  if (pick === o) jH1++; if (inK && pick === o) jInK++;
  rows.push({ s, r, o, kgeTop: cands[0], jev: pick, inK });
  await sleep(1100); // stay under the 60/min per-visitor limit
}
console.log(JSON.stringify({ n, K, kgeHits1: +(kH1 / n).toFixed(3), kgeHitsK: +(kHK / n).toFixed(3), cascadeHits1: +(jH1 / n).toFixed(3), jevWhenGoldInK: +(jInK / Math.max(kHK, 1)).toFixed(3), meanTokens: Math.round(tokens / n) }));
fs.writeFileSync('jev-rerank-rows.json', JSON.stringify(rows, null, 1));
