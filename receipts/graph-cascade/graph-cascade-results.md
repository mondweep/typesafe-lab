# Graph + cascade: does @ruvector/kge add anything? (27 Sep 2026)
Companion to kge-evaluation.md and cascade-results.md. Tested on two real public datasets.

**Question:** routing traffic usually comes with history, such as which company a complaint is about or which council a report goes to. Does adding that history help the cascade? And is a knowledge-graph embedding (@ruvector/kge) better than plain counts?

**Short answer:**
- **History is a strong signal:** +10 points on CFPB and +5 points on FixMyStreet for the local stage, and +3 to +5 points for Jev.
- **Simple counts capture most of it today.** The @ruvector/kge prior helps the text model on CFPB. Combined with counts it gives +0.5 points, which is not yet statistically clear.
- **Giving the graph frequency information closes most of the gap** (see "Count-aware KGE"). That points to weighted facts and a faster trainer as the next steps for the package.

## Setup

**Cascade:**
1. typesafe reads the text.
2. Its probabilities are combined with a history prior: `text × prior^weight`.
3. The least confident share goes to Jev.

**Tuning and reporting:**
- Weights, smoothing, temperature and escalation thresholds were all tuned on the validation split.
- All figures below are from the test split.

**Priors compared:**
- **Count prior:** for each company or council, how often past cases fell into each label, with smoothing.
- **KGE prior:** @ruvector/kge 0.1.0 (HolE, 128 dimensions, N3 = 0.05), trained on the history graph. For each company or council it scores every label, and those scores are turned into a probability distribution (softmax with a tuned temperature).

## CFPB (US consumer complaints)

**Data:** CFPB narratives archive exports for March–August 2026. Narratives effectively end in July, because publication stopped on 14 August 2026.

**Task:** route a complaint to one of 11 products.

**Splits:**
- **Training text:** 3,300 complaints from March–May, up to 300 per product.
- **Validation:** 400 random complaints from June.
- **Test:** 600 random complaints from July.
- **History:** 2,473,972 complaints from March–June, used for counts and KGE. Most have no text.

**KGE graph:**
- 21,628 links among 2,257 entities.
- Links cover company–product, company–issue, company–sub-product, company–response, and issue or sub-product → product.
- Training took 88.3 minutes for 20 epochs on 2 vCPU.

| Setup | Test accuracy |
|---|---|
| typesafe, trained head (bge-small int8) | 58.0% |
| + count prior | **68.2%** |
| + KGE prior | 63.2% |
| + counts + KGE | 68.7% |
| Jev, text only | 71.8% |
| Jev, told the company name | 74.5% |
| Jev × count prior | 74.7% |

- **KGE vs counts:** adding KGE to counts fixes 8 items and breaks 5. Exact McNemar test p = 0.58; difference +0.5 points, 95% CI −0.7 to +1.7.
- **Cascade:** with counts, sending about 25–35% of items to Jev gives 73.5–75%. That is at or above Jev on every item (71.8%).
- **Small-history check (1% of history, 24,740 rows):**
  - Counts 67.5%, KGE 64.8%, counts + KGE 66.5%.
  - For companies with only 1–5 past complaints: counts 70.0%, KGE 68.8% (80 items).
  - For companies with no history, neither prior helps.

**Why KGE falls short:**
- The graph records *that* a company has complaints about a product, not *how many*.
- The KGE link scores for the 11 products sit close together, so the prior is nearly flat.
- Example: TransUnion's history is 100% credit reporting, but its KGE prior puts debt collection (17%) above credit reporting (11%).

**Caveats:**
- The labels are the product the consumer picked, so they are noisy.
- Accuracy drops from validation to test (about 80% to 68% with counts), which suggests July differs from June.
- Jev saw text cut to 4,000 characters, about 910 tokens per call.

## FixMyStreet (UK street reports)

**Data:** 169,327 reports from 1 August to 25 September 2026, pulled via the Open311 API in 4-hour windows. The API returns at most 1,000 reports per request, so some busy windows are incomplete.

**Task:** pick the council's own category.
- Every council has its own label set: median 69 options, capped at the 80 most common.
- The local stage is typesafe zero-shot over those category names. There's no trained head, because the labels differ by council.

