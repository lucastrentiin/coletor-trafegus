import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const aliases=s=>s.replace(/excesso de velocidade/g,'violacao de velocidade').replace(/porta aberta/g,'violacao de porta');
const tokens=s=>aliases(norm(s)).split(' ').filter(t=>t&&!['de','da','do','das','dos','o','a','e','evento'].includes(t));
const isHub=t=>{if(!t.startsWith('---'))return false;const end=t.indexOf('\n---',3);return end>0&&/^tipo:\s*["']?hub["']?\s*$/m.test(t.slice(3,end));};
function files(root,dir=root){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(root,path.join(dir,e.name)):e.isFile()&&e.name.endsWith('.md')?[path.relative(root,path.join(dir,e.name))]:[]).sort();}
function parse(documento,text){
 const rows=text.match(/[^\n]*\n|[^\n]+$/g)||[];let pos=0,fence=null;const headings=[];
 rows.forEach((row,i)=>{const f=row.match(/^\s{0,3}(`{3,}|~{3,})/);if(f){if(!fence)fence=f[1];else if(f[1][0]===fence[0]&&f[1].length>=fence.length)fence=null;}else if(!fence){const h=row.match(/^(#{1,6})\s+(.+?)\s*\r?\n?$/);if(h)headings.push({level:h[1].length,titulo:h[2],line:i+1,pos});}pos+=row.length;});
 return headings.filter(h=>h.level===2).flatMap(h=>{
  const end=headings.find(n=>n.pos>h.pos&&n.level<=h.level);const content=text.slice(h.pos,end?.pos??text.length);
  if(!/evento/i.test(h.titulo)&&!/c[oó]digo do evento no pgr/i.test(content))return [];
  const artigo=h.titulo.match(/art\.\s*(\d+)/i)?.[1]||null;
  const pgr=h.titulo.match(/PGR\s*(\d+)/i)?.[1]||null, sistema=h.titulo.match(/Sistema\s*(\d+)/i)?.[1]||null;
  const title=h.titulo.replace(/\s*\(art\..*$/i,'').replace(/\s+[—-]\s+PGR.*$/i,'');
  return [{regra_id:artigo?`REGRA-ART-${artigo}`:`REGRA-SEC-${hash(documento+'\n'+norm(h.titulo)).slice(0,16)}`,documento,titulo:h.titulo,artigo,codigo_pgr:pgr,codigo_sistema:sistema,tipo:'evento',linha_inicio:h.line,linha_fim:end?end.line-1:rows.length,sha256:hash(content),caracteres:content.length,_content:content,_title:norm(title),_tokens:tokens(title)}];
 });
}
const publicEntry=e=>Object.fromEntries(Object.entries(e).filter(([k])=>!k.startsWith('_')));
export function createKnowledgeIndex({rootDir,indexPath=path.join(rootDir,'.knowledge-index.json')}){
 let cache=null;
 function refresh(){
  const docs=files(rootDir).map(n=>({name:n.replace(/\\/g,'/'),text:fs.readFileSync(path.join(rootDir,n),'utf8')})).filter(d=>!isHub(d.text));
  const fingerprint=hash(docs.map(d=>d.name+':'+hash(d.text)).join('\n'));
  if(cache?.source_fingerprint===fingerprint)return cache;
  const entries=docs.flatMap(d=>parse(d.name,d.text));
  const next={version:2,documentos:docs.length,regras:entries.length,source_fingerprint:fingerprint,generated_at:new Date().toISOString(),entries};
  fs.mkdirSync(path.dirname(indexPath),{recursive:true});
  const tmp=indexPath+'.'+process.pid+'.tmp';
  fs.writeFileSync(tmp,JSON.stringify({...next,entries:entries.map(publicEntry)}));fs.renameSync(tmp,indexPath);cache=next;return cache;
 }
 function locate(q={}){
  const data=refresh();const typed=['artigo','codigo_pgr','codigo_sistema'].filter(k=>q[k]!=null);const term=norm(q.termo);const tt=tokens(term);
  let candidates=data.entries.filter(e=>!q.documento||e.documento===q.documento).flatMap(e=>{
   let score=0,criterio='';
   if(typed.length){if(typed.every(k=>e[k]===String(q[k]))) {score=100;criterio=typed.join('+');}}
   else if(/^\d+$/.test(term)){if(['artigo','codigo_pgr','codigo_sistema'].some(k=>e[k]===term)){score=90;criterio='codigo_sem_tipo';}}
   else if(term&&e._title===term){score=80;criterio='titulo_exato';}
   else if(tt.length&&tt.every(t=>e._tokens.includes(t))){score=50;criterio='nome_ou_alias';}
   return score?[{...publicEntry(e),criterio,score}]:[];
  }).sort((a,b)=>b.score-a.score||a.titulo.localeCompare(b.titulo)||a.documento.localeCompare(b.documento));
  const limit=Number.isInteger(q.limite)?Math.max(1,Math.min(5,q.limite)):3;
  return {encontrado:!!candidates.length,ambiguous:candidates.length>1&&candidates[0].score===candidates[1].score,total:candidates.length,matches:candidates.slice(0,limit)};
 }
 function read(id,{documento,offset=0,max_caracteres=8000,sha256_esperado}={}){
  const matches=refresh().entries.filter(e=>e.regra_id===id&&(!documento||e.documento===documento));
  if(!matches.length)throw Error('Regra inexistente. Use localizar_regra.');
  if(matches.length>1)throw Error('Regra ambigua. Informe documento; duplicatas no mesmo documento exigem revisao.');
  const e=matches[0];if(sha256_esperado&&sha256_esperado!==e.sha256)throw Error('Fonte alterada. Reinicie leitura pela nova versao.');
  if(!Number.isInteger(offset)||offset<0||offset>e._content.length)throw Error('Offset invalido.');
  if(offset>0&&!sha256_esperado)throw Error('Continuacao exige sha256_esperado.');
  if(!Number.isInteger(max_caracteres)||max_caracteres<1||max_caracteres>8000)throw Error('Limite invalido (1-8000).');
  let end=Math.min(offset+max_caracteres,e._content.length);
  if(end<e._content.length&&/[\uD800-\uDBFF]/.test(e._content[end-1]))end--;
  if(end===offset&&end<e._content.length)throw Error('Limite insuficiente para caractere Unicode.');
  const alerts=['Texto literal da base armazenada; completude em relacao ao artigo original nao certificada.'];
  if(/resum|2\s*-\s*Regras:\s*1\./i.test(e._content))alerts.push('Possivel fonte resumida: confirmar original antes de conclusao normativa.');
  const referencias=[...new Set(e._content.match(/https?:\/\/[^\s<>]+/g)||[])].slice(0,12);
  const related=[];for(const [re,label] of [[/inibi[çc][aã]o|inibe/i,'inibicao'],[/macro/i,'macro'],[/artigos relacionados|consulte/i,'artigos relacionados']])if(re.test(e._content))related.push(label);
  return {...publicEntry(e),offset,conteudo:e._content.slice(offset,end),proximo_offset:end<e._content.length?end:null,completo:offset===0&&end===e._content.length,fonte_integral_confirmada:false,alertas:alerts,referencias,dependencias_a_verificar:related};
 }
 return {locate,read,stats:()=>{const {entries,...stats}=refresh();return stats;}};
}
