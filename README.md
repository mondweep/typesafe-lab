# Typed Decision Lab: @ruvector/typesafe vs Jev

An independent, reproducible evaluation of two ways to make fast, typed AI decisions (a label, a score or a yes/no):

- **[@ruvector/typesafe](https://github.com/ruvnet/RuVector/tree/main/npm/packages/typesafe)**: a local, open-source (MIT) embedding classifier from rUv's [RuVector](https://github.com/ruvnet/RuVector) project.
- **[Jev](https://typesafe.ai/blog/introducing-system-one-models-and-jev)**: typesafe.ai's hosted "System One" model.

It also includes a four-stage **cascade** (typesafe → re-reader → local LLM → Jev) that answers easy cases locally and escalates only the hard ones.

**Investigated and orchestrated by [Mondweep Chakravorty](https://www.linkedin.com/in/mondweepchakravorty/), with Claude as build and analysis partner.**

- **Live lab:** https://typesafe-lab-276367410975.europe-west2.run.app
- **Scroll-through story:** https://typesafe-lab-276367410975.europe-west2.run.app/story

This is an independent evaluation. There is no commercial relationship with either project.

## Headline results

### Author's ticket dataset (150 test messages, 8 departments)

| Setup | Labelled examples | Department accuracy | Calibration error (ECE) |
|---|---|---|---|
| typesafe, no training | 0 | 44.0% | 0.309 |
| typesafe, trained | ~120 to 530 | 79 to 84% | 0.039 to 0.075 |
| Jev, no training | 0 | 84.7% | 0.066 |
| Jev, 3 examples per option | 24 | 89.3% | 0.056 |

### Fresh benchmark, bench-v1 (124 train and 150 test items, no overlap)

| Setup | Council routing | Safety severity | High-danger caught | Deadline | Overall |
|---|---|---|---|---|---|
| typesafe, no training | 73.3% | 33.3% | 0 of 15 | 73.3% | 61.3% |
| typesafe, trained | 80.0% | 53.3% | 6 of 15 | 88.9% | 74.7% |
| Jev, no examples | 100% | 77.8% | 15 of 15 | 100% | 93.3% |
| Jev, training examples in state | 100% | 93.3% | 15 of 15 | 100% | 98.0% |

### Cascade on bench-v1

| Share sent to Jev | Accuracy |
|---|---|
| 0% (all local) | 80.7% |
| 9% | 84.7% |
| 16% | 88.0% |
| 22% | 90.7% |
| 31% | 92.7% |
| 41% | 93.3% (same as Jev alone) |

**Caveat:** the cascade thresholds were tuned on the test items, so these figures are an upper bound.

### Other findings

- **typesafe ignores the question text on `choice` questions.** For example, changing "own" to "avoid" has no effect.
- **Embeddings barely register negation.** On "needs a response" vs "does NOT need one", typesafe scores 0.84 vs 0.81; Jev scores 0.97 vs 0.04.
- **Off-topic messages, with an explicit "other" option:**
  - Jev catches 77% with 1% false alarms.
  - typesafe catches 17% with 24% false alarms.
- **Speed and calibration:**
  - typesafe answers in 4 to 26 ms; Jev takes about 110 to 160 ms.
  - Trained typesafe has well-calibrated confidence.

### Limitations

- **Single annotator:** bench-v1 was written by an AI.
- **Ceiling effect:** Jev is at 100% on two of the three tasks.
- **Optimistic cascade numbers:** the thresholds were tuned on test.
- **Blind spot:** a confidently wrong local stage never escalates.

**Peer review is very welcome.**

## Repository layout

```
lab/            The web app (Node 22, no framework)
  server.mjs      API + static server; Jev proxy with rate limits; cascade endpoints
  bench-core.mjs  Shared benchmark logic (metrics, request builders), also served to the browser
  run-bench.mjs   Offline four-setup benchmark runner
  cascade-*.mjs   Cascade simulation and evaluation
  rr-stage.mjs    Re-reader stage (transformers.js, int8 ONNX)
  llm-stage.mjs   Local LLM stage (node-llama-cpp)
  data/           bench-v1 dataset, reference results, evidence, cascade run
  public/         Front end, including story.html (scrollytelling) and screenshots
llm-service/    Cloud Run service for the local LLM stage (Qwen2.5-1.5B-Instruct Q4_K_M)
experiments/    Scripts used for the investigation (dataset build, re-reader training, ONNX export, probes)
receipts/       Raw outputs from benchmark runs
media/          Screenshot and video rendering scripts
scripts/        Asset fetch helper
```

## Running it yourself

### 1. Fetch the large assets

The native typesafe build and the fine-tuned re-reader are too big for git, so they are published as release assets:

```bash
./scripts/fetch-assets.sh     # downloads into lab/vendor and lab/models
```

You can also build them yourself:

- **typesafe:** build `npm/packages/typesafe` from RuVector with `cargo build --release -p ruvector-typesafe-ffi --features native-onnx` and `node scripts/fetch-models.mjs`, then copy the package to `lab/vendor/typesafe`.
- **Re-reader:** run `experiments/cascade/train_reranker.py`, then `export_onnx.py`.

### 2. Run the lab

```bash
cd lab
npm install --omit=dev --ignore-scripts
JEV_API_KEY=... node server.mjs      # the Jev key is optional; without it the Jev arms are disabled
```

Then open http://localhost:8080.

The local LLM stage is optional. To enable it, run `llm-service` and set these on the lab:

- `LLM_URL` to the service's address.
- `LAB_TOKEN` to the shared secret the service expects.

### 3. Rerun the benchmark offline

```bash
cd lab
JEV_KEY_FILE=/path/to/key node run-bench.mjs     # writes a results JSON like data/bench-v1-results.json
```

### Deploying to Cloud Run

The lab was deployed with `gcloud run deploy --source .`. Keys are held in Secret Manager and mounted as environment variables:

- `JEV_API_KEY`
- `LAB_TOKEN`

Never commit keys.

### Notes

- Scripts in `experiments/` were run in a scratch workspace and reference absolute paths such as `/home/claude/RuVector`. Adjust these to your checkout.

## Licences

| Component | Licence |
|---|---|
| This repository | Apache 2.0 (see `LICENSE` and `NOTICE`) |
| @ruvector/typesafe | MIT (rUv) |
| bge-small-en-v1.5 | MIT |
| DeBERTa-v3-xsmall zero-shot base (MoritzLaurer) | MIT |
| Qwen2.5-1.5B-Instruct | Apache 2.0 |
| Inter font | SIL OFL |

Jev is a commercial API from typesafe.ai and needs your own key.

## Get involved

- **Challenge the method:** open an issue.
- **Improve a stage:** send a pull request.
- **Test the cascade on real data:** share a use case where you make many small typed decisions, and I will try the cascade against it.
- **Get in touch:** [LinkedIn](https://www.linkedin.com/in/mondweepchakravorty/).
