// Stage 1: @ruvector/typesafe (ONNX bge-small int8) — zero-shot and trained product heads.
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire('/home/claude/ts/package.json');
const { createTypesafe, choice } = require('@ruvector/typesafe');
const M = '/home/claude/ts/node_modules/@ruvector/typesafe/models';
export const PRODUCTS = {
  debt_collection: 'Debt collection: a collector or agency pursuing a debt, collection calls, letters or disputes about owing a debt',
  checking_savings: 'Checking or savings account: bank deposit account, overdrafts, account opening or closing, deposits and withdrawals',
  credit_card: 'Credit card: a credit card account, card charges, disputes of purchases, card fees, interest, rewards',
  money_transfer: 'Money transfer, virtual currency or money service: payment apps, wire transfers, sending money, crypto',
  mortgage: 'Mortgage: a home loan, mortgage servicing, escrow, foreclosure, loan modification',
  vehicle_loan: 'Vehicle loan or lease: car loan or lease, repossession, auto financing',
  credit_reporting: 'Credit reporting: errors on a credit report, credit bureaus, credit scores, identity theft on a report',
  payday_personal: 'Payday, title or personal loan or cash advance: short-term or instalment loans, loan apps',
  student_loan: 'Student loan: federal or private student loan servicing and repayment',
  prepaid_card: 'Prepaid card: reloadable prepaid or gift or government benefit cards',
  debt_mgmt: 'Debt or credit management: debt settlement, credit repair or debt relief companies',
};
export const KEY = {
  'Debt collection': 'debt_collection', 'Checking or savings account': 'checking_savings', 'Credit card': 'credit_card',
  'Money transfer, virtual currency, or money service': 'money_transfer', 'Mortgage': 'mortgage', 'Vehicle loan or lease': 'vehicle_loan',
  'Credit reporting or other personal consumer reports': 'credit_reporting', 'Payday loan, title loan, personal loan, or advance loan': 'payday_personal',
  'Student loan': 'student_loan', 'Prepaid card': 'prepaid_card', 'Debt or credit management': 'debt_mgmt',
};
const read = (f) => fs.readFileSync(f, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
if (import.meta.url === `file://${process.argv[1]}`) {
  const ts = createTypesafe({ embedder: { kind: 'onnx', modelDir: M, manifest: `${M}/manifest.json` } });
  const q = { product: choice(PRODUCTS) };
  const out = {};
  const run = async (tag, rows) => {
    const t0 = performance.now();
    const res = await ts.decideMany(rows.map((r) => r.text), q);
    const ms = (performance.now() - t0) / rows.length;
    const acc = res.filter((r, i) => r.product.choice === KEY[rows[i].product]).length / rows.length;
    console.log(tag, { acc: +acc.toFixed(3), msPerItem: +ms.toFixed(1) });
    return res.map((r, i) => ({ id: rows[i].id, probs: r.product.probabilities, choice: r.product.choice, conf: r.product.confidence }));
  };
  const val = read('val.jsonl'), test = read('test.jsonl'), train = read('train.jsonl');
  out.zero = { val: await run('zero-shot val', val), test: await run('zero-shot test', test) };
  const t0 = performance.now();
  const ex = train.map((r) => ({ text: r.text, label: KEY[r.product] }));
  let rep;
  for (let i = 0; i < ex.length; i += 50) rep = await ts.train('product', ex.slice(i, i + 50));
  console.log('train', rep, 'sec', ((performance.now() - t0) / 1000).toFixed(0));
  out.trained = { val: await run('trained val', val), test: await run('trained test', test) };
  fs.writeFileSync('stage1-typesafe.json', JSON.stringify(out));
}
