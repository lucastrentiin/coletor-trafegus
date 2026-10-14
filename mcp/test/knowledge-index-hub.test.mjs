import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createKnowledgeIndex } from '../lib/knowledge-index.mjs';

test('indice de regras ignora notas-hub (tipo: hub) e le notas de evento com frontmatter', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ki-hub-'));
  const dir = path.join(root, 'eventos', 'Controle da Viagem');
  fs.mkdirSync(dir, { recursive: true });
  const secao = '## Evento de Fim de Viagem (art. 523363) — PGR 41 / Sistema 11\n\nCódigo do evento no PGR: 41\n';
  fs.writeFileSync(path.join(dir, 'Fim de Viagem.md'), '---\ntipo: evento\nartigo: "523363"\n---\nTipo: [[x|Controle da Viagem]]\n\n' + secao);
  fs.writeFileSync(path.join(dir, 'Controle da Viagem.md'), '---\ntipo: hub\n---\n# Controle da Viagem\n\n## Eventos mais comuns\nCódigo do evento no PGR: 99\n');
  const ki = createKnowledgeIndex({ rootDir: root, indexPath: path.join(root, '.idx.json') });
  assert.equal(ki.stats().regras, 1);
  const r = ki.read('REGRA-ART-523363');
  assert.equal(r.documento, 'eventos/Controle da Viagem/Fim de Viagem.md');
  assert.equal(r.conteudo, secao);
  assert.equal(r.codigo_pgr, '41');
});
