'use strict';
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pct = (x, d = 1) => (x == null || Number.isNaN(x) ? '—' : (x * 100).toFixed(d) + '%');
const num = (x, d = 3) => (x == null ? '—' : Number(x).toFixed(d));
async function api(path, body) {
  const r = await fetch(path, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {});
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || r.statusText);
  return j;
}
const S = { meta: null, tickets: [], ev: null, sel: null };

// ---------- theme + tabs ----------
$('#themeBtn').onclick = () => {
  const cur = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  document.documentElement.dataset.theme = cur === 'dark' ? 'light' : 'dark';
};
function show(page) {
  $$('nav.tabs button').forEach((b) => b.setAttribute('aria-selected', b.dataset.page === page));
  $$('section.page').forEach((s) => s.classList.toggle('active', s.id === 'page-' + page));
  if (location.hash !== '#' + page) history.replaceState(null, '', '#' + page);
  window.scrollTo(0, 0);
}
$$('nav.tabs button').forEach((b) => (b.onclick = () => show(b.dataset.page)));
// prev / next pager at the bottom of every page
(function addPagers() {
  const tabs = $$('nav.tabs button').map((b) => [b.dataset.page, [...b.childNodes].filter((n) => !(n.classList && n.classList.contains('short'))).map((n) => n.textContent).join('')]);
  tabs.forEach(([page], i) => {
    const sec = $('#page-' + page); if (!sec) return;
    const prev = tabs[i - 1], next = tabs[i + 1];
    sec.insertAdjacentHTML('beforeend', `<div class="pager">${prev ? `<button data-go="${prev[0]}"><small>← Previous</small>${esc(prev[1])}</button>` : ''}${next ? `<button class="next" data-go="${next[0]}"><small>Next →</small>${esc(next[1])}</button>` : ''}</div>`);
  });
  $$('.pager button').forEach((b) => (b.onclick = () => show(b.dataset.go)));
})();

// ---------- shared renderers ----------
function bars(probs, { truth, top } = {}) {
  const entries = Array.isArray(probs) ? probs.map((v, i) => [String(i), v]) : Object.entries(probs || {});
  entries.sort((a, b) => b[1] - a[1]);
  return `<div class="bars">${entries.map(([k, v]) => `<div class="bar ${k === top ? 'top' : ''} ${k === truth ? 'truth' : ''}"><span class="label">${esc(k)}${k === truth ? ' ✓' : ''}</span><span class="track"><span class="fill" style="width:${Math.max(0, Math.min(1, v)) * 100}%"></span></span><span class="v">${pct(v, 0)}</span></div>`).join('')}</div>`;
}
function okPill(ok) { return ok ? '<span class="pill good">correct</span>' : '<span class="pill bad">wrong</span>'; }
function flags(a) {
  if (!a) return '';
  return `<div class="row small" style="margin-top:6px;gap:6px"><span class="pill">${esc(a.head)}</span><span class="pill ${a.calibrated ? 'good' : 'warn'}">${a.calibrated ? 'calibrated' : 'uncalibrated'}</span>${a.abstain != null ? `<span class="pill">abstain ${pct(a.abstain)}</span>` : ''}${a.temperature != null ? `<span class="pill">T=${num(a.temperature, 2)}</span>` : ''}</div>`;
}

// ---------- START headline ----------
function renderHeadline() {
  const ev = S.ev; const zero = ev.runs.find((r) => r.id === 'zero'); const all = ev.runs.find((r) => r.id === 'all-int8'); const opt = ev.runs.find((r) => r.id === 'opt-int8');
  const JL = ev.jev_live; const O = ev.oos_same_set;
  const cards = [
    ['Zero-shot department accuracy', `<span style="color:var(--jev)">${pct(JL.accuracy)}</span> vs <span style="color:var(--ts)">${pct(zero.accuracy)}</span>`, 'Jev (live) vs typesafe with criteria text only. The like-for-like comparison, and Jev wins clearly.'],
    ['Best with a few labels', `<span style="color:var(--jev)">${pct(JL.with_3_examples.accuracy)}</span> vs <span style="color:var(--ts)">${pct(opt.accuracy)}</span>`, 'Jev with only 3 examples per option in its criteria vs typesafe\'s governed-loop champion (about 320 labels).'],
    ['Urgency (noul) AUROC', `<span style="color:var(--jev)">${num(JL.urgent_auroc, 2)}</span> vs <span style="color:var(--ts)">${num(all.urgent_auroc, 2)}</span>`, `Jev zero-shot vs typesafe trained on 200 labels. With a threshold tuned on the val split, Jev scores ${pct(JL.urgent_acc_tuned)}; at 0.5 it scores only ${pct(JL.urgent_acc_0_5)}.`],
    ['Latency p95', `<span style="color:var(--jev)">${Math.round(JL.p95)} ms</span> vs <span style="color:var(--ts)">${Math.round(all.p95)} ms</span>`, 'Jev live from London, including the network hop. typesafe runs in-process on 2 vCPU with three questions.'],
    ['Calibration (ECE)', `<span style="color:var(--jev)">${num(JL.ece)}</span> vs <span style="color:var(--ts)">${num(all.ece)}</span>`, 'Lower is better. typesafe wins once it has at least 20 held-out labels. Untrained, it is far worse.'],
    ['Off-topic inputs caught', `<span style="color:var(--jev)">${pct(O.jev_other.oos_routed_to_other, 0)}</span> vs <span style="color:var(--ts)">${pct(O.ts.ts_zero_other.oos_to_other, 0)}</span>`, `With an explicit "other" option, as Jev's guidance recommends. False alarms: Jev ${pct(O.jev_other.in_scope_routed_to_other, 0)}, typesafe ${pct(O.ts.ts_zero_other.in_to_other, 0)}.`],
    ['Fresh benchmark (150 new items)', '<span style="color:var(--jev)">93–98%</span> vs <span style="color:var(--ts)">61–75%</span>', 'Three unseen tasks with a separate training split. Jev with and without training data in its state, against typesafe untrained and trained. See the Benchmark tab.'],
    ['Cost per 1M decisions', `<span style="color:var(--jev)">≈ $${(JL.avg_input_tokens * ev.jev.price_per_mtok_input).toFixed(0)}</span>`, `Jev at ≈${Math.round(JL.avg_input_tokens)} input tokens per call. typesafe costs only CPU time.`],
    ['Reproducibility', '<span style="color:var(--ts)">3/3</span>', `Jev's recorded ${pct(ev.jev.gen0.accuracy)} re-ran live at ${pct(JL.accuracy)}, and typesafe's two README headline rows (80.0% and 84.0%) reproduced exactly.`],
  ];
  $('#headline').innerHTML = cards.map(([l, v, d]) => `<div class="card"><div class="stat-label">${l}</div><div class="stat" style="margin:6px 0">${v}</div><div class="small muted">${d}</div></div>`).join('');
}

