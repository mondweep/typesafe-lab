// Shared benchmark logic for bench-v1 — used by the lab server (live reproduce) and the offline runner,
// so both compute exactly the same requests and metrics.

// Jev "with training data in state": the state becomes an object carrying the message plus the
// labelled training examples; the question refers to fields by backtick path (Jev's documented style).
export function jevWithDataRequest(bench, task, text, excludeId) {
  const q = bench.questions[task];
  const ex = bench.train[task].filter((e) => e.id !== excludeId);
  const label = (l) => (task === 'severity' ? q.criteria[l] : task === 'deadline' ? String(l) : l);
  const state = { message: text, labelled_examples: ex.map((e) => ({ text: e.text, label: label(e.label) })) };
  const lead = {
    council: 'Which council service should handle the enquiry in `message`? `labelled_examples` lists past enquiries with the service that correctly handled them.',
    severity: 'How severe is the safety risk described in the site observation in `message`? `labelled_examples` lists past observations with their correct severity.',
    deadline: '`message` asks the recipient to do something by a specific deadline or time. `labelled_examples` lists past messages labelled true or false for this.',
  }[task];
  return { state, questions: { [task]: { ...q, instructions: lead } } };
}
export function jevNoDataRequest(bench, task, text) {
  return { state: text, questions: { [task]: bench.questions[task] } };
}
// typesafe training examples in the engine's label vocabulary
export function tsTrainExamples(bench, task) {
  const q = bench.questions[task];
  return bench.train[task].map((e) => ({ text: e.text, label: task === 'severity' ? q.criteria[e.label] : task === 'deadline' ? (e.label ? 'yes' : 'no') : e.label }));
}

// Normalise an answer from either system into {pred, conf, score}
export function readAnswer(task, a) {
  if (!a) return null;
  if (task === 'council') return { pred: a.choice, conf: a.confidence, score: null };
  if (task === 'severity') { const s = typeof a.score === 'number' ? a.score : Number(a.score); return { pred: Math.max(0, Math.min(2, Math.round(s))), conf: a.confidence ?? null, score: s }; }
  return { pred: a.noul, conf: null, score: a.noul }; // deadline: probability, thresholded later
}

export function auroc(scores, labels) {
  const p = scores.filter((_, i) => labels[i]), n = scores.filter((_, i) => !labels[i]);
  if (!p.length || !n.length) return null;
  let w = 0; for (const a of p) for (const b of n) w += a > b ? 1 : a === b ? 0.5 : 0;
  return w / (p.length * n.length);
}
export function ece(pairs, bins = 10) {
  const b = Array.from({ length: bins }, () => ({ n: 0, c: 0, a: 0 }));
  for (const [c, ok] of pairs) { if (c == null) continue; const x = b[Math.min(bins - 1, Math.floor(c * bins))]; x.n++; x.c += c; x.a += ok ? 1 : 0; }
  const N = b.reduce((s, x) => s + x.n, 0);
  return N ? b.reduce((s, x) => s + (x.n ? (x.n / N) * Math.abs(x.c / x.n - x.a / x.n) : 0), 0) : null;
}
export function bestThreshold(scores, labels) {
  // every threshold that maximises train accuracy; return the middle of that plateau (ties are common
  // when train is separable, and picking the lowest edge would be arbitrary)
  const grid = []; for (let t = 0.02; t <= 0.98 + 1e-9; t += 0.01) grid.push(+t.toFixed(2));
  const acc = grid.map((t) => scores.filter((s, i) => (s >= t) === labels[i]).length / scores.length);
  const max = Math.max(...acc); const best = grid.filter((_, i) => acc[i] === max);
  return { thr: best[Math.floor(best.length / 2)], acc: max, plateau: [best[0], best[best.length - 1]] };
}

// rows: [{id, label, tag, ans:{pred,conf,score}}]; thr: deadline threshold (tuned on train)
export function metrics(task, rows, thr = 0.5) {
  const ok = rows.filter((r) => r.ans);
  const out = { n: rows.length, answered: ok.length };
  if (task === 'council') {
    out.accuracy = ok.filter((r) => r.ans.pred === r.label).length / ok.length;
    out.ece = ece(ok.map((r) => [r.ans.conf, r.ans.pred === r.label]));
    out.mean_conf = ok.reduce((s, r) => s + (r.ans.conf ?? 0), 0) / ok.length;
  } else if (task === 'severity') {
    out.accuracy = ok.filter((r) => r.ans.pred === r.label).length / ok.length;
    out.mae = ok.reduce((s, r) => s + Math.abs(r.ans.score - r.label), 0) / ok.length;
    const hi = ok.filter((r) => r.label === 2);
    out.high_recall = hi.filter((r) => r.ans.pred === 2).length / hi.length;
    out.high_missed_as_low = hi.filter((r) => r.ans.pred === 0).length;
  } else {
    out.auroc = auroc(ok.map((r) => r.ans.score), ok.map((r) => r.label));
    out.acc_05 = ok.filter((r) => (r.ans.score >= 0.5) === r.label).length / ok.length;
    out.threshold = thr;
    out.accuracy = ok.filter((r) => (r.ans.score >= thr) === r.label).length / ok.length;
  }
  return out;
}
export function correct(task, r, thr = 0.5) {
  if (!r.ans) return null;
  if (task === 'deadline') return (r.ans.score >= thr) === r.label;
  return r.ans.pred === r.label;
}
