import { createTypesafe } from '/home/claude/RuVector/npm/packages/typesafe/dist/index.js';
const PKG='/home/claude/RuVector/npm/packages/typesafe';
const pos=['love it','great product','awesome service','fantastic','really happy','brilliant work','superb','delighted with it','wonderful experience','best purchase ever'];
const neg=['hate it','awful','terrible support','bad quality','really disappointed','broken on arrival','worst ever','very unhappy','poor value','useless'];
for (const n of [4,6,10]) {
  const ts=createTypesafe({embedder:{kind:'onnx',modelDir:`${PKG}/models`,manifest:`${PKG}/models/manifest.json`,model:'bge-small-en-v1.5-int8'}});
  const Q={q:{type:'choice',criteria:{pos:'positive',neg:'negative'}}};
  const rep=await ts.train('q',[...pos.slice(0,n).map(t=>({text:t,label:'pos'})),...neg.slice(0,n).map(t=>({text:t,label:'neg'}))]);
  const r=await ts.systemOne({state:'this is wonderful',questions:Q});
  console.log(n, 'report head', rep.head, rep.calibrated, '| answer head', r.answers.q.head, r.answers.q.calibrated, r.answers.q.choice, r.answers.q.confidence.toFixed(3));
}