// ---------- TICKETS ----------
const DEPT_TRUTH = (t) => t.label.department;
function filteredTickets() {
  const f = $('#tFilter').value; const q = $('#tSearch').value.toLowerCase();
  return S.tickets.filter((t) => {
    if (q && !t.text.toLowerCase().includes(q)) return false;
    if (f === 'jevwrong') return t.jev && t.jev.pred.department !== t.label.department;
    if (f === 'ambiguous') return t.ambiguous;
    if (f === 'urgent') return t.label.urgent;
    if (f === 'angry') return t.label.frustration === 2;
    return true;
  });
}
function renderTicketList() {
  const list = filteredTickets();
  $('#tCount').textContent = `${list.length} shown`;
  $('#tList').innerHTML = list.map((t) => {
    const jr = t.jev && t.jev.pred.department === t.label.department;
    return `<div class="ticket-item ${S.sel === t.id ? 'sel' : ''}" data-id="${t.id}">${esc(t.text.slice(0, 110))}${t.text.length > 110 ? '…' : ''}<div class="meta">${t.id} · truth <b>${t.label.department}</b> · Jev ${jr ? '✓' : '✗ ' + esc(t.jev?.pred.department)}${t.ambiguous ? ' · ambiguous' : ''}</div></div>`;
  }).join('');
  $$('.ticket-item').forEach((el) => (el.onclick = () => openTicket(el.dataset.id)));
}
async function openTicket(id) {
  S.sel = id; renderTicketList();
  const t = S.tickets.find((x) => x.id === id);
  const legend = S.meta.questions.frustration.criteria;
  const truthBox = `<div class="card" style="margin-bottom:12px"><div class="small muted">${t.id}${t.ambiguous ? ` · ambiguous (also plausible: ${esc(t.secondary)})` : ''}</div><div style="font-size:16px;margin:6px 0 10px">“${esc(t.text)}”</div><dl class="kv"><dt>department</dt><dd><b>${t.label.department}</b></dd><dt>urgent</dt><dd>${t.label.urgent}</dd><dt>frustration</dt><dd>${t.label.frustration} · ${esc(legend[t.label.frustration])}</dd></dl></div>`;
  const j = t.jev;
  const jevCard = j ? `<div class="card jev"><span class="pill jev">Jev · recorded</span> ${okPill(j.pred.department === t.label.department)}<h3 style="margin-top:8px">${esc(j.pred.department)} <span class="muted small">conf ${pct(j.confidence, 0)}</span></h3>${bars(j.probabilities, { truth: t.label.department, top: j.pred.department })}<dl class="kv" style="margin-top:10px"><dt>urgent</dt><dd>${j.pred.urgent} ${j.pred.urgent === t.label.urgent ? '✓' : '✗'}</dd><dt>frustration</dt><dd>${j.pred.frustration} (continuous)</dd><dt>latency</dt><dd>${j.latencyMs} ms</dd><dt>tokens</dt><dd>${j.tokens?.input_tokens} in / ${j.tokens?.output_tokens} out</dd></dl></div>` : '<div class="card">No Jev record.</div>';
  $('#tDetail').innerHTML = truthBox + `<div class="grid g2">${jevCard}<div class="card jev" id="tj">${S.meta.jevLive ? '<span class="spinner"></span>' : '<span class="muted small">Live Jev not configured.</span>'}</div><div class="card ts" id="tz"><span class="spinner"></span></div><div class="card ts" id="tt"><span class="spinner"></span></div></div>`;
  if (S.meta.jevLive) jevTicket(t);
  try {
    const out = await api('/api/decide', { state: t.text, mode: 'both' });
    for (const [key, el, title] of [['zero', '#tz', 'typesafe · zero-shot'], ['trained', '#tt', 'typesafe · trained']]) {
      const a = out[key].response.answers;
      const d = a.department;
      $(el).innerHTML = `<span class="pill ts">${title}</span> ${okPill(d.choice === t.label.department)}<h3 style="margin-top:8px">${esc(d.choice)} <span class="muted small">conf ${pct(d.confidence, 0)}</span></h3>${bars(d.probabilities, { truth: t.label.department, top: d.choice })}${flags(d)}<dl class="kv" style="margin-top:10px"><dt>urgent</dt><dd>${num(a.urgent.noul, 2)} → ${a.urgent.noul >= 0.5} ${(a.urgent.noul >= 0.5) === t.label.urgent ? '✓' : '✗'}</dd><dt>frustration</dt><dd>${a.frustration.score} · ${esc(a.frustration.legend)} ${a.frustration.score === t.label.frustration ? '✓' : '✗'}</dd><dt>latency</dt><dd>${out[key].ms} ms (3 questions)</dd></dl>`;
    }
  } catch (e) { $('#tz').textContent = e.message; }
}
async function jevTicket(t) {
  try {
    const o = await api('/api/jev', { state: t.text, questions: S.meta.questions });
    const a = o.response.answers; const d = a.department; const thr = S.ev.jev_live.urgent_val_threshold;
    $('#tj').innerHTML = `<span class="pill jev">Jev · live (${esc(o.response.model)})</span> ${okPill(d.choice === t.label.department)}<h3 style="margin-top:8px">${esc(d.choice)} <span class="muted small">conf ${pct(d.confidence, 0)}</span></h3>${bars(d.probabilities, { truth: t.label.department, top: d.choice })}<dl class="kv" style="margin-top:10px"><dt>urgent</dt><dd>${num(a.urgent.noul, 2)} → ${a.urgent.noul >= thr} at tuned ${thr} ${(a.urgent.noul >= thr) === t.label.urgent ? '✓' : '✗'}</dd><dt>frustration</dt><dd>${num(a.frustration.score, 2)} (continuous) ${Math.round(a.frustration.score) === t.label.frustration ? '✓' : '✗'}</dd><dt>latency</dt><dd>${o.ms} ms incl. network</dd><dt>tokens</dt><dd>${o.response.usage?.input_tokens} in / ${o.response.usage?.output_tokens} out</dd></dl>`;
  } catch (e) { $('#tj').innerHTML = `<span class="pill jev">Jev · live</span><p class="small">${esc(e.message)}</p>`; }
}
$('#tFilter').onchange = renderTicketList; $('#tSearch').oninput = renderTicketList;

