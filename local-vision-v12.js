/* WallKeep visual scanner v14 - fast visual first, variant-aware */
(function(){
let model=null,index=null,vBusy=false,vLocked=false,missing=0,seen=0,lastDet=null,preloadPromise=null;
const norm=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const l2=v=>{const n=Math.sqrt(v.reduce((s,x)=>s+x*x,0))||1;return v.map(x=>x/n)};
const cos=(a,b)=>{let s=0;const n=Math.min(a.length,b.length);for(let i=0;i<n;i++)s+=a[i]*b[i];return s};
const same=(a,b)=>{a=norm(a);b=norm(b);return !!a&&!!b&&(a===b||a.includes(b)||b.includes(a))};
function lastCard(){return current()?.cards?.[0]||null}
async function loadModel(){
  if(model)return model;
  $('#scanStatus').textContent='Carico modello visuale…';
  try{if(tf.findBackend?.('webgl'))await tf.setBackend('webgl')}catch(e){}
  await tf.ready();
  model=await mobilenet.load({version:2,alpha:0.5});
  return model
}
async function loadIndex(){
  if(index)return index;
  $('#scanStatus').textContent='Carico indice OP16…';
  const r=await fetch('data/op16-index.json?v=14',{cache:'force-cache'});
  if(!r.ok)throw Error('Indice OP16 non ancora disponibile');
  const d=await r.json();
  if(d.model!=='mobilenet-v2-alpha-0.5'||!Array.isArray(d.cards)||!d.cards.length)throw Error('Indice OP16 non valido');
  index=d.cards;
  return index
}
function preload(){
  if(!preloadPromise)preloadPromise=Promise.all([loadModel(),loadIndex()]).catch(e=>{preloadPromise=null;throw e});
  return preloadPromise
}
function modelCanvas(el){
  const out=document.createElement('canvas');out.width=224;out.height=224;
  out.getContext('2d',{alpha:false}).drawImage(el,0,0,224,224);return out
}
async function embedding(el){const m=await loadModel();const small=modelCanvas(el);const t=m.infer(small,true);const a=l2(Array.from(await t.data()));t.dispose();return a}
function addReview(card,confidence){const l=current();l.game=game;l.name=$('#scanListName').value||l.name;l.cards.unshift({id:crypto.randomUUID?crypto.randomUUID():Date.now()+''+Math.random(),game:'One Piece',quantity:1,condition:'',language:'',foil:'',price:'',resolved:false,needsReview:true,visionConfidence:confidence,...card});save();navigator.vibrate?.([50,30,50])}
function duplicate(card,confidence){document.querySelector('#duplicateBtn')?.remove();const b=document.createElement('button');b.id='duplicateBtn';b.className='btn w100';b.style.marginTop='8px';b.textContent='+ AGGIUNGI UN’ALTRA COPIA DI '+card.name.toUpperCase();b.onclick=()=>{const x=lastCard();if(x&&same(x.name,card.name)){x.quantity=(+x.quantity||1)+1;save()}else addReview(card,confidence);b.remove();$('#scanStatus').innerHTML='<span class=good>✓ Copia aggiunta. Rimuovi la carta.</span>'};$('#scanStatus').insertAdjacentElement('afterend',b);$('#scanStatus').innerHTML='<span class=bad>'+esc(card.name)+' è uguale alla precedente. Conferma solo se è una seconda copia.</span>'}
function bottomCrop(canvas){const out=document.createElement('canvas');const y=Math.floor(canvas.height*.58),h=canvas.height-y;out.width=Math.min(900,canvas.width);out.height=Math.max(1,Math.round(h*out.width/canvas.width));out.getContext('2d',{willReadFrequently:true}).drawImage(canvas,0,y,canvas.width,h,0,0,out.width,out.height);return out}
async function ocrText(canvas){try{const w=await ocr();return (await w.recognize(bottomCrop(canvas))).data.text||''}catch(e){return''}}
function boost(c,text){const t=norm(text),name=norm(c.name),code=norm(c.collector);let b=0;if(name&&t.includes(name))b+=.22;for(const w of name.split(' '))if(w.length>3&&t.includes(w))b+=.04;if(code&&t.includes(code))b+=.35;if(t.includes('op16'))b+=.05;return Math.min(.4,b)}
function showDebug(rows,text,mode){let el=document.querySelector('#ocrDebug');if(!el){el=document.createElement('details');el.id='ocrDebug';el.className='panel';el.innerHTML='<summary style="cursor:pointer;color:#f3d17a;font-weight:700">Diagnostica riconoscimento</summary><pre id="ocrDebugText" style="white-space:pre-wrap;font-size:11px;color:#aaa"></pre>';$('#scanStatus').insertAdjacentElement('afterend',el)}el.querySelector('#ocrDebugText').textContent='MODALITÀ: '+mode+'\nOCR:\n'+(text||'(saltato: risultato visuale netto)')+'\n\nTOP CANDIDATES:\n'+rows.slice(0,5).map((x,i)=>`${i+1}. ${x.name} ${x.collector}${x.variantIndex?` v${x.variantIndex}`:''} • visual ${x._visual.toFixed(3)} • bonus ${(x._boost||0).toFixed(3)} • score ${x._score.toFixed(3)}`).join('\n')}
function visuallyConfident(rows){if(rows.length<2)return true;const a=rows[0]._visual,b=rows[1]._visual,margin=a-b;return (a>=.70&&margin>=.010)||(a>=.67&&margin>=.020)||(a>=.64&&margin>=.040)}
async function identify(canvas){
  const idx=await loadIndex();const q=await embedding(canvas);
  let rows=idx.map(c=>{const visual=cos(q,c.vec);return{...c,_visual:visual,_boost:0,_score:visual}}).sort((a,b)=>b._visual-a._visual);
  const sameCollectorTop=rows.length>1&&rows[0].collector===rows[1].collector;
  if(visuallyConfident(rows)||sameCollectorTop){showDebug(rows,'',sameCollectorTop?'VISUALE VARIANTE':'VISUALE RAPIDO');return rows}
  $('#scanStatus').textContent='Confronto ambiguo • leggo nome/codice…';
  const text=await ocrText(canvas);
  rows=rows.map(c=>{const b=boost(c,text);return{...c,_boost:b,_score:c._visual*.86+b}}).sort((a,b)=>b._score-a._score);
  showDebug(rows,text,'VISUALE + OCR MIRATO');return rows
}
scanDetected=async function(d){if(vBusy||vLocked)return;vBusy=true;try{if(game!=='onepiece')throw Error('Scanner visuale v14 in test solo su One Piece OP16');const frozen=warpDetected(d);$('#scanStatus').textContent='Fotogramma congelato • riconosco…';await preload();const rows=await identify(frozen);if(!rows.length)throw Error('Nessun candidato');const card=rows[0],clean={...card};delete clean.vec;delete clean._visual;delete clean._boost;delete clean._score;vLocked=true;const last=lastCard();if(last&&same(last.name,clean.name)){duplicate(clean,card._score);return}addReview(clean,card._score);$('#scanStatus').innerHTML='<span class=good>✓ '+esc(clean.name)+' • '+esc(clean.collector)+' aggiunta. Rimuovi la carta.</span>';stableFrames=0;lastQuad=null}catch(e){vLocked=true;$('#scanStatus').innerHTML='<span class=bad>'+esc(e.message)+'</span>'}finally{vBusy=false}}
const detector=detectCard;
startDetection=function(){clearInterval(detectTimer);if(game==='onepiece')preload().catch(e=>{$('#scanStatus').innerHTML='<span class=bad>'+esc(e.message)+'</span>'});detectTimer=setInterval(()=>{const d=detector();if(d){missing=0;lastDet=d;seen++;if(!vLocked)$('#scanStatus').textContent=seen>=2?'Carta stabile • acquisisco…':'Carta rilevata…';if(rapid&&!vBusy&&!vLocked&&seen>=2)scanDetected({...d,stable:true})}else{missing++;seen=0;if(missing<5&&lastDet){if(!vLocked)$('#scanStatus').textContent='Mantengo aggancio…';return}lastDet=null;if(missing>=5){vLocked=false;document.querySelector('#duplicateBtn')?.remove();lastCode=''}if(!vLocked)$('#scanStatus').textContent='Cerco la carta…'}},180)};
})();