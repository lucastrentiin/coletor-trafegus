import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createKnowledgeIndex } from '../lib/knowledge-index.mjs';
function setup(texts){ const rootDir=fs.mkdtempSync(path.join(os.tmpdir(),'kb-v2-')); for(const [n,t] of Object.entries(texts))fs.writeFileSync(path.join(rootDir,n),t);return {rootDir,k:createKnowledgeIndex({rootDir})}; }
test('duplicate article ids refuse silent selection',()=>{const {k}=setup({'a.md':'## Evento (art. 10) — PGR 7 / Sistema 32\nA','b.md':'## Evento (art. 10) — PGR 7 / Sistema 32\nB'});assert.throws(()=>k.read('REGRA-ART-10'),/amb/);});
test('literal line endings, pagination, version pinning and completeness',()=>{const {k,rootDir}=setup({'a.md':'## Evento (art. 10) — PGR 7 / Sistema 32\r\n'+('x'.repeat(200)+'\r\n').repeat(80)});let p=k.read('REGRA-ART-10');assert.equal(p.completo,false);assert.ok(p.conteudo.length<=8000);let all=p.conteudo;while(p.proximo_offset!==null){p=k.read('REGRA-ART-10',{offset:p.proximo_offset,sha256_esperado:p.sha256});all+=p.conteudo;}assert.equal(all,fs.readFileSync(path.join(rootDir,'a.md'),'utf8'));fs.appendFileSync(path.join(rootDir,'a.md'),'changed');assert.throws(()=>k.read('REGRA-ART-10',{sha256_esperado:p.sha256}),/alterada/);});
test('aliases return candidates and preserve sem viagem qualifier',()=>{const {k}=setup({'a.md':'## Evento de Violação de Velocidade Máxima (art. 10) — PGR 7 / Sistema 32\nA\n## Evento de Violação de Velocidade Máxima Sem Viagem (art. 11) — PGR 8 / Sistema 33\nB'});assert.equal(k.locate({termo:'excesso de velocidade'}).total,2);assert.equal(k.locate({termo:'velocidade maxima sem viagem'}).total,1);});
test('headings inside code fences are not rules',()=>{const {k}=setup({'a.md':'## Evento (art. 10)\n```md\n## Evento falso (art. 99)\n```\nFim'});assert.equal(k.locate({artigo:'99'}).total,0);assert.ok(k.read('REGRA-ART-10').conteudo.endsWith('Fim'));});
test('source literalness is not original-rule completeness',()=>{const {k}=setup({'a.md':'## Evento (art. 10)\nResumo das regras. Consulte inibição por local.'});const p=k.read('REGRA-ART-10');assert.equal(p.fonte_integral_confirmada,false);assert.ok(p.alertas.length);});
