// Stage 2 of the cascade: fine-tuned cross-encoder (DeBERTa-v3-xsmall, MIT) that reads
// (message, "Question: … Answer: <option>") together and scores every option. ONNX int8 via transformers.js.
import { AutoTokenizer, AutoModelForSequenceClassification, env } from '@huggingface/transformers';
import { optionsFor } from './cascade-options.mjs';

export async function createRerankerStage(dir, { quantized = true } = {}) {
  env.allowRemoteModels = false; env.localModelPath = '';
  const tok = await AutoTokenizer.from_pretrained(dir, { local_files_only: true });
  const model = await AutoModelForSequenceClassification.from_pretrained(dir, { local_files_only: true, dtype: quantized ? 'q8' : 'fp32' });
  async function score(q, text) {
    const opts = optionsFor(q);
    const t0 = performance.now();
    const hyps = opts.map((o) => `Question: ${q.instructions} Answer: ${o.hyp}`);
    const enc = await tok(opts.map(() => text), { text_pair: hyps, padding: true, truncation: true, max_length: 160 });
    const { logits } = await model(enc);
    const l = Array.from(logits.data);
    const m = Math.max(...l); const e = l.map((x) => Math.exp(x - m)); const s = e.reduce((a, b) => a + b, 0);
    const p = e.map((x) => x / s); const i = p.indexOf(Math.max(...p));
    return { keys: opts.map((o) => o.key), probs: p, logits: l, pred: opts[i].key, conf: p[i], ms: performance.now() - t0 };
  }
  return { score };
}
