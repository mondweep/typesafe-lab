import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { createTypesafe, choice } = require('/home/claude/rv/npm/packages/typesafe/dist/index.js');
const binding = require('/home/claude/oos/typesafe-catchall.node');
const M = '/home/claude/ts/node_modules/@ruvector/typesafe/models';
const OTHER = 'Anything that is not one of the other options';
const fx = JSON.parse(fs.readFileSync('/home/claude/rv/npm/packages/typesafe/bench/fixtures/tickets-decisions.json', 'utf8'));
const live = JSON.parse(fs.readFileSync('/home/claude/lab/receipts/jev-live.json', 'utf8')).oos.states;
const Q = fx.gen0_questions.department;
const tt = fx.split.test.slice(0, 100);
const items = [...tt.map((t) => [t.text, t.label.department, false]), ...live.oos.map((s) => [s, 'other', true])];
const ts = createTypesafe({ binding, warnOnHashEmbedder: false, embedder: { kind: 'onnx', modelDir: M, manifest: `${M}/manifest.json` }, engine: { catchAll: 'other', catchAllThreshold: 2 } });
const q = { q: choice({ ...Q.criteria, other: OTHER }, Q.instructions ?? '') };
const ans = (await ts.decideMany(items.map((x) => x[0]), q)).map((r) => r.q);
const p = ans.map((a) => a.probabilities.other);
const real = (a) => Object.entries(a.probabilities).filter(([k]) => k !== 'other').sort((x, y) => y[1] - x[1])[0][0];
const idx = items.map((_, i) => i), A = idx.filter((i) => i % 2 === 0), B = idx.filter((i) => i % 2 === 1);
const rate = (ix, f) => ix.filter(f).length / ix.length;
function tune(ix) { let best = { j: -1 }; for (const t of [...new Set(ix.map((i) => p[i]))].sort()) { const j = rate(ix.filter((i) => items[i][2]), (i) => p[i] >= t) - rate(ix.filter((i) => !items[i][2]), (i) => p[i] >= t); if (j > best.j) best = { j, t }; } return best.t; }
function evalOn(ix, t) { const oos = ix.filter((i) => items[i][2]), ins = ix.filter((i) => !items[i][2]);
  return { thr: +t.toFixed(4), oos_caught: +rate(oos, (i) => p[i] >= t).toFixed(3), false_alarms: +rate(ins, (i) => p[i] >= t).toFixed(3), in_scope_acc: +rate(ins, (i) => p[i] < t && real(ans[i]) === items[i][1]).toFixed(3) }; }
const auroc = (() => { const pos = idx.filter((i) => items[i][2]).map((i) => p[i]), neg = idx.filter((i) => !items[i][2]).map((i) => p[i]); let w = 0; for (const a of pos) for (const b of neg) w += a > b ? 1 : a === b ? 0.5 : 0; return w / (pos.length * neg.length); })();
const r = { auroc: +auroc.toFixed(3), tuneA_testB: evalOn(B, tune(A)), tuneB_testA: evalOn(A, tune(B)), median_p_in: p.filter((_, i) => !items[i][2]).sort()[50], median_p_oos: p.filter((_, i) => items[i][2]).sort()[53] };
console.log(JSON.stringify(r));
const prev = JSON.parse(fs.readFileSync('catchall-results.json', 'utf8')); prev.tickets_split_tuned = r; fs.writeFileSync('catchall-results.json', JSON.stringify(prev, null, 1));
