const post = (p, b) => fetch('http://localhost:8099' + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }).then((r) => r.json());
const meta = await fetch('http://localhost:8099/api/meta').then((r) => r.json());
const states = ['What is the capital of Australia?', 'Write me a haiku about autumn leaves.', 'Please cancel my subscription and refund the last invoice.', 'My parcel is two weeks late'];
const crit = {};
for (const [k, v] of Object.entries(meta.questions.department.criteria)) crit[k] = { what: v, not_for: 'general knowledge, recipes, sport, poetry or anything unrelated to this company' };
const plain = await post('/api/sandbox', { questions: { department: meta.questions.department }, states });
const nf = await post('/api/sandbox', { questions: { department: { type: 'choice', instructions: 'x', criteria: crit } }, states });
for (let i = 0; i < states.length; i++) {
  const a = plain.answers[i].response.answers.department, b = nf.answers[i].response.answers.department;
  console.log(states[i].slice(0, 30), '| zero', a.choice, a.confidence.toFixed(2), a.abstain.toFixed(3), '| nf', b.choice, b.confidence.toFixed(2), b.abstain.toFixed(3));
}
const mk = (n) => { const ex = []; for (let i = 0; i < n; i++) ex.push({ text: `the app crashes error number ${i}`, label: 'bug' }, { text: `please add feature number ${i}`, label: 'feature' }, { text: `great work team thanks ${i}`, label: 'praise' }); return ex; };
for (const n of [6, 8, 20, 34, 40]) {
  const o = await post('/api/sandbox', { questions: { q: { type: 'choice', criteria: { bug: 'broken', feature: 'request', praise: 'compliment' } } }, examples: { q: mk(n) }, states: ['it crashed'] });
  const a = o.answers[0].response.answers.q;
  console.log('per-class', n, 'report', o.reports.q.head, o.reports.q.calibrated, 'answer', a.head, a.calibrated);
}