// ---------- PLAYGROUND ----------
const PRESETS = {
  'Ticket questions': null,
  'Fraud vs billing (not_for)': { dept: { type: 'choice', instructions: 'Which team handles this', criteria: { billing: 'charges, invoices and refunds', fraud: { what: 'unauthorised use of a card or account', not_for: 'a duplicate charge the customer made themselves' } } } },
  'Content moderation': { action: { type: 'choice', instructions: 'Moderation action for this comment', criteria: { allow: 'ordinary, civil comment', review: 'borderline, heated or possibly off-topic', remove: 'abuse, spam or harassment' } }, toxicity: { type: 'score', instructions: 'How hostile is the comment', criteria: ['Friendly', 'Neutral', 'Hostile'] } },
  'Lead qualification': { stage: { type: 'choice', instructions: 'Sales stage of this message', criteria: { researching: 'early exploration, no budget or timeline', evaluating: 'comparing vendors, asking detailed questions', buying: 'ready to purchase, asking about contracts or pricing' } }, enterprise: { type: 'noul', instructions: 'The sender works for a large enterprise' } },
};
function setQuestions(q) { $('#pgQuestions').value = JSON.stringify(q || S.meta.questions, null, 2); updateCurl(); }
function updateCurl() {
  let body; try { body = { state: $('#pgState').value, questions: JSON.parse($('#pgQuestions').value) }; } catch { return; }
  const b = JSON.stringify(body).replace(/'/g, "'\\''");
  $('#curlJev').textContent = `curl https://api.typesafe.ai/v1/systemone \\\n  -H "Authorization: Bearer $TYPESAFE_API_KEY" \\\n  -H 'content-type: application/json' \\\n  -d '${b}'`;
  $('#curlLocal').textContent = `curl ${location.origin}/v1/systemone?jevShapeOnly=1 \\\n  -H 'content-type: application/json' \\\n  -d '${b}'`;
}
$('#pgState').oninput = updateCurl; $('#pgQuestions').oninput = updateCurl;
$('#pgReset').onclick = () => setQuestions(null);
$('#pgRun').onclick = async () => {
  let questions;
  try { questions = JSON.parse($('#pgQuestions').value); } catch (e) { $('#pgOut').innerHTML = `<div class="card callout bad">Questions JSON: ${esc(e.message)}</div>`; return; }
  $('#pgRun').disabled = true; $('#pgOut').innerHTML = '<div class="card"><span class="spinner"></span></div>';
  try {
    const out = await api('/api/decide', { state: $('#pgState').value, questions, mode: 'both' });
    const jevOnly = $('#pgJevOnly').checked;
    const strip = (r) => { const c = structuredClone(r); for (const a of Object.values(c.answers)) for (const k of ['abstain', 'calibrated', 'head', 'model', 'temperature']) delete a[k]; return c; };
    const render = (a) => `${a.choice != null ? esc(a.choice) : a.legend != null ? esc(typeof a.legend === 'string' ? a.legend : '') + (a.score != null ? ' ' + num(a.score, 2) : '') : num(a.noul, 3)} <span class="muted small">${a.confidence != null ? 'conf ' + pct(a.confidence, 0) : ''}</span>${a.probabilities ? bars(a.probabilities, { top: a.choice ?? (a.score != null ? String(Math.round(a.score)) : undefined) }) : ''}`;
    const cards = ['zero', 'trained'].map((k) => {
      const r = out[k].response;
      const ans = Object.entries(r.answers).map(([qid, a]) => `<div style="margin-top:10px"><b>${esc(qid)}</b> → ${render(a)}${flags(a)}</div>`).join('');
      return `<div class="card ts"><span class="pill ts">typesafe · ${k === 'zero' ? 'zero-shot' : 'trained'}</span> <span class="small muted">${out[k].ms} ms</span>${ans}<details><summary class="small">Response JSON</summary><pre class="json">${esc(JSON.stringify(jevOnly ? strip(r) : r, null, 2))}</pre></details></div>`;
    });
    if (S.meta.jevLive) cards.unshift('<div class="card jev" id="pgJev"><span class="spinner"></span></div>');
    $('#pgOut').innerHTML = cards.join('');
    if (S.meta.jevLive) {
      try {
        const o = await api('/api/jev', { state: $('#pgState').value, questions });
        const ans = Object.entries(o.response.answers).map(([qid, a]) => `<div style="margin-top:10px"><b>${esc(qid)}</b> → ${render(a)}</div>`).join('');
        $('#pgJev').innerHTML = `<span class="pill jev">Jev · live (${esc(o.response.model)})</span> <span class="small muted">${o.ms} ms incl. network · ${o.response.usage?.input_tokens} tokens</span>${ans}<details><summary class="small">Response JSON</summary><pre class="json">${esc(JSON.stringify(o.response, null, 2))}</pre></details>`;
      } catch (e) { $('#pgJev').innerHTML = `<span class="pill jev">Jev · live</span><p class="small">${esc(e.message)}</p>`; }
    }
  } catch (e) { $('#pgOut').innerHTML = `<div class="card callout bad">${esc(e.message)}</div>`; }
  $('#pgRun').disabled = false;
};

// ---------- E1 ----------
$('#e1run').onclick = async () => {
  const n = +$('#e1n').value; const pool = [...S.tickets]; const sample = [];
  while (sample.length < n && pool.length) sample.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  $('#e1run').disabled = true; const live = S.meta.jevLive; const acc = { jev: 0, jevlive: 0, zero: 0, trained: 0 }; const lat = { zero: [], trained: [], jevlive: [] };
  let done = 0;
  for (const t of sample) {
    const q = { department: S.meta.questions.department };
    const [out, jl] = await Promise.all([api('/api/decide', { state: t.text, mode: 'both', questions: q }), live ? api('/api/jev', { state: t.text, questions: q }).catch(() => null) : null]);
    if (t.jev.pred.department === t.label.department) acc.jev++;
    if (jl && jl.response.answers.department.choice === t.label.department) acc.jevlive++;
    if (jl) lat.jevlive.push(jl.ms);
    if (out.zero.response.answers.department.choice === t.label.department) acc.zero++;
    if (out.trained.response.answers.department.choice === t.label.department) acc.trained++;
    lat.zero.push(out.zero.ms); lat.trained.push(out.trained.ms);
    $('#e1status').textContent = `${++done}/${n}`;
  }
  const med = (a) => a.length ? a.sort((x, y) => x - y)[Math.floor(a.length / 2)] : '—';
  const row = (name, cls, k, labels, note) => `<tr><td><span class="pill ${cls}">${name}</span></td><td class="stat" style="font-size:20px">${pct(acc[k] / n)}</td><td>${labels}</td><td class="small muted">${note}</td></tr>`;
  $('#e1out').innerHTML = `<div class="table-wrap" style="margin-top:12px"><table><tr><th>Arm</th><th>Accuracy (n=${n})</th><th>Labelled examples</th><th>Notes</th></tr>${live ? row('Jev live', 'jev', 'jevlive', '0', `criteria only · median ${Math.round(med(lat.jevlive))} ms incl. network`) : ''}${row('Jev gen-0 (recorded 21 Sep)', 'jev', 'jev', '0', 'author capture; criteria only')}${row('typesafe zero-shot', 'ts', 'zero', '0', `live · median ${med(lat.zero)} ms`)}${row('typesafe trained', 'ts', 'trained', `${S.meta.boot.examples.department} (16/class)`, `live · median ${med(lat.trained)} ms`)}</table></div><div class="callout small"><b>What to take away:</b> with the same inputs (criteria text only), Jev is roughly twice as accurate. typesafe only gets close once it has labels, and Jev given just 3 examples per option (89.3% on the full test set) still stays ahead. typesafe's advantages are speed, running locally, and calibration, not accuracy.</div>`;
  $('#e1run').disabled = false;
};

// ---------- E2 ----------
const OTHER = 'Anything that is not a customer-support message for this company';
async function e2() {
  const states = $('#e2states').value.split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 12);
  $('#e2out').innerHTML = '<span class="spinner"></span>'; $('#e2run').disabled = true;
  const D = S.meta.questions.department; const Dother = { ...D, criteria: { ...D.criteria, other: OTHER } };
  try {
    const cols = [];
    const tsT = []; for (const s of states) tsT.push((await api('/api/decide', { state: s, mode: 'trained', questions: { department: D } })).trained.response.answers.department);
    cols.push(['typesafe trained', 'ts', tsT]);
    const tsO = (await api('/api/sandbox', { questions: { department: Dother }, states })).answers.map((a) => a.response.answers.department);
    cols.push(['typesafe + "other"', 'ts', tsO]);
    if (S.meta.jevLive) {
      cols.push(['Jev', 'jev', await Promise.all(states.map((s) => api('/api/jev', { state: s, questions: { department: D } }).then((o) => o.response.answers.department)))]);
      cols.push(['Jev + "other"', 'jev', await Promise.all(states.map((s) => api('/api/jev', { state: s, questions: { department: Dother } }).then((o) => o.response.answers.department)))]);
    }
    const cell = (a) => `<b style="color:${a.choice === 'other' ? 'var(--good)' : 'inherit'}">${esc(a.choice)}</b> <span class="muted">${pct(a.confidence, 0)}</span>${a.abstain != null ? `<br><span class="small muted">abstain ${pct(a.abstain, 1)}</span>` : ''}`;
    const O = S.ev.oos_same_set;
    $('#e2out').innerHTML = `<div class="table-wrap" style="margin-top:10px"><table><tr><th>State</th>${cols.map(([n, c]) => `<th><span class="pill ${c}">${n}</span></th>`).join('')}</tr>${states.map((s, i) => `<tr><td>${esc(s)}</td>${cols.map((c) => `<td>${cell(c[2][i])}</td>`).join('')}</tr>`).join('')}</table></div>
    <div class="callout small"><b>What the full run shows</b> (100 real tickets + ${O.n_oos} off-topic states from CLINC150's out-of-scope set):
    <ul style="margin:6px 0 0 18px;padding:0">
    <li>Without an escape option, <b>both</b> systems force an answer. Jev's confidence barely drops (${pct(O.jev_plain.mean_conf_oos, 0)} off-topic vs ${pct(O.jev_plain.mean_conf_in, 0)} on-topic; AUROC ${num(O.jev_plain.auroc_1_minus_conf, 2)}). For example, "capital of Australia" → feedback at 96%.</li>
    <li>With an <code>other</code> option, Jev routes ${pct(O.jev_other.oos_routed_to_other, 0)} of off-topic states there and wrongly sends only ${pct(O.jev_other.in_scope_routed_to_other, 0)} of real tickets. typesafe catches ${pct(O.ts.ts_zero_other.oos_to_other, 0)} and wrongly sends ${pct(O.ts.ts_zero_other.in_to_other, 0)}.</li>
    <li>typesafe's <code>abstain</code> does <em>rank</em> off-topic states well on this 8-option question (AUROC ${num(O.ts.ts_trained_plain.auroc_abstain, 2)}), but the values are tiny, around 1% off-topic vs 0.1% on-topic. That contradicts its documented "high abstain" meaning, and the signal collapses completely at 150 options (CLINC150 AUROC 0.50). If you use it, set a threshold empirically.</li></ul></div>`;
  } catch (e) { $('#e2out').innerHTML = `<div class="callout bad">${esc(e.message)}</div>`; }
  $('#e2run').disabled = false;
}
$('#e2run').onclick = () => e2();

