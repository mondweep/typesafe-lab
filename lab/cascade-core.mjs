// Cascade policy shared by the offline evaluator, the server and the browser.
// Stage order: typesafe (trained) → cross-encoder reranker → local LLM → Jev (optional).
// Each stage answers when its confidence ≥ its threshold; otherwise the message goes to the next stage.
// The last enabled stage always answers.

// Normalise any stage output to {pred, conf}. For noul tasks `pred` is boolean.
export function norm(task, stage, x, thr = 0.5) {
  if (!x) return null;
  if (stage === 'ts' || stage === 'jev') {
    if (task === 'deadline') { const s = x.score ?? x.noul; return { pred: s >= thr, conf: Math.min(1, Math.abs(s - thr) / Math.max(thr, 1 - thr)) }; }
    if (task === 'severity') { const probs = x.probabilities ? (Array.isArray(x.probabilities) ? x.probabilities : Object.values(x.probabilities)) : null; return { pred: x.pred ?? Math.round(x.score), conf: x.conf ?? (probs ? Math.max(...probs) : 0.5) }; }
    return { pred: x.pred ?? x.choice, conf: x.conf ?? x.confidence ?? 0.5 };
  }
  // reranker / llm rows: {keys, probs}
  const i = x.probs.indexOf(Math.max(...x.probs));
  return { pred: x.keys[i], conf: x.probs[i] };
}

// items: [{label, stages:{ts,rr,llm,jev}: {pred,conf,ms}}]; cfg: {use:{rr,llm,jev}, t:{ts,rr,llm}}
export function simulate(items, cfg) {
  const order = ['ts', ...(cfg.use.rr ? ['rr'] : []), ...(cfg.use.llm ? ['llm'] : []), ...(cfg.use.jev ? ['jev'] : [])];
  const handled = Object.fromEntries(order.map((s) => [s, { n: 0, ok: 0 }]));
  let ok = 0, ms = 0, jevCalls = 0;
  for (const it of items) {
    let ans = null, cost = 0;
    for (let k = 0; k < order.length; k++) {
      const s = order[k]; const x = it.stages[s]; if (!x) continue;
      cost += x.ms ?? 0; if (s === 'jev') jevCalls++;
      const last = k === order.length - 1;
      if (last || x.conf >= (cfg.t[s] ?? 0)) { ans = x; handled[s].n++; if (x.pred === it.label) { handled[s].ok++; } break; }
    }
    if (ans && ans.pred === it.label) ok++;
    ms += cost;
  }
  const n = items.length;
  return { accuracy: ok / n, mean_ms: ms / n, jev_share: jevCalls / n, handled: Object.fromEntries(Object.entries(handled).map(([s, v]) => [s, { share: v.n / n, accuracy: v.n ? v.ok / v.n : null }])) };
}
