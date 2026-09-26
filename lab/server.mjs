// typesafe learning lab — live @ruvector/typesafe engines (native + ONNX bge-small
// INT8) next to Jev's recorded responses on the same frozen tickets.
import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTypesafe } from './vendor/typesafe/dist/index.js';
import * as BC from './bench-core.mjs';
import { createRerankerStage } from './rr-stage.mjs';
import { norm } from './cascade-core.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = join(HERE, 'vendor/typesafe');
const MODEL = process.env.TYPESAFE_MODEL || 'bge-small-en-v1.5-int8';
const PORT = Number(process.env.PORT || 8080);
const embedder = { kind: 'onnx', modelDir: join(PKG, 'models'), manifest: join(PKG, 'models/manifest.json'), model: MODEL };

const fx = JSON.parse(readFileSync(join(HERE, 'data/tickets-decisions.json'), 'utf8'));
const jev = JSON.parse(readFileSync(join(HERE, 'data/jev-baseline-2026-09-21.json'), 'utf8'));
const evidence = JSON.parse(readFileSync(join(HERE, 'data/evidence.json'), 'utf8'));
const bench = JSON.parse(readFileSync(join(HERE, 'data/bench-v1.json'), 'utf8'));
const benchResults = existsSync(join(HERE, 'data/bench-v1-results.json')) ? JSON.parse(readFileSync(join(HERE, 'data/bench-v1-results.json'), 'utf8')) : null;
const QUESTIONS = fx.gen0_questions;
const LEGEND = QUESTIONS.frustration.criteria;

// ---- engines -------------------------------------------------------------
const zero = createTypesafe({ embedder });
const trained = createTypesafe({ embedder });
const benchTrained = createTypesafe({ embedder });
const reranker = await createRerankerStage(join(HERE, 'models/rr-xsmall'));
const cascadeRef = existsSync(join(HERE, 'data/cascade-v1.json')) ? JSON.parse(readFileSync(join(HERE, 'data/cascade-v1.json'), 'utf8')) : null;
const LLM_URL = process.env.LLM_URL || '';
const LLM_TOKEN = (process.env.LAB_TOKEN || '').trim();
async function callLlm(task, text) {
  if (!LLM_URL) return { error: 'local LLM stage not configured' };
  const t0 = performance.now();
  try {
    const r = await fetch(LLM_URL + '/score', { method: 'POST', headers: { 'content-type': 'application/json', 'x-lab-token': LLM_TOKEN }, body: JSON.stringify({ task, text }), signal: AbortSignal.timeout(90000) });
    const j = await r.json(); if (!r.ok) return { error: j.error || String(r.status) };
    return { ...j, ms_total: performance.now() - t0 };
  } catch (e) { return { error: String(e.message || e) }; }
}
async function cascadeStages(task, text, ip) {
  const q = bench.questions[task];
  const thr = benchResults?.arms?.ts_trained?.tasks?.deadline?.metrics?.threshold ?? 0.5;
  const jthr = benchResults?.arms?.jev_zero?.tasks?.deadline?.metrics?.threshold ?? 0.5;
  const t0 = performance.now(); const tsA = (await benchTrained.systemOne({ state: text, questions: { [task]: q } })).answers[task]; const tsMs = performance.now() - t0;
  const tsN = norm(task, 'ts', { ...BC.readAnswer(task, tsA), probabilities: tsA.probabilities }, thr);
  const rrR = await reranker.score(q, text);
  const [llmR, jevR] = await Promise.all([callLlm(task, text), JEV_KEY ? callJev(BC.jevNoDataRequest(bench, task, text), ip, 400).catch((e) => ({ error: e.message })) : Promise.resolve({ error: 'Jev not configured' })]);
  const jA = jevR.error ? null : jevR.response.answers[task];
  return {
    ts: { ...tsN, ms: +tsMs.toFixed(1), head: tsA.head },
    rr: { ...norm(task, 'rr', rrR), ms: +rrR.ms.toFixed(1) },
    llm: llmR.error ? { error: llmR.error } : { ...norm(task, 'llm', llmR), ms: +llmR.ms_total.toFixed(0), compute_ms: +llmR.ms.toFixed(0) },
    jev: jA ? { ...norm(task, 'jev', { ...BC.readAnswer(task, jA), probabilities: jA.probabilities, confidence: jA.confidence }, jthr), ms: jevR.ms } : { error: jevR.error },
  };
}
const SHOTS = 16;
const bootReport = {};
{
  const per = {};
  const dept = [];
  for (const r of fx.split.train) {
    const k = r.label.department;
    per[k] = (per[k] ?? 0) + 1;
    if (per[k] <= SHOTS) dept.push({ text: r.text, label: k });
  }
  bootReport.department = await trained.train('department', dept);
  bootReport.urgent = await trained.train('urgent', fx.split.train.map((r) => ({ text: r.text, label: r.label.urgent ? 'yes' : 'no' })));
  bootReport.frustration = await trained.train('frustration', fx.split.train.map((r) => ({ text: r.text, label: LEGEND[r.label.frustration] })));
  bootReport.examples = { department: dept.length, urgent: fx.split.train.length, frustration: fx.split.train.length };
  for (const t of Object.keys(bench.questions)) bootReport['bench_' + t] = await benchTrained.train(t, BC.tsTrainExamples(bench, t));
  // heads are fitted lazily on first use — warm both engines so the first visitor isn't billed for it
  await trained.systemOne({ state: 'warm up', questions: QUESTIONS });
  await zero.systemOne({ state: 'warm up', questions: QUESTIONS });
}

