import fs from 'fs';
import path from 'path';
import * as tf from '@tensorflow/tfjs-node';
import mobilenetModule from '@tensorflow-models/mobilenet';
const mobilenet = mobilenetModule.default || mobilenetModule;

const API='https://optcgapi.com/api/allSetCards/';
const OUT=path.resolve('data/op16-index.json');

function codeOf(x){for(const v of [x.card_set_id,x.card_id,x.card_image_id]){const m=String(v||'').match(/OP16-\d{3}/);if(m)return m[0]}return ''}
function mapCard(x,code){return {id:code,name:x.card_name||x.name||code,setName:x.set_name||x.card_set||'OP16',setCode:'OP16',collector:code,image:x.card_image||x.image||'',color:x.card_color||x.color||''}}
function normalize(arr){let n=Math.sqrt(arr.reduce((s,x)=>s+x*x,0))||1;return arr.map(x=>Math.round((x/n)*1e6)/1e6)}

const model=await mobilenet.load({version:2,alpha:0.5});
const res=await fetch(API); if(!res.ok) throw new Error(`API ${res.status}`);
const raw=await res.json();
const cards=[]; const seen=new Set();
for(const x of Array.isArray(raw)?raw:[]){const code=codeOf(x);const card=mapCard(x,code);if(!code||!card.image||seen.has(code))continue;seen.add(code);cards.push(card)}
cards.sort((a,b)=>a.collector.localeCompare(b.collector));
console.log('Cards found',cards.length);
const rows=[];
for(let i=0;i<cards.length;i++){
  const c=cards[i];
  try{
    const r=await fetch(c.image); if(!r.ok) throw new Error(`img ${r.status}`);
    const buf=Buffer.from(await r.arrayBuffer());
    const img=tf.node.decodeImage(buf,3);
    const emb=model.infer(img,true);
    const vec=normalize(Array.from(await emb.data()));
    img.dispose(); emb.dispose();
    rows.push({...c,vec});
    console.log(`${i+1}/${cards.length}`,c.collector,'ok');
  }catch(e){console.error(`${i+1}/${cards.length}`,c.collector,'FAIL',e.message)}
}
fs.mkdirSync(path.dirname(OUT),{recursive:true});
fs.writeFileSync(OUT,JSON.stringify({model:'mobilenet-v2-alpha-0.5',set:'OP16',count:rows.length,cards:rows}));
console.log('Wrote',rows.length,'rows');
if(rows.length<80) process.exit(2);
