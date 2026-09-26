// Local-LLM stage for the Typed Decisions Lab cascade. Qwen2.5-1.5B-Instruct (Apache-2.0) via llama.cpp.
// POST /score {task, text} (bench-v1 or ticket tasks; few-shot from their train split) or
//            {question, examples?, text} for any Jev-shaped question. Nothing is logged.
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { createLlmStage } from './llm-stage.mjs';
const bench = JSON.parse(readFileSync('./bench-v1.json', 'utf8'));
const tickets = JSON.parse(readFileSync('./tickets-decisions.json', 'utf8'));
const TOKEN = (process.env.LAB_TOKEN || '').trim();
const TASKS = { ...Object.fromEntries(Object.keys(bench.questions).map((t) => [t, { q: bench.questions[t], ex: bench.train[t] }])) };
{ // ticket fixture: 16 per department, plus urgent/frustration from train
  const per = {}; const dept = []; for (const r of tickets.split.train) { const k = r.label.department; per[k] = (per[k] ?? 0) + 1; if (per[k] <= 8) dept.push({ text: r.text, label: k }); }
  TASKS.department = { q: tickets.gen0_questions.department, ex: dept };
  TASKS.urgent = { q: tickets.gen0_questions.urgent, ex: tickets.split.train.slice(0, 40).map((r) => ({ text: r.text, label: r.label.urgent })) };
  TASKS.frustration = { q: tickets.gen0_questions.frustration, ex: tickets.split.train.slice(0, 36).map((r) => ({ text: r.text, label: r.label.frustration })) };
}
const stage = await createLlmStage({ modelPath: './models/qwen2.5-1.5b-instruct-q4_k_m.gguf', threads: Number(process.env.THREADS || 4), template: 'chatml' });
const send = (res, s, o) => { res.writeHead(s, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
http.createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/healthz2') return send(res, 200, { ok: true, model: 'qwen2.5-1.5b-instruct-q4_k_m', cpus: cpus().length });
    if (req.method !== 'POST' || req.url !== '/score') return send(res, 404, { error: 'not found' });
    if (TOKEN && req.headers['x-lab-token'] !== TOKEN) return send(res, 401, { error: 'unauthorised' });
    let body = ''; for await (const c of req) { body += c; if (body.length > 65536) return send(res, 413, { error: 'too large' }); }
    const b = JSON.parse(body || '{}');
    if (typeof b.text !== 'string' || !b.text.trim() || b.text.length > 4000) return send(res, 400, { error: 'text required' });
    let q, ex, key;
    if (b.task && TASKS[b.task]) { q = TASKS[b.task].q; ex = TASKS[b.task].ex; key = b.task; }
    else if (b.question && ['choice', 'score', 'noul'].includes(b.question.type)) { q = b.question; ex = Array.isArray(b.examples) ? b.examples.slice(0, 60) : []; key = JSON.stringify([q, ex]); }
    else return send(res, 400, { error: 'task or question required' });
    const r = await stage.score(q, ex, b.text, key);
    send(res, 200, { ...r, model: 'qwen2.5-1.5b-instruct-q4_k_m' });
  } catch (e) { send(res, 500, { error: String(e.message || e).slice(0, 200) }); }
}).listen(Number(process.env.PORT || 8080), async () => {
  console.log('llm stage ready');
  // warm every task's cached prefix so the first real request is fast
  for (const [k, v] of Object.entries(TASKS)) { try { const t0 = Date.now(); await stage.score(v.q, v.ex, 'warm up', k); console.log('warmed', k, Date.now() - t0, 'ms'); } catch (e) { console.log('warm fail', k, e.message); } }
});