// Jev's recorded gen-0 answers for the 150 frozen test tickets.
const jevById = new Map(jev.test_rows.baseline.map((r) => [r.id, r]));
const tickets = fx.split.test.map((t) => {
  const j = jevById.get(t.id);
  return {
    id: t.id, text: t.text, label: t.label, ambiguous: t.ambiguous, secondary: t.secondary,
    jev: j ? { pred: j.pred, confidence: j.confidence, probabilities: j.probabilities, latencyMs: Math.round(j.latencyMs), tokens: j.tokens } : null,
  };
});

// ---- sandbox (per-request engine, bounded) ---------------------------------
let inflight = 0;
const MAX_SANDBOX = 2;

async function sandbox(body) {
  const { questions, examples = {}, states = [] } = body;
  if (!questions || typeof questions !== 'object') throw httpErr(400, 'questions required');
  if (!Array.isArray(states) || states.length === 0 || states.length > 25) throw httpErr(400, '1-25 states');
  let total = 0;
  for (const v of Object.values(examples)) total += Array.isArray(v) ? v.length : 0;
  if (total > 600) throw httpErr(400, 'max 600 examples');
  if (inflight >= MAX_SANDBOX) throw httpErr(429, 'sandbox busy, retry in a moment');
  inflight++;
  try {
    const t0 = performance.now();
    const ts = createTypesafe({ embedder });
    const reports = {};
    for (const [qid, ex] of Object.entries(examples)) {
      if (!Array.isArray(ex) || ex.length === 0) continue;
      reports[qid] = await ts.train(qid, ex.map((e) => ({ text: String(e.text), label: String(e.label) })));
    }
    const tTrain = performance.now();
    const answers = [];
    for (const s of states) {
      const a0 = performance.now();
      const res = await ts.systemOne({ state: String(s), questions });
      answers.push({ state: s, ms: +(performance.now() - a0).toFixed(1), response: res });
    }
    return { reports, answers, timings: { engine_and_train_ms: Math.round(tTrain - t0) } };
  } finally {
    inflight--;
  }
}

