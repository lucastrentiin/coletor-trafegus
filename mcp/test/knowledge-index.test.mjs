import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { createKnowledgeIndex } from '../lib/knowledge-index.mjs';

function fixture() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'knowledge-index-'));
  const document = ['# Eventos', '', '## Evento de Violação de Velocidade Máxima (art. 522263) — PGR 7 / Sistema 32', 'Texto obrigatório.', '1. Deve possuir PGR.', '', '## Evento de Violação de Velocidade Máxima por Região (art. 535655) — PGR 422 / Sistema 422', 'Regra regional.', '', '## Evento Alternativo (art. 900001) — PGR 32 / Sistema 700', 'Outra regra.', '', '## Evento de Saída de Origem (art. 526100) — PGR 329 / Sistema 329', 'Regra de saída.'].join('\n');
  fs.writeFileSync(path.join(rootDir, 'eventos.md'), document, 'utf8');
  return { rootDir, indexPath: path.join(rootDir, '.index.json'), document };
}

test('indexes event sections with identifiers, lines and exact hash', () => {
  const f = fixture();
  const index = createKnowledgeIndex(f);
  const result = index.locate({ artigo: '522263' });
  assert.equal(result.ambiguous, false);
  assert.equal(result.matches[0].codigo_pgr, '7');
  assert.equal(result.matches[0].codigo_sistema, '32');
  assert.equal(result.matches[0].linha_inicio, 3);
  assert.equal(result.matches[0].linha_fim, 6);
  const read = index.read(result.matches[0].regra_id);
  assert.equal(read.conteudo, f.document.split('\n').slice(2, 6).join('\n') + '\n');
  assert.equal(read.sha256, crypto.createHash('sha256').update(read.conteudo).digest('hex'));
});

test('ranks exact typed codes and supports accent-insensitive title lookup', () => {
  const index = createKnowledgeIndex(fixture());
  assert.match(index.locate({ codigo_sistema: '32' }).matches[0].titulo, /Velocidade Máxima/);
  const byTitle = index.locate({ termo: 'evento de violacao de velocidade maxima' });
  assert.equal(byTitle.ambiguous, false);
  assert.equal(byTitle.matches[0].titulo, 'Evento de Violação de Velocidade Máxima (art. 522263) — PGR 7 / Sistema 32');
});

test('does not guess when an untyped numeric term matches different code fields', () => {
  const index = createKnowledgeIndex(fixture());
  const result = index.locate({ termo: '32' });
  assert.equal(result.ambiguous, true);
  assert.equal(result.matches.length, 2);
});

test('refreshes after a document changes and preserves stable article id', () => {
  const f = fixture();
  const index = createKnowledgeIndex(f);
  const before = index.locate({ artigo: '522263' }).matches[0];
  fs.writeFileSync(path.join(f.rootDir, 'eventos.md'), `linha nova\n${f.document}`, 'utf8');
  const after = index.locate({ artigo: '522263' }).matches[0];
  assert.equal(after.regra_id, before.regra_id);
  assert.equal(after.linha_inicio, before.linha_inicio + 1);
});

test('rejects unknown ids and never indexes its own cache', () => {
  const f = fixture();
  const index = createKnowledgeIndex(f);
  index.locate({ termo: 'evento' });
  assert.throws(() => index.read('../eventos.md'), /Regra inexistente/);
  assert.equal(index.stats().documentos, 1);
});
