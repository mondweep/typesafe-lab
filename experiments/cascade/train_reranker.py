# Stage 2 of the cascade: a cross-encoder that reads (message, question+option) together.
# Trained ONLY on bench-v1's train split; evaluated on its test split. Multi-task: one model for all 3 tasks.
import json, sys, time, random, math, os
import numpy as np, torch
from sentence_transformers.cross_encoder import CrossEncoder
from torch.utils.data import DataLoader
from sentence_transformers import InputExample

random.seed(0); np.random.seed(0); torch.manual_seed(0)
BASE = sys.argv[1] if len(sys.argv) > 1 else "MoritzLaurer/deberta-v3-xsmall-zeroshot-v1.1-all-33"
OUT = sys.argv[2] if len(sys.argv) > 2 else "/home/claude/experiments/cascade/reranker-xsmall"
EPOCHS = int(os.environ.get("EPOCHS", 4))
bench = json.load(open("/home/claude/typesafe-lab/data/bench-v1.json"))
Q = bench["questions"]

def options(task):
    q = Q[task]
    if q["type"] == "choice": return [(k, v) for k, v in q["criteria"].items()]
    if q["type"] == "score": return [(i, t) for i, t in enumerate(q["criteria"])]
    return [(True, "yes"), (False, "no")]

def hyp(task, opt_text):
    q = Q[task]
    if q["type"] == "noul": return f"Question: {q['instructions']} Answer: {opt_text}"
    return f"Question: {q['instructions']} Answer: {opt_text}"

pairs = []
for task in Q:
    for ex in bench["train"][task]:
        for key, text in options(task):
            pairs.append(InputExample(texts=[ex["text"], hyp(task, text)], label=1.0 if key == ex["label"] else 0.0))
random.shuffle(pairs)
print("train pairs", len(pairs), "positives", sum(p.label for p in pairs))

model = CrossEncoder(BASE, num_labels=1, max_length=160, automodel_args={"ignore_mismatched_sizes": True})
t0 = time.time()
model.fit(train_dataloader=DataLoader(pairs, shuffle=True, batch_size=16), epochs=EPOCHS, warmup_steps=10, optimizer_params={"lr": 3e-5}, show_progress_bar=False)
print("train secs", round(time.time() - t0))
model.save(OUT)

# evaluate on test split
res = {}
for task in Q:
    opts = options(task); rows = []
    t1 = time.time()
    for it in bench["test"][task]:
        logits = model.predict([[it["text"], hyp(task, t)] for _, t in opts], activation_fn=torch.nn.Identity())
        p = np.exp(logits - logits.max()); p = p / p.sum()
        rows.append({"id": it["id"], "label": it["label"], "tag": it["tag"], "probs": [float(x) for x in p], "keys": [k for k, _ in opts]})
    ms = (time.time() - t1) * 1000 / len(rows)
    if Q[task]["type"] == "noul":
        acc = np.mean([(r["probs"][0] >= 0.5) == r["label"] for r in rows])
    else:
        acc = np.mean([r["keys"][int(np.argmax(r["probs"]))] == r["label"] for r in rows])
    res[task] = {"accuracy": float(acc), "ms_per_item": round(ms, 1), "rows": rows}
    print(task, "acc", round(float(acc), 3), "ms/item", round(ms, 1))
json.dump(res, open(OUT + "-test.json", "w"))
