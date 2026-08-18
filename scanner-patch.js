/* WallKeep recognition patch v6 */
(function(){
const genericWords=new Set(['set','card','carta','the','di','del','edition','edizione']);
function qTokens(q){return String(q||'').toLowerCase().replace(/[–—]/g,'-').split(/[^a-z0-9'-]+/).filter(t=>t.length>1&&!genericWords.has(t));}
function normText(s){return String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,' ');}
function allTokensMatch(r,q){const ts=qTokens(q),hay=normText([r.name,r.setName,r.setCode,r.collector].join(' '));return ts.every(t=>hay.includes(normText(t).trim()));}
function numericTokens(q){return qTokens(q).filter(t=>/\d/.test(t));}
function meaningfulLine(text){const bad=/^(basic|stage|trainer|supporter|item|energy|creature|instant|sorcery|artifact|enchantment|legendary|character|leader|event|stage)$/i;return String(text||'').split(/\r?\n/).map(x=>x.replace(/[^A-Za-z0-9.'’\- ]/g,' ').replace(/\s+/g,' ').trim()).filter(x=>x.length>=3&&!bad.test(x)).sort((a,b)=>{const aw=/^[A-Za-z][A-Za-z.'’\- ]+$/.test(a)?10:0,bw=/^[A-Za-z][A-Za-z.'’\- ]+$/.test(b)?10:0;return bw-aw||a.length-b.length;})[0]||'';}
async function getPokemonDetails(list){const out=[];for(const b of(Array.isArray(list)?list:[]).slice(0,120)){try{const d=await json(`https://api.tcgdex.net/v2/en/cards/${encodeURIComponent(b.id)}`);out.push({name:d.name||b.name,setName:d.set?.name||'',setCode:d.set?.id||'',collector:d.localId||b.localId||'',image:d.image?d.image+'/high.webp':b.image||'',externalId:d.id});}catch(e){}}return out;}
searchPokemon=async function(q){const ts=qTokens(q);if(!ts.length)return[];const nameToken=ts.find(t=>!/\d/.test(t)&&!/^(sv|swsh|sm|xy|bw|hgss|dp|pl|ex)\d*$/i.test(t))||ts[0];let arr=[];try{arr=await json(`https://api.tcgdex.net/v2/en/cards?name=${encodeURIComponent(nameToken)}`)}catch(e){return[]}let out=await getPokemonDetails(arr);const strict=out.filter(r=>allTokensMatch(r,q));if(strict.length)out=strict;else{const nums=numericTokens(q);if(nums.length){const byNum=out.filter(r=>nums.every(n=>normText(r.collector+' '+r.setCode).includes(normText(n).trim())));if(byNum.length)out=byNum;}}return out.sort((a,b)=>scoreResult(b,q)-scoreResult(a,q)).slice(0,40);};
searchOP=async function(q){let code=String(q).toUpperCase().match(/(?:OP|ST|EB|PRB)\s*-?\s*\d{1,2}(?:\s*-\s*\d{3})?/i)?.[0];if(code&&/-\s*\d{3}/.test(code)){let x=await findOP(code.replace(/\s/g,''));if(x.length)return x}const all=await loadOP();let out=all.filter(r=>allTokensMatch(r,q));if(!out.length){const ts=qTokens(q);out=all.filter(r=>ts.every(t=>normText(r.name+' '+r.setName+' '+r.setCode+' '+r.collector).includes(normText(t).trim())))}return out.sort((a,b)=>scoreResult(b,q)-scoreResult(a,q)).slice(0,40);};
searchMagic=async function(q){const ts=qTokens(q);if(!ts.length)return[];let named=null;for(let n=ts.length;n>=1&&!named;n--){const candidate=ts.slice(0,n).join(' ');try{named=await json(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(candidate)}`)}catch(e){}}if(!named)return[];let prints=[];try{let d=await json(`https://api.scryfall.com/cards/search?q=${encodeURIComponent('!"'+named.name+'"')}&unique=prints&order=released`);prints=(d.data||[]).map(mapMagic)}catch(e){prints=[mapMagic(named)]}let strict=prints.filter(r=>allTokensMatch(r,q));if(strict.length)prints=strict;else prints.sort((a,b)=>scoreResult(b,q)-scoreResult(a,q));return prints.slice(0,40);};
function showOcr(top,bottom,full='',codeText=''){let el=document.querySelector('#ocrDebug');if(!el){el=document.createElement('details');el.id='ocrDebug';el.className='panel';el.style.marginTop='8px';el.innerHTML='<summary style="cursor:pointer;color:#f3d17a;font-weight:700">Diagnostica OCR</summary><pre id="ocrDebugText" style="white-space:pre-wrap;font-size:11px;color:#aaa;margin:8px 0 0"></pre>';document.querySelector('#scanStatus').insertAdjacentElement('afterend',el)}el.querySelector('#ocrDebugText').textContent='TOP:\n'+top+'\n\nBOTTOM:\n'+bottom+(codeText?'\n\nCODE ZONE:\n'+codeText:'')+(full?'\n\nFULL:\n'+full:'');}
function relaxedPokemonNumber(t){t=String(t||'').toUpperCase().replace(/O/g,'0');let m=t.match(/\b(\d{1,3}[A-Z]?)\s*[\/\\]\s*(\d{2,3})\b/);if(m)return{local:m[1],total:m[2]};m=t.match(/\b(\d{1,3})\s+(\d{3})\b/);return m?{local:m[1],total:m[2]}:null;}
async function pokemonByName(name,bottom){if(!name)return[];let q=name;const p=relaxedPokemonNumber(bottom);if(p)q+=' '+p.local+' '+p.total;return searchPokemon(q);}
async function magicByOcr(top,bottom){const mb=magicBottom(bottom);let x=await findMagic(top,mb);if(x.length)return x;const name=meaningfulLine(top);if(!name)return[];return searchMagic(name+' '+(mb.set||'')+' '+(mb.collector||''));}
function cropRegion(src,x0,y0,x1,y1,scale=3){const c=document.createElement('canvas'),ctx=c.getContext('2d'),sx=src.width*x0,sy=src.height*y0,sw=src.width*(x1-x0),sh=src.height*(y1-y0);c.width=Math.max(1,Math.round(sw*scale));c.height=Math.max(1,Math.round(sh*scale));ctx.filter='grayscale(1) contrast(2.4)';ctx.drawImage(src,sx,sy,sw,sh,0,0,c.width,c.height);return c;}
function normalizeOPCodeText(t){return String(t||'').toUpperCase().replace(/[–—_]/g,'-').replace(/\s+/g,' ').replace(/O(?=\d)/g,'0').replace(/I(?=\d)/g,'1').replace(/L(?=\d)/g,'1');}
function extractStrictOPCode(t){const s=normalizeOPCodeText(t);let m=s.match(/\b((?:OP|ST|EB|PRB)\s*-?\s*\d{1,2}\s*-\s*\d{3})\b/);if(m)return m[1].replace(/\s/g,'').replace(/^([A-Z]+)-?(\d+)-/,'$1$2-');m=s.match(/\b(P\s*-\s*\d{3})\b/);return m?m[1].replace(/\s/g,''):null;}
function namesCompatible(ocrName,dbName){const a=normText(ocrName).trim(),b=normText(dbName).trim();if(!a||!b)return true;if(a===b||a.includes(b)||b.includes(a))return true;const aa=new Set(a.split(/\s+/)),bb=new Set(b.split(/\s+/)),shared=[...aa].filter(x=>x.length>2&&bb.has(x));return shared.length>=1;}
let physicalLocked=false,missingFrames=0,lastDetection=null;
const originalDetectCard=detectCard;
startDetection=function(){clearInterval(detectTimer);detectTimer=setInterval(()=>{let d=originalDetectCard();if(d){missingFrames=0;lastDetection=d;$('#scanStatus').innerHTML=d.stable?'<span class=good>✓ Carta agganciata</span>':'Carta rilevata…';if(rapid&&d.stable&&!busy&&!physicalLocked)scanDetected(d);}else{missingFrames++;if(missingFrames<6&&lastDetection){$('#scanStatus').textContent=physicalLocked?'Carta acquisita: rimuovila per continuare.':'Mantengo l’aggancio…';return}lastDetection=null;if(missingFrames>=6){physicalLocked=false;lastCode='';}$('#scanStatus').textContent='Cerco i bordi della carta…';}},220);};
scanDetected=async function(d){if(busy||physicalLocked)return;busy=true;try{const wc=warpDetected(d),w=await ocr();const top=(await w.recognize(cropCanvas(wc,.02,.23))).data.text||'',bottom=(await w.recognize(cropCanvas(wc,.70,.995))).data.text||'';let cands=[],code='',full='',codeText='';
if(game==='onepiece'){
  const codeCanvas=cropRegion(wc,.48,.78,.995,.995,4);
  codeText=(await w.recognize(codeCanvas,{tessedit_char_whitelist:'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789- '})).data.text||'';
  code=extractStrictOPCode(codeText+' '+bottom);
  showOcr(top,bottom,'',codeText);
  if(!code){physicalLocked=true;$('#scanStatus').innerHTML='<span class=bad>Nome/testo rilevato, ma codice One Piece non letto. Nessuna carta aggiunta. Rimuovi la carta e riprova.</span>';return;}
  cands=await findOP(code);
  if(!cands.length){physicalLocked=true;$('#scanStatus').innerHTML='<span class=bad>Codice '+esc(code)+' letto, ma non trovato nel database. Nessuna carta aggiunta.</span>';return;}
  const ocrName=meaningfulLine(bottom+'\n'+top);
  if(ocrName&&!namesCompatible(ocrName,cands[0].name)){physicalLocked=true;$('#scanStatus').innerHTML='<span class=bad>Codice '+esc(code)+' trovato, ma il nome OCR non è coerente con '+esc(cands[0].name)+'. Nessuna carta aggiunta.</span>';return;}
}else if(game==='pokemon'){
  let p=relaxedPokemonNumber(bottom);if(p){code=p.local+'/'+p.total;cands=await findPK(p,top)}
  if(!cands.length){full=(await w.recognize(cropCanvas(wc,.02,.995))).data.text||'';cands=await pokemonByName(meaningfulLine(top+'\n'+full),bottom+'\n'+full)}
  showOcr(top,bottom,full);
  if(cands.length!==1){physicalLocked=true;$('#scanStatus').innerHTML='<span class=bad>Pokémon riconosciuto, ma stampa non determinata con certezza. Nessuna carta aggiunta automaticamente.</span>';return;}
  code=cands[0].externalId||cands[0].collector;
}else{
  cands=await magicByOcr(top,bottom);if(!cands.length){full=(await w.recognize(cropCanvas(wc,.02,.995))).data.text||'';cands=await magicByOcr(top+'\n'+full,bottom+'\n'+full)}showOcr(top,bottom,full);
  if(cands.length!==1){physicalLocked=true;$('#scanStatus').innerHTML='<span class=bad>Magic riconosciuta, ma stampa non determinata con certezza. Nessuna carta aggiunta automaticamente.</span>';return;}
  code=cands[0].externalId||cands[0].collector;
}
if(!cands.length){physicalLocked=true;$('#scanStatus').innerHTML='<span class=bad>Carta non identificata. Nessuna carta aggiunta.</span>';return;}
physicalLocked=true;lastCode=code;add(cands[0],[cands[0]]);$('#scanStatus').innerHTML='<span class=good>✓ '+esc(cands[0].name)+' • '+esc(cands[0].collector)+' acquisita. Ora rimuovi la carta.</span>';navigator.vibrate?.([50,30,50]);stableFrames=0;lastQuad=null;
}catch(e){physicalLocked=true;$('#scanStatus').innerHTML='<span class=bad>Errore riconoscimento: '+esc(e.message)+'</span>'}finally{busy=false}};
})();