// ---- http ----------------------------------------------------------------
function httpErr(status, message) { const e = new Error(message); e.status = status; return e; }
async function readJson(req) {
  let size = 0; const chunks = [];
  for await (const c of req) { size += c.length; if (size > 256 * 1024) throw httpErr(413, 'body too large'); chunks.push(c); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { throw httpErr(400, 'invalid JSON'); }
}
function send(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(body);
}
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.mp4': 'video/mp4', '.json': 'application/json' };

async function timed(ts, payload, opts) {
  const t0 = performance.now();
  const response = await ts.systemOne(payload, opts);
  return { ms: +(performance.now() - t0).toFixed(1), response };
}

// ---- live Jev proxy (key from Secret Manager env; never sent to the browser) ----
const JEV_KEY = (process.env.JEV_API_KEY || '').trim();
const JEV_DAILY_CAP = Number(process.env.JEV_DAILY_CAP || 20000);
const jevDay = { day: '', n: 0, tokens: 0 };
const ipHits = new Map();
function jevGuard(ip, perMin = 60) {
  const d = new Date().toISOString().slice(0, 10);
  if (jevDay.day !== d) { jevDay.day = d; jevDay.n = 0; jevDay.tokens = 0; ipHits.clear(); }
  if (jevDay.n >= JEV_DAILY_CAP) throw httpErr(429, 'daily Jev budget for this lab reached, try tomorrow');
  const now = Date.now(); const h = (ipHits.get(ip) || []).filter((t) => now - t < 60000);
  if (h.length >= perMin) throw httpErr(429, `slow down: max ${perMin} Jev calls per minute per visitor`);
  h.push(now); ipHits.set(ip, h); jevDay.n++;
}
async function callJev(body, ip, perMin = 60) {
  if (!JEV_KEY) throw httpErr(503, 'live Jev not configured');
  jevGuard(ip, perMin);
  const t0 = performance.now();
  const r = await fetch('https://api.typesafe.ai/v1/systemone', { method: 'POST', headers: { authorization: `Bearer ${JEV_KEY}`, 'content-type': 'application/json' }, body: JSON.stringify({ model: 'jev-latest', state: body.state, questions: body.questions }) });
  const ms = +(performance.now() - t0).toFixed(1);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw httpErr(r.status === 422 ? 400 : 502, `Jev ${r.status}: ${(j && (j.error?.message || j.detail || j.error)) || 'error'}`.slice(0, 300));
  jevDay.tokens += j.usage?.input_tokens || 0;
  return { ms, response: j };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const t0 = performance.now();
  try {
    if (req.method === 'GET' && url.pathname === '/api/meta') {
      return send(res, 200, { model: MODEL, backend: 'native (napi-rs) + ONNX Runtime', package: '@ruvector/typesafe 0.1.0 @ ruvnet/RuVector 5356a84', questions: QUESTIONS, boot: bootReport, shots: SHOTS, jevLive: !!JEV_KEY, jev: { endpoint: jev.endpoint, model_reported: jev.model_reported, protocol: jev.protocol, dataset: jev.dataset } });
    }
    if (req.method === 'GET' && url.pathname === '/api/tickets') return send(res, 200, tickets);
    if (req.method === 'GET' && url.pathname === '/api/evidence') return send(res, 200, evidence);
    if (req.method === 'POST' && url.pathname === '/api/decide') {
      const b = await readJson(req);
      if (typeof b.state !== 'string' || !b.state.trim()) throw httpErr(400, 'state required');
      const questions = b.questions || QUESTIONS;
      const out = {};
      const modes = b.mode === 'both' || !b.mode ? ['zero', 'trained'] : [b.mode];
      for (const m of modes) out[m] = await timed(m === 'zero' ? zero : trained, { state: b.state, questions });
      return send(res, 200, out);
    }
    if (req.method === 'POST' && url.pathname === '/api/sandbox') return send(res, 200, await sandbox(await readJson(req)));
    if (req.method === 'POST' && url.pathname === '/api/jev') {
      const b = await readJson(req);
      const sl = typeof b.state === 'string' ? b.state.trim().length : b.state && typeof b.state === 'object' ? JSON.stringify(b.state).length : 0;
      if (!sl || sl > 65536) throw httpErr(400, 'state required (string or object, ≤64 KiB)');
      if (!b.questions || typeof b.questions !== 'object' || Object.keys(b.questions).length > 16) throw httpErr(400, '1-16 questions');
      const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress;
      return send(res, 200, await callJev(b, ip));
    }
    if (req.method === 'GET' && url.pathname === '/api/bench') return send(res, 200, { dataset: bench, results: benchResults, thresholds: benchResults ? Object.fromEntries(Object.entries(benchResults.arms).map(([a, v]) => [a, v.tasks.deadline?.metrics.threshold ?? 0.5])) : null });
    if (req.method === 'POST' && url.pathname === '/api/bench/item') {
      const b = await readJson(req);
      const item = bench.test[b.task]?.find((x) => x.id === b.id);
      if (!item) throw httpErr(400, 'unknown task/id');
      const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress;
      const q = { [b.task]: bench.questions[b.task] };
      const t0 = performance.now(); const z = await zero.systemOne({ state: item.text, questions: q }); const zms = performance.now() - t0;
      const t1 = performance.now(); const tr = await benchTrained.systemOne({ state: item.text, questions: q }); const tms = performance.now() - t1;
      const out = { ts_zero: { ms: +zms.toFixed(1), a: z.answers[b.task] }, ts_trained: { ms: +tms.toFixed(1), a: tr.answers[b.task] } };
      if (JEV_KEY) {
        const [j0, j1] = await Promise.all([
          callJev(BC.jevNoDataRequest(bench, b.task, item.text), ip, 400).catch((e) => ({ error: e.message })),
          callJev(BC.jevWithDataRequest(bench, b.task, item.text, item.id), ip, 400).catch((e) => ({ error: e.message })),
        ]);
        out.jev_zero = j0.error ? { error: j0.error } : { ms: j0.ms, a: j0.response.answers[b.task], tokens: j0.response.usage?.input_tokens };
        out.jev_data = j1.error ? { error: j1.error } : { ms: j1.ms, a: j1.response.answers[b.task], tokens: j1.response.usage?.input_tokens };
      }
      return send(res, 200, out);
    }
    const DL = { '/downloads/bench-v1.json': 'data/bench-v1.json', '/downloads/bench-v1-results.json': 'data/bench-v1-results.json', '/downloads/run-bench.mjs': 'run-bench.mjs', '/downloads/bench-core.mjs': 'bench-core.mjs' };
    if (req.method === 'GET' && DL[url.pathname] && existsSync(join(HERE, DL[url.pathname]))) { res.writeHead(200, { 'content-type': url.pathname.endsWith('.json') ? 'application/json' : 'text/javascript; charset=utf-8', 'content-disposition': `attachment; filename="${url.pathname.split('/').pop()}"` }); return res.end(readFileSync(join(HERE, DL[url.pathname]))); }
    if (req.method === 'GET' && url.pathname === '/api/cascade') return send(res, 200, cascadeRef || { error: 'no reference run' });
    if (req.method === 'POST' && (url.pathname === '/api/cascade/item' || url.pathname === '/api/cascade/message')) {
      const b = await readJson(req);
      if (!bench.questions[b.task]) throw httpErr(400, 'unknown task');
      let text = b.text;
      if (url.pathname.endsWith('/item')) { const it = bench.test[b.task].find((x) => x.id === b.id); if (!it) throw httpErr(400, 'unknown id'); text = it.text; }
      if (typeof text !== 'string' || !text.trim() || text.length > 2000) throw httpErr(400, 'text required (≤2000 chars)');
      const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress;
      return send(res, 200, await cascadeStages(b.task, text, ip));
    }
    if (req.method === 'GET' && url.pathname === '/cascade-core.mjs') { res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' }); return res.end(readFileSync(join(HERE, 'cascade-core.mjs'))); }
    if (req.method === 'GET' && url.pathname === '/bench-core.mjs') { res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' }); return res.end(readFileSync(join(HERE, 'bench-core.mjs'))); }
    if (req.method === 'GET' && url.pathname === '/api/jev/status') return send(res, 200, { enabled: !!JEV_KEY, calls_today: jevDay.n, cap: JEV_DAILY_CAP, input_tokens_today: jevDay.tokens });
    if (req.method === 'POST' && url.pathname === '/v1/systemone') {
      // Jev-compatible drop-in (trained engine). ?jevShapeOnly=1 strips additive fields.
      const b = await readJson(req);
      const r = await trained.systemOne(b, { jevShapeOnly: url.searchParams.get('jevShapeOnly') === '1' });
      return send(res, 200, r);
    }
    if (req.method === 'GET' && url.pathname === '/healthz') return send(res, 200, { ok: true });
    if (req.method === 'GET') {
      const p = url.pathname === '/' ? '/index.html' : url.pathname === '/story' ? '/story.html' : url.pathname;
      const file = join(HERE, 'public', p.replace(/\.\.+/g, ''));
      if (file.startsWith(join(HERE, 'public')) && existsSync(file)) {
        res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream', 'cache-control': 'public, max-age=300' });
        return res.end(readFileSync(file));
      }
    }
    send(res, 404, { error: 'not found' });
  } catch (e) {
    send(res, e.status || 500, { error: e.message || String(e) });
  } finally {
    // access log: method, path, status, ms only (never the state text)
    console.log(`${req.method} ${url.pathname} ${res.statusCode} ${(performance.now() - t0).toFixed(1)}ms`);
  }
});
server.listen(PORT, () => console.log(`typesafe lab on :${PORT} model=${MODEL}`));