// ---------- E3 ----------
const E3_EX = `The app crashes when I upload a PNG → bug
Login fails with a 500 error → bug
Search returns nothing even for exact titles → bug
Charts are blank after the last update → bug
The save button does nothing on mobile → bug
Notifications arrive twice → bug
Please add an API for bulk export → feature
Would love a Slack integration → feature
Can we get keyboard shortcuts? → feature
Support for SSO with Okta would help → feature
Add a calendar view for tasks → feature
It would be nice to schedule reports → feature
Loving the new onboarding flow → praise
Great support from your team today → praise
The redesign looks fantastic → praise
Fastest tool we have used, thank you → praise
Really impressed with the reliability → praise
Your docs are excellent → praise`;
$('#e3ex').value = E3_EX;
function e3question() {
  const criteria = {};
  for (const line of $('#e3opts').value.split('\n')) { const i = line.indexOf(':'); if (i > 0) criteria[line.slice(0, i).trim()] = line.slice(i + 1).trim(); }
  return { type: 'choice', instructions: 'Classify this feedback', criteria };
}
async function e3(withEx) {
  const q = e3question();
  const examples = withEx ? $('#e3ex').value.split('\n').map((l) => l.split('→')).filter((p) => p.length === 2).map(([text, label]) => ({ text: text.trim(), label: label.trim() })) : [];
  const states = $('#e3states').value.split('\n').map((s) => s.trim()).filter(Boolean);
  $('#e3out').innerHTML = '<span class="spinner"></span>'; $('#e3status').textContent = '';
  try {
    const o = await api('/api/sandbox', { questions: { q }, examples: withEx ? { q: examples } : {}, states });
    const rep = o.reports.q;
    $('#e3status').textContent = `engine + training ${o.timings.engine_and_train_ms} ms`;
    $('#e3out').innerHTML = (rep ? `<div class="small" style="margin-top:8px">train(): accepted ${rep.accepted}, rejected ${rep.rejected}, report says head <code>${esc(rep.head)}</code>, calibrated <code>${rep.calibrated}</code></div>` : '<div class="small" style="margin-top:8px">No examples: the nearest-prototype head uses criteria text only.</div>') + o.answers.map((a) => { const x = a.response.answers.q; return `<div style="margin-top:10px"><div class="small">“${esc(a.state)}” → <b>${esc(x.choice)}</b> <span class="muted">${pct(x.confidence, 0)} · ${a.ms} ms</span></div>${bars(x.probabilities, { top: x.choice })}${flags(x)}</div>`; }).join('') + `<div class="callout small">Try it: delete examples until there are fewer than 5 per option and watch the answering head fall back to <code>nearest-prototype</code>. <code>calibrated</code> only flips to true once 20% of your examples come to at least 20, so about 100 examples in total. For 3 options that was ~34 per option in testing.</div>`;
  } catch (e) { $('#e3out').innerHTML = `<div class="callout bad">${esc(e.message)}</div>`; }
}
$('#e3run').onclick = () => e3(true); $('#e3zero').onclick = () => e3(false);

// ---------- E4 reliability ----------
function reliability(title, cls, bins, ece) {
  const W = 360, H = 260, P = 34, w = W - P - 10, h = H - P - 16;
  const x = (v) => P + v * w, y = (v) => 10 + h - v * h;
  const color = cls === 'jev' ? 'var(--jev)' : 'var(--ts)';
  let g = `<line x1="${x(0)}" y1="${y(0)}" x2="${x(1)}" y2="${y(1)}" stroke="var(--ink-3)" stroke-dasharray="4 4"/>`;
  for (let i = 0; i <= 5; i++) { const v = i / 5; g += `<text x="${P - 6}" y="${y(v) + 4}" font-size="10" text-anchor="end">${v.toFixed(1)}</text><text x="${x(v)}" y="${H - 12}" font-size="10" text-anchor="middle">${v.toFixed(1)}</text><line x1="${P}" x2="${x(1)}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/>`; }
  for (const b of bins) { if (!b.n) continue; const bw = w / 10 - 4; g += `<rect x="${x(b.lo) + 2}" y="${y(b.acc)}" width="${bw}" height="${y(0) - y(b.acc)}" fill="${color}" opacity="${b.n < 10 ? 0.45 : 0.85}" rx="2"><title>conf ${b.lo.toFixed(1)}–${b.hi.toFixed(1)}: n=${b.n}, acc ${pct(b.acc)}, mean conf ${pct(b.conf)}</title></rect><text x="${x(b.lo) + 2 + bw / 2}" y="${y(b.acc) - 4}" font-size="9.5" text-anchor="middle">${b.n}</text>`; }
  g += `<text x="${x(0.5)}" y="${H}" font-size="10.5" text-anchor="middle">confidence</text>`;
  return `<div class="card ${cls}"><span class="pill ${cls}">${title}</span> <span class="small muted">ECE ${num(ece)}</span><svg viewBox="0 0 ${W} ${H + 4}" width="100%" role="img" aria-label="${title} reliability diagram">${g}</svg></div>`;
}
function renderE4() {
  const s16 = S.ev.runs.find((r) => r.id === 's16');
  const JL = S.ev.jev_live; const b9 = JL.bins.find((b) => b.lo === 0.9);
  $('#e4out').innerHTML = reliability('Jev live, zero-shot', 'jev', JL.bins, JL.ece) + reliability('typesafe 16-shot (reproduced)', 'ts', s16.bins, s16.ece) + `<div class="card small" style="grid-column:1/-1">Jev put <b>${b9.n}/150</b> answers in the 90–100% bin, and those were right ${pct(b9.acc)} of the time: slightly overconfident, but well ordered (ECE ${num(JL.ece)}; the recorded run from 21 Sep had ${num(S.ev.jev.gen0.ece)}). typesafe's upstream 16-shot config is similar (${num(s16.ece)}). With all three heads trained and ≥20 held-out calibration labels, typesafe falls to ${num(S.ev.runs.find((r) => r.id === 'all-fp32').ece)}–${num(S.ev.runs.find((r) => r.id === 'all-int8').ece)}, better than Jev even with examples (${num(JL.with_3_examples.ece)}). Untrained, typesafe is badly calibrated (${num(S.ev.runs.find((r) => r.id === 'zero').ece)}).</div>`;
}

// ---------- E5 loop ----------
function renderE5() {
  const L = S.ev.loop; const rs = L.receipts;
  $('#e5out').innerHTML = `<div class="grid g4" style="margin:10px 0"><div class="card"><div class="stat-label">champion test acc</div><div class="stat">${pct(L.champion.test.test)}</div><div class="small muted">Jev gen-0 ${pct(S.ev.jev.gen0.accuracy)}</div></div><div class="card"><div class="stat-label">validation</div><div class="stat">${pct(L.champion.test.val)}</div></div><div class="card"><div class="stat-label">transfer holdout</div><div class="stat">${pct(L.champion.test.transfer)}</div></div><div class="card"><div class="stat-label">test ECE</div><div class="stat">${num(L.champion.test.test_ece)}</div></div></div>
  <div class="table-wrap"><table><tr><th>#</th><th>Kind</th><th>Val acc (base → cand.)</th><th>Accuracy test wealth</th><th>Calibration test wealth</th><th>Decision</th><th>Hash (prev → this)</th></tr>${rs.map((r) => `<tr><td>${r.seq}</td><td>${esc(r.kind)}</td><td>${pct(r.val.baseline_accuracy)} → ${pct(r.val.champion_accuracy)}</td><td>${num(r.statistic.max_wealth, 2)} / 20 ${r.statistic.rejected ? '✓' : ''}</td><td>${r.calibration_statistic ? (r.calibration_statistic.max_wealth > 1e4 ? r.calibration_statistic.max_wealth.toExponential(1) : num(r.calibration_statistic.max_wealth, 2)) + ' / 20 ' + (r.calibration_statistic.rejected ? '✓' : '') : '—'}</td><td>${r.test ? `<span class="pill ts">campaign close · test ${pct(r.test.baseline_accuracy)} → ${pct(r.test.champion_accuracy)}</span>` : r.decision.decision === 'promote' ? `<span class="pill good">promote · ${esc(r.promoted_by)}</span>` : `<span class="pill">${esc(r.decision.decision)}</span>`}</td><td class="mono small">${r.prev_hash.slice(0, 6)} → ${r.hash.slice(0, 6)}</td></tr>`).join('')}</table></div>
  <div class="callout small"><b>Reading it:</b> no proposal passed on accuracy alone; the best wealth was ${num(Math.max(...rs.map((r) => r.statistic.max_wealth)), 2)} against a threshold of 20. Promotions came through the calibration (log-loss) test. This is conservative by design: it won't promote noise. But on a 150-item validation split it can barely detect a real accuracy gain of a few points. The receipts use FNV-1a, which catches accidental corruption but won't stop deliberate edits.</div>`;
}

