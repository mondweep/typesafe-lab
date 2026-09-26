// Option lists shared by the reranker and LLM stages. `hyp` is the option text the reranker was trained on;
// `text` is what the LLM sees next to its letter.
export function optionsFor(q) {
  if (q.type === 'choice') return Object.entries(q.criteria).map(([k, v]) => { const d = typeof v === 'string' ? v : v.what; return { key: k, hyp: d, text: `${k}: ${d}` }; });
  if (q.type === 'score') return q.criteria.map((t, i) => ({ key: i, hyp: t, text: t }));
  return [{ key: true, hyp: 'yes', text: 'yes' }, { key: false, hyp: 'no', text: 'no' }];
}
