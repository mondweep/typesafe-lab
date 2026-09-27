# Reference ComplEx-N3, 1-vs-all cross-entropy on both sides (no reciprocal relations),
# Adagrad — the same training recipe @ruvector/kge's default mirrors, vectorised.
# usage: python3 ref_complex.py <dir> <rank_complex> <epochs> [lr] [n3] [batch] [eval_every]
import sys, time, json, torch, collections
torch.manual_seed(0)
d, rank, epochs = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
lr = float(sys.argv[4]) if len(sys.argv) > 4 else 0.1
n3 = float(sys.argv[5]) if len(sys.argv) > 5 else 5e-2
B = int(sys.argv[6]) if len(sys.argv) > 6 else 1000
every = int(sys.argv[7]) if len(sys.argv) > 7 else epochs
rd = lambda s: [l.rstrip('\n').split('\t') for l in open(f'{d}/{s}.txt') if l.strip()]
sp = {s: rd(s) for s in ('train', 'valid', 'test')}
E = {}; R = {}
for s in sp.values():
    for a, r, b in s:
        E.setdefault(a, len(E)); E.setdefault(b, len(E)); R.setdefault(r, len(R))
T = {s: torch.tensor([[E[a], R[r], E[b]] for a, r, b in v]) for s, v in sp.items()}
ne, nr = len(E), len(R)
emb_e = torch.nn.Embedding(ne, 2 * rank); emb_r = torch.nn.Embedding(nr, 2 * rank)
for m in (emb_e, emb_r): m.weight.data *= 1e-3
opt = torch.optim.Adagrad(list(emb_e.parameters()) + list(emb_r.parameters()), lr=lr)
def split(x): return x[..., :rank], x[..., rank:]
def scores(q):  # q: [b, 2rank] complex query; returns Re(<q, e>) for all e
    qr, qi = split(q); er, ei = split(emb_e.weight)
    return qr @ er.t() - qi @ ei.t()
def tail_q(s, r):
    sr, si = split(emb_e(s)); rr, ri = split(emb_r(r))
    return torch.cat([sr * rr - si * ri, -(sr * ri + si * rr)], -1)   # conj folded in
def head_q(r, o):
    rr, ri = split(emb_r(r)); orr, oi = split(emb_e(o))
    # Re(sum s * r * conj(o)) = Re(sum s * w), w = r*conj(o)
    wr = rr * orr + ri * oi; wi = ri * orr - rr * oi
    return torch.cat([wr, -wi], -1)
def filt():
    f = collections.defaultdict(set)
    for v in T.values():
        for a, r, b in v.tolist(): f[('t', a, r)].add(b); f[('h', r, b)].add(a)
    return f
F = filt()
@torch.no_grad()
def evaluate(s):
    x = T[s]; rr = []
    for i in range(0, len(x), 500):
        b = x[i:i + 500]
        for side in ('t', 'h'):
            sc = scores(tail_q(b[:, 0], b[:, 1])) if side == 't' else scores(head_q(b[:, 1], b[:, 2]))
            tgt = b[:, 2] if side == 't' else b[:, 0]
            for j in range(len(b)):
                a, r, o = b[j].tolist()
                key = ('t', a, r) if side == 't' else ('h', r, o)
                t = tgt[j].item(); ts = sc[j, t].item()
                row = sc[j].clone(); others = list(F[key] - {t})
                if others: row[others] = -1e30
                gt = (row > ts).sum().item(); eq = (row == ts).sum().item() - 1
                rr.append(1.0 + gt + eq / 2.0)  # expected rank under RANDOM tie-break
    rk = torch.tensor(rr)
    return dict(mrr=(1 / rk).mean().item(), h1=(rk <= 1).float().mean().item(), h3=(rk <= 3).float().mean().item(), h10=(rk <= 10).float().mean().item())
ce = torch.nn.CrossEntropyLoss(reduction='sum')
print(json.dumps(dict(dir=d, ne=ne, nr=nr, rank=rank, reals_per_entity=2 * rank, lr=lr, n3=n3, B=B)), flush=True)
tr = T['train']; t_train = 0
for ep in range(1, epochs + 1):
    t0 = time.time(); perm = tr[torch.randperm(len(tr))]; tot = 0
    for i in range(0, len(perm), B):
        b = perm[i:i + B]
        l = ce(scores(tail_q(b[:, 0], b[:, 1])), b[:, 2]) + ce(scores(head_q(b[:, 1], b[:, 2])), b[:, 0])
        fs = [emb_e(b[:, 0]), emb_r(b[:, 1]), emb_e(b[:, 2])]
        reg = sum((torch.sqrt(split(f)[0] ** 2 + split(f)[1] ** 2) ** 3).sum() for f in fs)
        loss = (l + n3 * reg) / len(b)
        opt.zero_grad(); loss.backward(); opt.step(); tot += l.item()
    t_train += time.time() - t0
    if ep % every == 0 or ep == epochs:
        print(json.dumps(dict(epoch=ep, epoch_s=round(time.time() - t0, 2), loss=tot / len(tr), valid=evaluate('valid'))), flush=True)
print(json.dumps(dict(final=True, epochs=epochs, train_min=round(t_train / 60, 2), test=evaluate('test'))), flush=True)
