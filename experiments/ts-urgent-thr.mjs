import { readFileSync } from 'node:fs';
import { createTypesafe } from '/home/claude/RuVector/npm/packages/typesafe/dist/index.js';
const PKG='/home/claude/RuVector/npm/packages/typesafe';
const fx=JSON.parse(readFileSync(`${PKG}/bench/fixtures/tickets-decisions.json`,'utf8'));
const {train,val,test}=fx.split; const Q=fx.gen0_questions;
const ts=createTypesafe({embedder:{kind:'onnx',modelDir:`${PKG}/models`,manifest:`${PKG}/models/manifest.json`,model:'bge-small-en-v1.5-int8'}});
await ts.train('urgent',train.map(r=>({text:r.text,label:r.label.urgent?'yes':'no'})));
const sc=async(rows)=>{const o=[];for(const r of rows)o.push((await ts.systemOne({state:r.text,questions:{urgent:Q.urgent}})).answers.urgent.noul);return o;};
const vs=await sc(val), tsc=await sc(test);
let best={thr:.5,acc:0};for(let t=.05;t<=.95;t+=.01){const a=val.filter((r,i)=>(vs[i]>=t)===r.label.urgent).length/val.length;if(a>best.acc)best={thr:+t.toFixed(2),acc:a};}
console.log(JSON.stringify({val_thr:best.thr, test_acc_tuned: test.filter((r,i)=>(tsc[i]>=best.thr)===r.label.urgent).length/test.length, test_acc_05: test.filter((r,i)=>(tsc[i]>=.5)===r.label.urgent).length/test.length}));
