# @ruvector/kge: independent evaluation (27 Sep 2026)
Companion to typesafe-vs-jev-evaluation.md and cascade-results.md.

**Package:** @ruvector/kge 0.1.0 (published 21 Sep 2026, MIT, ruvnet). Source at ruvnet/RuVector `npm/packages/kge` + `crates/ruvector-kge*` (added in #1012).
- Bundles a native linux-x64 addon plus a WASM fallback (other platforms get WASM).
- Tested on a 2 vCPU / 8 GB box. Scripts and logs: `~/kge/exp` in the session workspace.

## What it is

- A knowledge-graph embedding library: stores `(subject, relation, object)` triples and learns an entity table and a relation table.
- **HolE** scorer by default (circular correlation via FFT, ≡ ComplEx). **RotatE** opt-in, which adds `compose` (2-hop `r1 ∘ r2` queries).
- Operations: `predict` (fill one missing slot), `similarRelations`, `compose`, `train`, `evaluate` (filtered MRR / Hits@k), `buildIndex` (HNSW for approximate retrieval), and `optimize`.
- `optimize` runs a governed loop that **reuses typesafe-core's loop gate and receipt log**.
- Local only: no network calls. Saved models carry a sha256 envelope.

**Different job from typesafe and Jev.** Those make typed decisions about free text. kge ranks links between symbolic IDs it has already seen. It cannot read text, and a new entity needs retraining.

## Engineering checks

| Check | Result |
|---|---|
| JS test suite | 197 / 197 pass |
| Quick start | Works (native backend) |
| Tampered save file | Rejected ("hash mismatch"), but the error's `.kind` is `undefined`, not one of the documented kinds |
| Save integrity | Unkeyed sha256: catches corruption, not a deliberate edit (anyone can recompute it) |
| Receipts | Inherit typesafe-core's FNV-1a content hash |
| README accuracy | Says "no platform packages yet … ships the WASM fallback", but the tarball has a native linux-x64 addon. Says ANN flags flip "once the ANN index build lands", but it has landed and works |

## Author's release gates vs what was published

ADR-006 says every gate must pass before publishing. The committed receipts (21 Sep) show:

| Gate | Threshold | Author's receipt |
|---|---|---|
| FB15k-237 link prediction | MRR ≥ 0.318 | SKIP (only a 493-entity subgraph was run) |
| WN18RR link prediction | MRR ≥ 0.445 | SKIP (never run) |
| Adversarial confidence drop | > 0 | **FAIL** (confidence rose by 0.06) |
| ANN recall@10 | ≥ 0.90 | PASS on small graphs (0.988) |
| Tie-break, HolE≡ComplEx, loop safety | — | SKIP |

The README is candid that link-prediction quality is "to be measured". Running the two headline gates is the next milestone, and the adversarial gate is a useful open item.

## Training speed: the main finding

- The 1-vs-all trainer calls the scorer (an FFT correlation) and its gradient separately for every entity, for every training triple, on one thread.
- Measured cost: **~5.95 µs per (training triple × entity)**. Consistent across two subgraph sizes (5.94 at 494 entities, 5.96 at 998).

| Data | kge, one epoch | kge, default 100 epochs | Vectorised ComplEx reference, one epoch (1 thread) |
|---|---|---|---|
| FB15k-237, 1,000-entity subgraph | 159 s | ~4.4 h | 0.93 s |
| WN18RR, 3,000-entity subgraph (d=64) | ~51 s | ~1.4 h | 0.45 s |
| FB15k-237 full | **~6.6 h (extrapolated)** | **~27 days** | ~210 s |
| WN18RR full | **~5.9 h (extrapolated)** | **~25 days** | — |

- The reference is ~110–170× faster per epoch, on a single thread.
- Running the FB15k-237 and WN18RR gates will need a faster trainer (see the likely fix below).
- The reference cleared the FB15k-237 gate in ~35 minutes on one core: validation MRR 0.325 at epoch 10 and 0.327 at epoch 20. The run was stopped there, so there is no test-split number.

**Likely fix:** HolE is already factorised as `query · index_vector(entity)`, and this is exactly what `buildIndex` uses. Scoring all entities is therefore one matrix–vector product per query, rather than |E| FFTs. Batching this and adding threads should close most of the gap.

## Quality at matched settings

The same subgraphs and splits were used for all runs. Filtered MRR on the test split, with random tie-break.

| Data | kge (defaults) | Reference, same hyperparameters | Reference, N3 = 0.05 |
|---|---|---|---|
| FB15k-237, 1,000 entities (20 epochs) | 0.446 (60 min) | 0.437 (0.4 min) | **0.492** |
| WN18RR, 3,000 entities | 0.561 (20 epochs, 17 min) | — | 0.547 (60 epochs, 0.6 min) |

- **The maths is correct.** kge matches the reference when both use the same settings.
- **The quality gap comes from regularisation.** kge's default N3 weight is 1e-3; 0.05 adds about 5 points.
- **`optimize` could find that gain with a wider grid.** Its default grid fixes N3 = 0 and varies only the learning rate (0.05 or 0.1).
- Reference N3 sweep on the FB-1000 subgraph: 0 → 0.443, 0.01 → 0.461, 0.05 → 0.492, 0.1 → 0.491.

## Retrieval and latency

These are the WN18RR 3,000-entity model's test and validation queries. The CPU was shared with other runs, so latencies are upper bounds.

| Backend | Exact `predict` p50 / p95 | ANN `predict` p50 / p95 | ANN recall@10 | Index build |
|---|---|---|---|---|
| Native | 0.9 / 5.0 ms | 0.4 / 3.5 ms | **0.865** (below the 0.90 gate) | 1.9 s |
| WASM | 8.6 / 16.8 ms | 0.5 / 4.6 ms | 0.865 | 2.7 s |

## Composition (RotatE)

- Test graph: a synthetic family forest (320 entities, 580 triples).
- `compose(parentOf, parentOf)` returned the exact grandchildren for every query (precision 1.0).
- A HolE model correctly refuses `compose` with an "unsupported" error.
- **Caveat:** these 2-hop facts all come from edges the model was trained on, so a plain graph traversal gives the same answers exactly. The feature only adds value when edges are missing, and that case wasn't tested.

## In the context of typesafe, Jev and the lab

**Correction to our earlier notes:** typesafe does **not** use kge. The dependency runs the other way: `ruvector-kge` depends on `ruvector-typesafe-core` for the loop gate and receipts. (The earlier line "Already in place: `ruvector-embed-core` and `ruvector-kge`" referred to the wider RuVector toolkit, not to typesafe.)

**Same family traits as typesafe:**
- A local, fast, zero-cost scorer with careful ADRs and receipts.
- Release claims run ahead of the measurements actually run.
- A governed loop that is conservative and searches too narrow a space.

**kge → Jev cascade test (WN18RR, 139 test facts, tail prediction):**
- kge retrieves the filtered top 10.
- Jev picks one through the lab's `/api/jev` endpoint (~540 input tokens per call).

| Setup | Hits@1 |
|---|---|
| kge alone | **56.1%** |
| kge top-10 → Jev picks | 46.0% |

**Why Jev didn't help here:**
- Jev overrode 16 correct kge answers and fixed only 2.
- When kge ranked the right answer in its top 10, it almost always ranked it first (78 of 80 cases).
- Jev's "errors" were sensible words but not WordNet's specific sense ID: for example, it picked `organization.n.01` instead of `organization.n.04`, and `abandonment` instead of `deserter`.

**Where the cascade should have helped, kge didn't retrieve the answer:**
- Hypernym ("is a kind of") questions were 49 of the 139.
- kge had the right answer in its top 10 for only 3 of them (10 in the top 50; 29 in the top 500).
- Jev can't pick an answer that isn't offered.

This is the same weak point as the text cascade: a local stage that is confidently wrong (or here, one that misses the answer) blocks escalation.

## Verdict

- **Usable today:** small graphs, up to a few thousand entities and tens of thousands of triples. It gives local, sub-millisecond link prediction with honest filtered metrics. Pass N3 of ~0.05 yourself.
- **Next milestone:** benchmark-scale and production-scale graphs, which a vectorised trainer should unlock. That would also make it possible to run the ADR-006 headline gates.
- **For the lab:** kge is a complement, not a competitor.
  - A sensible use would be structured memory over what typesafe and Jev extract. For example, triples like `(customer, reported, product)` and `(product, ownedBy, team)` could let kge suggest likely links for routing or context.
  - For graph-convention facts (like WordNet sense IDs), the graph's own structure is the stronger signal.

## Notes for the kge author

1. Vectorise the 1-vs-all loss using the existing `query · index_vector` factorisation, and add threading.
2. Add N3 to the default `optimize` grid (for example 0.01, 0.05 or 0.1), or raise the default from 1e-3.
3. Run the FB15k-237 and WN18RR gates once the trainer is faster, and note their status in the README meanwhile. The adversarial gate is worth a look (confidence rose under attack in the committed receipt).
4. Refresh the README: the native addon is now bundled, and the ANN index has landed.
5. Give tamper errors a `.kind`.
6. Consider keyed or signed envelopes and receipts (sha256 and FNV-1a are integrity checks only).
7. Report ANN recall on sparse graphs: 0.865 on the WN18RR subgraph.