// ---------- EVIDENCE ----------
function renderEvidence() {
  const ev = S.ev; const J = ev.jev.gen0;
  const prov = (p) => p.startsWith('reproduced') ? '<span class="pill good">reproduced</span>' : p.startsWith('new') ? '<span class="pill ts">new</span>' : '<span class="pill warn">recorded</span>';
  $('#evTable').innerHTML = `<tr><th>Arm</th><th>Embedder</th><th>Labels</th><th>Dept acc</th><th>ECE</th><th>Urgent acc</th><th>Frustration</th><th>p95 ms</th><th>Source</th></tr>
  <tr><td><span class="pill jev">Jev live, zero-shot</span></td><td>${esc(ev.jev_live.model)}</td><td>0</td><td><b>${pct(ev.jev_live.accuracy)}</b></td><td>${num(ev.jev_live.ece)}</td><td>${pct(ev.jev_live.urgent_acc_tuned)} <span class="small muted">(tuned thr ${ev.jev_live.urgent_val_threshold}; ${pct(ev.jev_live.urgent_acc_0_5)} at 0.5; AUROC ${num(ev.jev_live.urgent_auroc, 2)})</span></td><td>${pct(ev.jev_live.frustration_acc)}</td><td>${Math.round(ev.jev_live.p95)}</td><td><span class="pill good">live 25 Sep</span></td></tr>
  <tr><td><span class="pill jev">Jev live, 3 examples/option</span></td><td>${esc(ev.jev_live.model)}</td><td>24 (in criteria)</td><td><b>${pct(ev.jev_live.with_3_examples.accuracy)}</b></td><td>${num(ev.jev_live.with_3_examples.ece)}</td><td>—</td><td>—</td><td>—</td><td><span class="pill good">live 25 Sep</span></td></tr>
  <tr><td><span class="pill jev">Jev gen-0 (21 Sep)</span></td><td>jev-latest</td><td>0</td><td><b>${pct(J.accuracy)}</b></td><td>${num(J.ece)}</td><td>${pct(J.urgent_accuracy)}</td><td>${pct(J.frustration_accuracy)}</td><td>${Math.round(J.p95)}</td><td><span class="pill warn">recorded</span></td></tr>
  <tr><td><span class="pill jev">Jev champion</span></td><td>jev-latest</td><td>0 (mutated criteria)</td><td>${pct(ev.jev.champion.accuracy)}</td><td>${num(ev.jev.champion.ece)}</td><td>60.0%</td><td>67.3%</td><td>216</td><td><span class="pill warn">recorded</span></td></tr>
  ${ev.runs.map((r) => `<tr><td>${esc(r.label)}</td><td>${esc(r.model)}</td><td>${esc(r.labeled)}</td><td><b>${pct(r.accuracy)}</b></td><td>${num(r.ece)}</td><td>${pct(r.urgent_accuracy)}</td><td>${pct(r.frustration_accuracy)}</td><td>${r.p95 ? Math.round(r.p95) : '—'}</td><td>${prov(r.provenance)}</td></tr>`).join('')}`;
  const c = ev.clinc150;
  $('#evClinc').innerHTML = [['OOS AUROC', num(c.oos_auroc, 2), 'gate ≥ 0.85 · FAIL'], ['Mean abstain', c.mean_abstain.toExponential(1), 'on every item'], ['Accuracy incl. OOS', pct(c.accuracy_incl_oos), `${c.n} items, ${c.n_oos} OOS`], ['ECE', num(c.ece), 'gate ≤ 0.05 · FAIL']].map(([l, v, d]) => `<div class="card"><div class="stat-label">${l}</div><div class="stat">${v}</div><div class="small muted">${d}</div></div>`).join('');
  $('#evCost').innerHTML = `<div class="card jev"><div class="stat-label">Jev per decision</div><div class="stat">${Math.round(J.p50)} / ${Math.round(J.p95)} ms</div><div class="small muted">p50 / p95 incl. network, concurrency 4, ≈21 items/s. ${ev.jev.avg_input_tokens} input tokens ≈ $${(ev.jev.avg_input_tokens * 0.042 / 1e6).toFixed(6)}.</div></div><div class="card ts"><div class="stat-label">typesafe per decision</div><div class="stat">${Math.round(ev.runs.find((r) => r.id === 'all-int8').p95)} ms p95</div><div class="small muted">INT8, three questions, 2 vCPU. The author reports 4–10 ms on a Ryzen 9 9950X. In this lab's test, the model loaded in ~0.4 s using ~140 MB RSS.</div></div><div class="card"><div class="stat-label">Break-even thinking</div><div class="stat">latency, not $</div><div class="small muted">At ≈$23 per million calls, Jev is already cheap. typesafe's real advantages are a 10–20× lower latency, offline and on-prem operation, and training on your own labels.</div></div>`;
}

// ---------- RUVECTOR ----------
const RV = [
  ['ruvector-embed-core', 'existing', 'ONNX embedders (ort native, tract WASM) behind a hash-pinned manifest. typesafe\'s production embedder; numerically identical across targets (min cosine 0.99999).'],
  ['ruvector-kge (@ruvector/kge)', 'existing', 'Knowledge-graph embeddings. Already reuses typesafe-core\'s loop gate and receipt log, a template for putting any learnable component behind the same governance.'],
  ['SONA (@ruvector/sona)', 'potential', 'Runtime LoRA adaptation. Add a new proposal kind to the governed loop: adapt the embedder, then promote only if the paired test and transfer holdout pass.'],
  ['Cognitum gate / prime-radiant', 'potential', 'Anytime-valid coherence gating (permit / defer / escalate). A natural out-of-scope guard in front of typesafe, which E2 shows is needed.'],
  ['ruvllm (@ruvector/ruvllm)', 'potential', 'Local LLM inference. Use it as the escalation arm and as a tier-B labeller to bootstrap typesafe banks: a fully local alternative to the Jev cascade.'],
  ['ruvector-graph (Cypher)', 'potential', 'Persist decisions, examples and receipts as a lineage graph ("which examples produced this answer?").'],
  ['RVF (@ruvector/rvf)', 'potential', 'Ship heads, temperatures, bank and receipts as one signed, witnessed artifact. Upgrades FNV receipts to cryptographic provenance.'],
  ['@ruvector/router / tiny-dancer', 'potential', 'Semantic and model routing. typesafe `choice` becomes a calibrated router, and tiny-dancer picks the model for abstentions.'],
  ['ruvector-postgres', 'potential', 'Expose `typesafe_choice(text, question)` as SQL over stored rows, for batch decisions where the data lives.'],
  ['ruvector-mincut / GNN rerank', 'research', 'Watch the example bank for structural drift (min-cut changes) and rerank evidence neighbours. Plausible, unproven.'],
  ['MCP servers (mcp-gate, rvf-mcp-server)', 'potential', 'Wrap decide / train / optimize as MCP tools so agents (Claude, claude-flow) call typed decisions directly.'],
  ['hooks CLI (npx ruvector hooks)', 'potential', 'Agent-time decisions (route an edit, triage an alert) in <20 ms, with recall feeding labelled examples back into the bank.'],
];
function renderRV() {
  $('#rvCards').innerHTML = RV.map(([n, m, d]) => `<div class="card"><div class="row" style="justify-content:space-between"><h3 style="margin:0">${esc(n)}</h3><span class="pill ${m === 'existing' ? 'good' : m === 'research' ? 'warn' : 'ts'}">${m}</span></div><p class="small" style="margin-bottom:0">${esc(d)}</p></div>`).join('');
}

