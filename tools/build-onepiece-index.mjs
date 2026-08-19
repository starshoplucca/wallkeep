import fs from 'fs';
import path from 'path';
import * as tf from '@tensorflow/tfjs-node';
import mobilenetModule from '@tensorflow-models/mobilenet';
const mobilenet=mobilenetModule.default||mobilenetModule;
const API='https://optcgapi.com/api/allSetCards/';
const ROOT=path.resolve('data/onepiece');
const MANIFEST=path.resolve('data/onepiece-manifest.json');
const CODE_RE=/(OP\d{2}-\d{3}|EB\d{2}-\d{3}|ST\d{2}-\d{3}|P-\d{3}|PRB\d{2}-\d{3})/i;
function codeOf(x){for(const v of [x.card_set_id,x.card_id,x.card_image_id,x.card_number]){const m=String(v||'').match(CODE_RE);if(m)return m[0].toUpperCase()}return''}
function setOf(code){const m=String(code).match(/^(OP\d{2}|EB\d{2}|ST\d{2}|PRB\d{2}|P)(?:-|$)/);return m?m[1]:'MISC'}
function mapCard(x,code){return{name:x.card_name||x.name||code,setName:x.set_name||x.card_set||setOf(code),setCode:setOf(code),collector:code,image:x.card_image||x.image||'',color:x.card_color||x.color||'',sourceImageId:String(x.card_image_id||'')}}
function normalize(arr){let n=Math.sqrt(arr.reduce((s,x)=>s+x*x,0))||1;return arr.map(x=>x/n)}
function roundVec(arr){return arr.map(x=>Math.round(x*1e6)/1e6)}
function coarse(arr){const out=[];for(let i=0;i<arr.length;i+=10)out.push(Math.round(arr[i]*10000)/10000);return out}
const model=await mobilenet.load({version:2,alpha:0.5});
const res=await fetch(API);if(!res.ok)throw new Error(`API ${res.status}`);const raw=await res.json();
const cards=[],seen=new Set();
for(const x of Array.isArray(raw)?raw:[]){const code=codeOf(x),card=mapCard(x,code),img=String(card.image||'').trim(),key=code+'|'+img;if(!code||!img||seen.has(key))continue;seen.add(key);cards.push(card)}
cards.sort((a,b)=>a.setCode.localeCompare(b.setCode)||a.collector.localeCompare(b.collector)||a.image.localeCompare(b.image));
const variants=new Map();for(const c of cards){const k=c.collector,n=(variants.get(k)||0)+1;variants.set(k,n);c.variantIndex=n;c.id=`${c.collector}#${n}`}
console.log('Artwork rows',cards.length,'collector numbers',variants.size);
const bySet=new Map(),global=[];
for(let i=0;i<cards.length;i++){
 const c=cards[i];try{
  const r=await fetch(c.image);if(!r.ok)throw new Error(`img ${r.status}`);const buf=Buffer.from(await r.arrayBuffer());
  const img=tf.node.decodeImage(buf,3),resized=tf.image.resizeBilinear(img,[224,224]),emb=model.infer(resized,true);const vec=normalize(Array.from(await emb.data()));img.dispose();resized.dispose();emb.dispose();
  const row={...c,vec:roundVec(vec)};if(!bySet.has(c.setCode))bySet.set(c.setCode,[]);bySet.get(c.setCode).push(row);
  global.push({id:c.id,name:c.name,setCode:c.setCode,collector:c.collector,variantIndex:c.variantIndex,color:c.color,coarse:coarse(vec)});
  console.log(`${i+1}/${cards.length}`,c.collector,'v'+c.variantIndex,'ok');
 }catch(e){console.error(`${i+1}/${cards.length}`,c.collector,'FAIL',e.message)}
}
fs.rmSync(ROOT,{recursive:true,force:true});fs.mkdirSync(ROOT,{recursive:true});
const sets=[];for(const [setCode,rows] of [...bySet.entries()].sort((a,b)=>a[0].localeCompare(b[0]))){const fn=`${setCode.toLowerCase()}.json`;fs.writeFileSync(path.join(ROOT,fn),JSON.stringify({model:'mobilenet-v2-alpha-0.5',set:setCode,count:rows.length,cards:rows}));sets.push({setCode,file:`data/onepiece/${fn}`,count:rows.length})}
fs.writeFileSync(MANIFEST,JSON.stringify({model:'mobilenet-v2-alpha-0.5',coarseStep:10,count:global.length,sets,cards:global}));
console.log('Wrote',sets.length,'set shards and',global.length,'global rows');if(global.length<500)process.exit(2);