**Splits:**
- **History:** 108,719 reports before 10 September.
- **Validation:** 200 reports from 10–16 September.
- **Test:** 300 reports from 17–25 September.
- The correct category appeared in the council's history for 99% of test reports.

**KGE graph:** 9,628 council → category and category → keyword links, 5,733 entities, 10 epochs, 51.7 minutes.

| Setup | Test accuracy |
|---|---|
| typesafe, zero-shot | 49.3% |
| + count prior | **54.0%** |
| + KGE prior | 45.7% |
| + counts + KGE | 53.0% |
| Jev, text only (~1,400 tokens per call) | 69.7% |
| Jev × count prior | **74.3%** |

- Here the local stage is weak, so the cascade doesn't reach Jev's accuracy below about 50% escalation.
- The main win is combining **Jev with the count prior**: +4.6 points.
- Tuning note: typesafe's zero-shot probabilities are nearly flat across ~70 options (median top probability 0.02). With prior weights ≥ 0.25 the prior swamped the text, so the tuning grid had to include weights down to 0.01.

## Count-aware KGE (follow-up, 27 Sep)

**Setting:** 1% of history (24,740 complaints), the small-organisation case where a graph should have most to offer. Same test set and tuning method as above.

| Prior (combined with typesafe) | Test accuracy |
|---|---|
| Count prior | 67.5% |
| KGE, binary facts (original) | 64.8% |
| KGE, A: facts repeated by count (1 + log2 n copies) | 65.3% |
| KGE, B: frequency bands ("mostly" ≥50%, "sometimes" 10–50%, "rarely" <10% of a company's complaints) | 66.8% |
| Counts + KGE with bands | 67.8% (10 fixed, 8 broken vs counts) |

- **Option A had no real effect.** `addTriples` stores duplicate facts, but the trainer's `TripleStore` removes duplicates (`data.rs`, `sorted.dedup()`). Repetition therefore never reaches training; the 65.3% is seed noise.
- **Option B worked.** For companies with 6–50 past complaints (266 test items), the banded graph reached 71.8%, against 72.2% for counts and 67.3% with binary facts.
- **Training cost:** about 10 minutes each at this scale.
- **Suggested package improvement:** native weighted facts, or keeping duplicates during training. That would let the graph learn proportions directly rather than through bands.

## Conclusions

1. **Use history in routing cascades now.** A count prior gave the biggest gain in both datasets, for the local stage and for Jev. It is cheap and transparent.
2. **KGE is close once it can see frequency.** Frequency bands brought it within 0.7 points of counts in the small-history setting. Native weighted facts and a batched trainer are the natural next steps.
3. **Where graphs should shine next:**
   - new or low-history companies linked to known ones (shared products, parent groups)
   - matching equivalent categories across councils
   - spotting missing or unusual links
4. **The count prior also helps Jev** (+3 to +5 points). On CFPB it matches telling Jev the company name.

## Lab

- **New tab:** "Graph + cascade", with a dataset toggle (CFPB / FixMyStreet).
- **Contents:**
  - arm-by-arm accuracy tables
  - a slider for the share sent to Jev
  - the full frontier table
  - a company explorer comparing counts with the KGE prior
  - a walk-through of 80 CFPB and 60 FixMyStreet test items, with a live "Ask Jev" button
- **Endpoints:** data at `/api/graph`; download at `/downloads/graph-cascade-v1.json`.

## Reproduce

Scripts are in the session workspace: `~/cfpb` and `~/fms`.

**CFPB:**
- `stage1.mjs`: typesafe.
- `jev.mjs`: Jev calls through the lab's `/api/jev`.
- `build_graph.py`: history graph and counts.
- `kge-prior.mjs`: KGE training and scores.
- `cascade.py`: tuning and frontiers.
- `bucket.py`: breakdown by history size.

**FixMyStreet:**
- `pull.py`: Open311 download.
- `prep.py`: splits, candidates and graph.
- `stages-fms.mjs`: typesafe and Jev.
- `kge-fms.mjs`: KGE training.
- `cascade_fms.py`: tuning and frontiers.

**Lab data:** `build_lab_data.py` produces the tab's data file.