// ---------- E6: does it read the question? ----------
async function e6(kind) {
  $('#e6out').innerHTML = '<span class="spinner"></span>';
  try {
    let variants, qid, state;
    if (kind === 'own') {
      state = 'Hi, I was charged twice for the same order and I need this refunded today.'; qid = 'department';
      variants = ['Which team should own this message', 'Which team should avoid this message'].map((ins) => [ins, { department: { ...S.meta.questions.department, instructions: ins } }]);
    } else {
      state = 'Please refund me today, this is urgent.'; qid = 'u';
      variants = ['The sender needs a response very soon', 'The sender does NOT need a response soon'].map((ins) => [ins, { u: { type: 'noul', instructions: ins } }]);
    }
    const rows = [];
    for (const [ins, questions] of variants) {
      const [ts, jv] = await Promise.all([api('/api/decide', { state, questions, mode: 'zero' }), S.meta.jevLive ? api('/api/jev', { state, questions }).catch(() => null) : null]);
      const f = (a) => !a ? '—' : a.choice != null ? `<b>${esc(a.choice)}</b> <span class="muted">${pct(a.confidence, 0)}</span>` : `<b>${num(a.noul, 2)}</b>`;
      rows.push(`<tr><td>“${esc(ins)}”</td><td>${f(ts.zero.response.answers[qid])}</td><td>${f(jv && jv.response.answers[qid])}</td></tr>`);
    }
    $('#e6out').innerHTML = `<div class="small muted" style="margin-top:8px">state: “${esc(state)}”</div><div class="table-wrap" style="margin-top:6px"><table><tr><th>Instruction</th><th><span class="pill ts">typesafe</span></th><th><span class="pill jev">Jev</span></th></tr>${rows.join('')}</table></div><div class="callout small">${kind === 'own' ? 'typesafe gives the same answer because a choice\'s <code>instructions</code> are never used. Only the option descriptions and examples count. Jev notices that "avoid" makes the question ill-posed and spreads its probability.' : 'typesafe scores both versions almost the same, because text embeddings barely register "not". Jev flips. Never phrase a typesafe noul negatively; put the meaning into labelled examples instead.'}</div>`;
  } catch (e) { $('#e6out').innerHTML = `<div class="callout bad">${esc(e.message)}</div>`; }
}
$('#e6a').onclick = () => e6('own'); $('#e6b').onclick = () => e6('neg');

