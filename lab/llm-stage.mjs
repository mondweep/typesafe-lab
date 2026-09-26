// Stage 4 of the cascade: a local LLM that answers by scoring option letters, with the task's
// labelled training examples held in a cached prompt prefix (evaluated once per task, reused per message).
// Backend: llama.cpp via node-llama-cpp. (ruvllm `serve` exposes the same model family over an
// OpenAI-compatible API but is ~5-10x slower on CPU today and loads llama/mistral GGUFs only.)
import { getLlama } from 'node-llama-cpp';
import { optionsFor } from './cascade-options.mjs';
export { optionsFor };

const LETTERS = 'ABCDEFGHIJ';


export async function createLlmStage({ modelPath, threads, contextSize = 3072, template = 'chatml', slots = 6 }) {
  const llama = await getLlama({ gpu: false });
  const model = await llama.loadModel({ modelPath });
  const ctx = await model.createContext({ contextSize, threads, sequences: slots });
  // one cached prompt prefix per task, each in its own sequence (LRU when more tasks than slots)
  const slotsFree = Array.from({ length: slots }, () => ctx.getSequence());
  const bySeq = new Map(); // cacheKey -> {seq, prefixLen, used}
  const wrap = template === 'phi3'
    ? { u0: '<|user|>\n', u1: '<|end|>\n<|assistant|>\n' }
    : { u0: '<|im_start|>user\n', u1: '<|im_end|>\n<|im_start|>assistant\n' };
  const letterTok = [...LETTERS].map((c) => model.tokenize(' ' + c)[0]);
  let queue = Promise.resolve();

  function prefixText(q, examples) {
    const opts = optionsFor(q);
    const lines = [
      q.type === 'noul' ? `Decide whether this statement is true of the message: "${q.instructions}"` : q.instructions,
      'Options:', ...opts.map((o, i) => `${LETTERS[i]}) ${o.text}`),
    ];
    if (examples?.length) {
      lines.push('', 'Correctly labelled examples:');
      for (const e of examples) { const i = opts.findIndex((o) => o.key === e.label); lines.push(`- "${e.text}" -> ${LETTERS[i]}`); }
    }
    lines.push('', 'Message:');
    return wrap.u0 + lines.join('\n') + ' "';
  }

  async function score(q, examples, text, cacheKey) {
    const opts = optionsFor(q);
    const pre = prefixText(q, examples);
    const t0 = performance.now();
    let e = bySeq.get(cacheKey);
    if (!e) {
      let seq = slotsFree.pop();
      if (!seq) { const [k, v] = [...bySeq.entries()].sort((a, b) => a[1].used - b[1].used)[0]; bySeq.delete(k); seq = v.seq; }
      await seq.clearHistory();
      await seq.evaluateWithoutGeneratingNewTokens(model.tokenize(pre, true));
      e = { seq, prefixLen: seq.nextTokenIndex, used: 0 }; bySeq.set(cacheKey, e);
    } else if (e.seq.nextTokenIndex > e.prefixLen) {
      await e.seq.eraseContextTokenRanges([{ start: e.prefixLen, end: e.seq.nextTokenIndex }]);
    }
    e.used = Date.now(); const seq = e.seq;
    const suffix = model.tokenize(`${text}"\nAnswer with the letter only.${wrap.u1}Answer:`, true);
    let probs;
    for await (const r of seq.evaluateWithMetadata(suffix, { probabilities: true }, { temperature: 0 })) { probs = r.probabilities; break; }
    const raw = opts.map((_, i) => probs.get(letterTok[i]) ?? 0);
    const sum = raw.reduce((s, x) => s + x, 0) || 1;
    const p = raw.map((x) => x / sum);
    const best = p.indexOf(Math.max(...p));
    return { keys: opts.map((o) => o.key), probs: p, pred: opts[best].key, conf: p[best], ms: performance.now() - t0 };
  }
  // one sequence → serialise calls
  return { score: (...a) => (queue = queue.then(() => score(...a), () => score(...a))), model, ctx };
}
