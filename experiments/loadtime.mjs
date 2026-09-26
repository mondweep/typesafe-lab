import { createTypesafe } from '/home/claude/RuVector/npm/packages/typesafe/dist/index.js';
const PKG='/home/claude/RuVector/npm/packages/typesafe';
for (const model of ['bge-small-en-v1.5-int8','bge-small-en-v1.5']) {
  const t0=performance.now();
  const ts = createTypesafe({ embedder:{kind:'onnx',modelDir:`${PKG}/models`,manifest:`${PKG}/models/manifest.json`,model}});
  const t1=performance.now();
  await ts.decide('hello', {}).catch(e=>e);
  const r = await ts.systemOne({state:'my parcel never arrived', questions:{d:{type:'choice',criteria:{a:'shipping',b:'billing'}}}});
  console.log(model, 'create ms', (t1-t0).toFixed(0), 'first decide ms', (performance.now()-t1).toFixed(0), process.memoryUsage().rss/1e6|0, 'MB rss');
}