// ---------- Fresh benchmark ----------
const ARMS = [['ts_zero', 'typesafe · criteria only', 'ts'], ['ts_trained', 'typesafe · trained', 'ts'], ['jev_zero', 'Jev · criteria only', 'jev'], ['jev_data', 'Jev · training data in state', 'jev']];
const TASKS = { council: 'Council routing', severity: 'Safety severity', deadline: 'Deadline detection' };
const B = { data: null, res: null, thr: null };
function bLabel(task, l) { return task === 'severity' ? ['Low', 'Medium', 'High'][l] : task === 'deadline' ? (l ? 'yes' : 'no') : l; }
function bPred(task, ans, arm) { if (!ans) return '—'; if (task === 'deadline') return (ans.score >= (B.thr?.[arm] ?? 0.5) ? 'yes' : 'no') + ` <span class="muted">${num(ans.score, 2)}</span>`; if (task === 'severity') return bLabel(task, ans.pred) + ` <span class="muted">${num(ans.score, 2)}</span>`; return esc(ans.pred) + (ans.conf != null ? ` <span class="muted">${pct(ans.conf, 0)}</span>` : ''); }
function bOk(task, r, arm) { if (!r.ans) return null; return task === 'deadline' ? (r.ans.score >= (B.thr?.[arm] ?? 0.5)) === r.label : r.ans.pred === r.label; }
function renderBench() {
  const d = B.data, R = B.res;
  $('#bDatasets').innerHTML = Object.entries(d.questions).map(([t, q]) => `<div class="card"><span class="pill">${q.type}</span><h3 style="margin-top:6px">${TASKS[t]}</h3><p class="small muted" style="margin:4px 0">${esc(q.instructions)}</p><div class="small">${Array.isArray(q.criteria) ? q.criteria.map(esc).join('<br>') : q.criteria ? Object.keys(q.criteria).map((k) => `<code>${k}</code>`).join(' ') : ''}</div><div class="small" style="margin-top:8px"><b>${d.train[t].length}</b> train · <b>${d.test[t].length}</b> test</div></div>`).join('');
  const csv = (split) => { const lines = ['task,id,split,label,tag,text']; for (const [t, rows] of Object.entries(d[split])) for (const r of rows) lines.push([t, r.id, split, bLabel(t, r.label), r.tag || '', '"' + r.text.replace(/"/g, '""') + '"'].join(',')); return lines.join('\n'); };
  const dl = (name, text) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' })); a.download = name; a.click(); };
  $('#dlTrainCsv').onclick = (e) => { e.preventDefault(); dl('bench-v1-train.csv', csv('train')); };
  $('#dlTestCsv').onclick = (e) => { e.preventDefault(); dl('bench-v1-test.csv', csv('test')); };
  $('#bTrain').innerHTML = Object.entries(d.train).map(([t, rows]) => `<h3 style="margin-top:12px">${TASKS[t]}</h3>${rows.map((r) => `<div>${esc(r.text)} → <b>${esc(bLabel(t, r.label))}</b></div>`).join('')}`).join('');
  if (!R) { $('#bTable').innerHTML = '<tr><td>No reference run yet.</td></tr>'; return; }
  $('#bRunDate').textContent = R.generated.slice(0, 16).replace('T', ' ') + ' UTC · ' + (R.arms.jev_zero?.model || '');
  const m = (a, t) => R.arms[a]?.tasks[t]?.metrics;
  $('#bTable').innerHTML = `<tr><th>Setup</th><th>Labels used</th><th>Council routing<br>accuracy</th><th>Safety severity<br>exact · High caught</th><th>Deadline<br>acc (thr) · AUROC</th><th>Overall<br>(150)</th><th>Median latency</th><th>Tokens / call</th></tr>` +
    ARMS.map(([a, name, cls]) => { if (!R.arms[a]) return ''; const c = m(a, 'council'), s = m(a, 'severity'), dd = m(a, 'deadline'); const lat = Math.round((c.p50_ms + s.p50_ms + dd.p50_ms) / 3); const tok = c.mean_tokens ? Math.round((c.mean_tokens + s.mean_tokens + dd.mean_tokens) / 3) : null;
      return `<tr><td><span class="pill ${cls}">${name}</span></td><td>${a.endsWith('zero') ? '0' : '124 (train split)'}</td><td><b>${pct(c.accuracy)}</b>${c.ece != null ? ` <span class="small muted">ECE ${num(c.ece, 2)}</span>` : ''}</td><td><b>${pct(s.accuracy)}</b> · ${pct(s.high_recall, 0)}</td><td><b>${pct(dd.accuracy)}</b> <span class="small muted">(${dd.threshold})</span> · ${num(dd.auroc, 2)}</td><td class="stat" style="font-size:18px">${pct(R.arms[a].overall_accuracy)}</td><td>${lat} ms</td><td>${tok ?? '—'}</td></tr>`; }).join('');
  const tags = ['plain', 'implicit', 'slang', 'misleading', 'negation', 'sarcasm'];
  $('#bTags').innerHTML = `<div class="legend" style="margin-bottom:8px">${ARMS.map(([a, n, c], i) => `<span><i style="background:var(--${c});opacity:${i % 2 ? 1 : 0.5}"></i>${n}</span>`).join('')}</div><div class="grid g3">${tags.map((tg) => { const n = R.arms.ts_zero?.by_tag[tg]?.n; return `<div class="card"><h3>${tg} <span class="muted small">n=${n}</span></h3>${ARMS.map(([a, name, c], i) => { const v = R.arms[a]?.by_tag[tg]?.accuracy; return v == null ? '' : `<div class="bar"><span class="label small">${name.replace('typesafe · ', 'ts · ').replace('Jev · training data in state', 'Jev · data').replace('criteria only', 'criteria')}</span><span class="track"><span class="fill" style="width:${v * 100}%;background:var(--${c});opacity:${i % 2 ? 1 : 0.5}"></span></span><span class="v">${pct(v, 0)}</span></div>`; }).join('')}</div>`; }).join('')}</div>`;
  renderBenchItems();
}
function renderBenchItems() {
  const R = B.res; if (!R) return; const t = $('#bfTask').value, tag = $('#bfTag').value, show = $('#bfShow').value;
  const rows = B.data.test[t].map((it, i) => ({ it, arms: Object.fromEntries(ARMS.map(([a]) => [a, R.arms[a]?.tasks[t].rows[i]])) }))
    .filter(({ it, arms }) => { if (tag && it.tag !== tag) return false; const ok = Object.fromEntries(ARMS.map(([a]) => [a, arms[a] ? bOk(t, arms[a], a) : null]));
      if (show === 'disagree') return new Set(Object.values(ok).filter((x) => x != null)).size > 1; if (show === 'jevwin') return (ok.jev_zero || ok.jev_data) && !ok.ts_trained; if (show === 'tswin') return ok.ts_trained && !ok.jev_zero && !ok.jev_data; return true; });
  $('#bfCount').textContent = `${rows.length} items`;
  $('#bItems').innerHTML = `<tr><th>Message</th><th>Truth</th>${ARMS.map(([, n, c]) => `<th><span class="pill ${c}">${n}</span></th>`).join('')}</tr>` + rows.map(({ it, arms }) => `<tr><td>${esc(it.text)}<div class="small muted">${it.id} · ${it.tag}</div></td><td><b>${esc(bLabel(t, it.label))}</b></td>${ARMS.map(([a]) => { const r = arms[a]; if (!r) return '<td>—</td>'; const ok = bOk(t, r, a); return `<td style="background:${ok ? 'transparent' : 'var(--bad-soft)'}">${bPred(t, r.ans, a)}</td>`; }).join('')}</tr>`).join('');
}
['#bfTask', '#bfTag', '#bfShow'].forEach((s) => ($(s).onchange = renderBenchItems));

$('#bRun').onclick = async () => {
  const mod = await import('/bench-core.mjs');
  const tasks = $('#bTask').value === 'all' ? Object.keys(TASKS) : [$('#bTask').value]; const per = +$('#bN').value;
  const jobs = []; for (const t of tasks) { const pool = [...B.data.test[t]]; const pick = per >= pool.length ? pool : pool.sort(() => Math.random() - 0.5).slice(0, per); for (const it of pick) jobs.push([t, it]); }
  const live = {}; for (const [a] of ARMS) { live[a] = {}; for (const t of tasks) live[a][t] = []; }
  $('#bRun').disabled = true; let done = 0; let errors = 0;
  const draw = () => {
    $('#bLive').innerHTML = `<div class="table-wrap" style="margin-top:12px"><table><tr><th>Setup</th>${tasks.map((t) => `<th>${TASKS[t]}<br><span class="small muted">live · reference</span></th>`).join('')}<th>Median ms</th></tr>${ARMS.map(([a, name, c]) => { const lat = []; const cells = tasks.map((t) => { const rows = live[a][t]; rows.forEach((r) => r.ms != null && lat.push(r.ms)); if (!rows.length) return '<td>—</td>'; const mm = mod.metrics(t, rows, B.thr?.[a] ?? 0.5); const ref = B.res?.arms[a]?.tasks[t]?.metrics; return `<td><b>${pct(mm.accuracy)}</b> <span class="muted small">· ${ref ? pct(ref.accuracy) : '—'} (n=${rows.length})</span></td>`; }).join(''); lat.sort((x, y) => x - y); return `<tr><td><span class="pill ${c}">${name}</span></td>${cells}<td>${lat.length ? Math.round(lat[Math.floor(lat.length / 2)]) : '—'}</td></tr>`; }).join('')}</table></div>`;
    $('#bStatus').textContent = `${done}/${jobs.length}${errors ? ` · ${errors} errors` : ''}`;
  };
  let i = 0;
  await Promise.all(Array.from({ length: 3 }, async () => { while (i < jobs.length) { const [t, it] = jobs[i++];
    try { const o = await api('/api/bench/item', { task: t, id: it.id });
      for (const [a] of ARMS) { const x = o[a]; if (!x) continue; if (x.error) { errors++; continue; } live[a][t].push({ id: it.id, label: it.label, tag: it.tag, ms: x.ms, ans: mod.readAnswer(t, x.a) }); }
    } catch { errors++; }
    done++; draw(); } }));
  $('#bRun').disabled = false;
};

// ---------- Cascade ----------
const C = { ref: null, sim: null };
const STAGES = [['ts', '1 · typesafe', 'ts'], ['rr', '2 · re-reader', 'ts'], ['llm', '3 · local LLM', 'ts'], ['jev', '4 · Jev', 'jev']];
const SCOL = { ts: 'color-mix(in srgb, var(--ts) 45%, transparent)', rr: 'color-mix(in srgb, var(--ts) 70%, transparent)', llm: 'var(--ts)', jev: 'var(--jev)' };
function cCfg() { return { use: { rr: $('#cUseRr').checked, llm: $('#cUseLlm').checked, jev: $('#cUseJev').checked }, t: { ts: +$('#tTs').value, rr: +$('#tRr').value, llm: +$('#tLlm').value } }; }
function fmtT(v) { return v > 1 ? 'never' : v <= 0 ? 'always' : '≥ ' + (+v).toFixed(2); }
function renderCascade() {
  if (!C.ref || !C.sim) return;
  const cfg = cCfg();
  $('#vTs').textContent = fmtT(cfg.t.ts); $('#vRr').textContent = fmtT(cfg.t.rr); $('#vLlm').textContent = fmtT(cfg.t.llm);
  const r = C.sim.simulate(C.ref.items, cfg);
  $('#cStats').innerHTML = [['Accuracy', pct(r.accuracy), `Jev alone ${pct(C.ref.single.jev)} · typesafe alone ${pct(C.ref.single.ts)}`], ['Sent to Jev', pct(r.jev_share, 0), 'share of messages leaving your servers'], ['Mean latency', Math.round(r.mean_ms) + ' ms', 'summed over the stages each message passed through; measured on 2 CPUs']].map(([l, v, d]) => `<div class="card"><div class="stat-label">${l}</div><div class="stat">${v}</div><div class="small muted">${d}</div></div>`).join('');
  $('#cShare').innerHTML = `<div style="display:flex;height:22px;border-radius:6px;overflow:hidden;background:var(--surface-2)">${STAGES.map(([s]) => r.handled[s] ? `<div title="${s}" style="width:${r.handled[s].share * 100}%;background:${SCOL[s]}"></div>` : '').join('')}</div><div class="legend" style="margin-top:8px">${STAGES.map(([s, n]) => r.handled[s] ? `<span><i style="background:${SCOL[s]}"></i>${n}: ${pct(r.handled[s].share, 0)} of messages, ${r.handled[s].accuracy == null ? '—' : pct(r.handled[s].accuracy, 0)} right</span>` : '').join('')}</div>`;
  const tasks = { council: 'Council routing', severity: 'Safety severity', deadline: 'Deadline detection' };
  $('#cByTask').innerHTML = `<tr><th>Task</th><th>Cascade</th><th>typesafe alone</th><th>Jev alone</th><th>Sent to Jev</th></tr>` + Object.entries(tasks).map(([t, n]) => { const its = C.ref.items.filter((x) => x.task === t); const rr = C.sim.simulate(its, cfg); const a = (s) => its.filter((x) => x.stages[s].pred === x.label).length / its.length; return `<tr><td>${n}</td><td><b>${pct(rr.accuracy)}</b></td><td>${pct(a('ts'))}</td><td>${pct(a('jev'))}</td><td>${pct(rr.jev_share, 0)}</td></tr>`; }).join('');
}
function renderCascadeStatic() {
  const s = C.ref.single; const lat = (k) => { const v = C.ref.items.map((x) => x.stages[k].ms).filter((x) => x != null).sort((a, b) => a - b); return Math.round(v[Math.floor(v.length / 2)]); };
  $('#cRunInfo').textContent = 'reference run ' + C.ref.generated.slice(0, 10);
  const info = { ts: ['bge-small (33M), trained on the 124 training examples', 'MIT'], rr: ['DeBERTa-v3-xsmall (22M), fine-tuned on the same 124 examples, int8', 'MIT'], llm: ['Qwen2.5-1.5B-Instruct, Q4, training examples in a cached prompt', 'Apache-2.0'], jev: ['jev-1.13.0, criteria only', 'hosted'] };
  $('#cSingle').innerHTML = `<tr><th>Stage</th><th>Model</th><th>Licence</th><th>Accuracy on 150</th><th>Median ms</th></tr>` + STAGES.map(([k, n, c]) => `<tr><td><span class="pill ${c}">${n}</span></td><td class="small">${info[k][0]}</td><td class="small">${info[k][1]}</td><td><b>${pct(s[k])}</b></td><td>${lat(k)}</td></tr>`).join('');
  // frontier
  const G = [0, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95, 1.01]; const pts = [];
  for (const a of G) for (const b of G) for (const c of G) { const r = C.sim.simulate(C.ref.items, { use: { rr: true, llm: true, jev: true }, t: { ts: a, rr: b, llm: c } }); pts.push({ a, b, c, ...r }); }
  const rows = [0, 0.1, 0.2, 0.3, 0.4, 0.5].map((cap) => { const best = pts.filter((p) => p.jev_share <= cap + 1e-9).sort((x, y) => y.accuracy - x.accuracy || x.mean_ms - y.mean_ms)[0]; return { cap, best }; });
  $('#cFrontier').innerHTML = `<tr><th>Max share to Jev</th><th>Best accuracy</th><th>Actually sent</th><th>Thresholds (typesafe · re-reader · LLM)</th><th></th></tr>` + rows.map(({ cap, best }) => `<tr><td>${pct(cap, 0)}</td><td><b>${pct(best.accuracy)}</b></td><td>${pct(best.jev_share, 0)}</td><td>${[best.a, best.b, best.c].map(fmtT).join(' · ')}</td><td><button class="chip" data-t="${best.a},${best.b},${best.c}">apply</button></td></tr>`).join('') + `<tr><td>100% (Jev only)</td><td><b>${pct(C.ref.single.jev)}</b></td><td>100%</td><td>—</td><td></td></tr>`;
  $$('#cFrontier .chip').forEach((b) => (b.onclick = () => { const [a, r, l] = b.dataset.t.split(',').map(Number); $('#tTs').value = a; $('#tRr').value = r; $('#tLlm').value = l; ['#cUseRr', '#cUseLlm', '#cUseJev'].forEach((x) => ($(x).checked = true)); renderCascade(); }));
  const presets = { 'All local': [0.6, 0.4, 0, true, true, false], 'Balanced': [0.6, 0.8, 0.8, true, true, true], 'Jev-light': [0.6, 0.5, 0.8, true, true, true], 'typesafe → Jev': [0.6, 0, 0, false, false, true] };
  $('#cPresets').innerHTML = Object.keys(presets).map((k) => `<button class="chip" data-k="${k}">${k}</button>`).join('');
  $$('#cPresets .chip').forEach((b) => (b.onclick = () => { const [a, r, l, ur, ul, uj] = presets[b.dataset.k]; $('#tTs').value = a; $('#tRr').value = r; $('#tLlm').value = l; $('#cUseRr').checked = ur; $('#cUseLlm').checked = ul; $('#cUseJev').checked = uj; renderCascade(); }));
  renderCascade();
}
['#cUseRr', '#cUseLlm', '#cUseJev', '#tTs', '#tRr', '#tLlm'].forEach((s) => ($(s).oninput = renderCascade));
$('#cRun').onclick = async () => {
  const task = $('#cTask').value; const text = $('#cText').value.trim(); if (!text) return;
  $('#cRun').disabled = true; $('#cRunStatus').textContent = 'running… the local LLM may take ~20 s to wake up'; $('#cOut').innerHTML = '';
  try {
    const o = await api('/api/cascade/message', { task, text });
    const cfg = cCfg(); const order = ['ts', ...(cfg.use.rr ? ['rr'] : []), ...(cfg.use.llm ? ['llm'] : []), ...(cfg.use.jev ? ['jev'] : [])];
    let stop = null; for (let k = 0; k < order.length; k++) { const x = o[order[k]]; if (!x || x.error) continue; if (k === order.length - 1 || x.conf >= (cfg.t[order[k]] ?? 0)) { stop = order[k]; break; } }
    const lab = (v) => task === 'severity' ? ['Low', 'Medium', 'High'][v] : task === 'deadline' ? (v ? 'yes' : 'no') : v;
    $('#cOut').innerHTML = `<div class="table-wrap" style="margin-top:10px"><table><tr><th>Stage</th><th>Answer</th><th>Confidence</th><th>Time</th><th></th></tr>${STAGES.map(([k, n, c]) => { const x = o[k]; if (!x || x.error) return `<tr><td><span class="pill ${c}">${n}</span></td><td colspan="4" class="small muted">${esc(x?.error || '—')}</td></tr>`; return `<tr style="${stop === k ? 'background:var(--accent-soft)' : ''}"><td><span class="pill ${c}">${n}</span></td><td><b>${esc(String(lab(x.pred)))}</b></td><td>${pct(x.conf, 0)}</td><td>${Math.round(x.ms)} ms${x.compute_ms ? ` <span class="muted small">(${x.compute_ms} compute)</span>` : ''}</td><td>${stop === k ? '<span class="pill good">cascade answers here</span>' : ''}</td></tr>`; }).join('')}</table></div>`;
    $('#cRunStatus').textContent = '';
  } catch (e) { $('#cOut').innerHTML = `<div class="callout bad">${esc(e.message)}</div>`; $('#cRunStatus').textContent = ''; }
  $('#cRun').disabled = false;
};
async function initCascade() { try { C.sim = await import('/cascade-core.mjs'); C.ref = await api('/api/cascade'); if (C.ref?.items) renderCascadeStatic(); } catch (e) { console.error(e); } }

// ---------- boot ----------
(async function boot() {
  try {
    [S.meta, S.tickets, S.ev] = await Promise.all([api('/api/meta'), api('/api/tickets'), api('/api/evidence')]);
  } catch (e) { document.querySelector('main').insertAdjacentHTML('afterbegin', `<div class="callout bad">Could not reach the engine: ${esc(e.message)}</div>`); return; }
  renderHeadline(); renderTicketList(); renderE4(); renderE5(); renderEvidence(); renderRV();
  initCascade();
  api('/api/bench').then((b) => { B.data = b.dataset; B.res = b.results; B.thr = b.thresholds; renderBench(); }).catch((e) => console.error(e));
  $('#pgPresets').innerHTML = Object.keys(PRESETS).map((k) => `<button class="chip" data-k="${esc(k)}">${esc(k)}</button>`).join('');
  $$('#pgPresets .chip').forEach((c) => (c.onclick = () => setQuestions(PRESETS[c.dataset.k])));
  setQuestions(null);
  const h = location.hash.slice(1); if (h && $('#page-' + h)) show(h);
  const firstWrong = S.tickets.find((t) => t.jev && t.jev.pred.department !== t.label.department);
  if (firstWrong) openTicket(firstWrong.id);
})();
