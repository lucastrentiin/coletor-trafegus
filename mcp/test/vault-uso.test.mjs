import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gerarRelatorioUso, lerRegistros, resumoDosCasos, NOTA_USO } from '../lib/vault-uso.mjs';

function montar() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vault-uso-'));
  const w = (rel, t) => { fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true }); fs.writeFileSync(path.join(root, rel), t); };
  w('trafegus/casos/A-20260930/entrada.json', JSON.stringify({ criado_em: '2026-09-30T12:00:00Z' }));
  w('trafegus/casos/A-20260930/log.jsonl', JSON.stringify({ autor: 'Codex' }) + '\n');
  w('trafegus/casos/A-20260930/consulta-01.sql', 'SELECT column_name FROM information_schema.columns WHERE table_name = \'x\'');
  w('trafegus/casos/A-20260930/consulta-02.sql', 'SELECT 1 FROM veic_veiculo');
  w('trafegus/casos/A-20260930/veredito.md', 'Resumo: ok\nCérebro: notas lidas mapa-schema; consultas de schema 1; reaproveitou caso anterior não\n');
  w('trafegus/casos/B-20260901/entrada.json', JSON.stringify({ criado_em: '2026-09-01T12:00:00Z' }));
  w('trafegus/casos/B-20260901/consulta-01.sql', 'SELECT tablename FROM pg_catalog.pg_tables');
  const log = path.join(root, 'uso.jsonl');
  fs.writeFileSync(log, [
    { ts: '2026-09-30T12:00:00Z', mcp: 'mcp', ia: 'Codex', tool: 'vault_indice', caminho: '', ok: true },
    { ts: '2026-09-30T12:01:00Z', mcp: 'mcp', ia: 'Codex', tool: 'vault_ler', caminho: 'trafegus/sistema/mapa-schema.md', ok: true },
    { ts: '2026-09-30T12:02:00Z', mcp: 'cerebro', ia: 'ChatGPT', tool: 'vault_buscar', caminho: 'trafegus/casos', termo: 'NNT1872', ok: true },
  ].map(x => JSON.stringify(x)).join('\n') + '\n{cortada');
  return { root, log };
}

test('le registros ignorando linha cortada e arquivo inexistente', () => {
  const { log } = montar();
  assert.equal(lerRegistros([log, '/nao/existe.jsonl']).length, 3);
});

test('resume casos: consultas, schema, autor e linha Cerebro', () => {
  const { root } = montar();
  const [a, b] = resumoDosCasos(root);
  assert.deepEqual(a, { id: 'A-20260930', data: '2026-09-30', autor: 'Codex', consultas: 2, schema: 1, cerebro: 'notas lidas mapa-schema; consultas de schema 1; reaproveitou caso anterior não' });
  assert.equal(b.schema, 1);
  assert.equal(b.cerebro, 'sem veredito');
});

test('gera a nota com IA, notas lidas e antes/depois, e so regrava quando muda', () => {
  const { root, log } = montar();
  assert.equal(gerarRelatorioUso({ rootDir: root, arquivosLog: [log], hoje: '2026-09-30' }), true);
  const nota = fs.readFileSync(path.join(root, NOTA_USO), 'utf8');
  assert.match(nota, /\| Codex \| 2 \|/);
  assert.match(nota, /\| ChatGPT \| 1 \|/);
  assert.match(nota, /trafegus\/sistema\/mapa-schema\.md \| 1/);
  assert.match(nota, /NNT1872 \| trafegus\/casos \| 1/);
  assert.match(nota, /Antes do registro de uso: 1 casos/);
  assert.match(nota, /Depois: 1 casos/);
  assert.equal(gerarRelatorioUso({ rootDir: root, arquivosLog: [log], hoje: '2026-09-30' }), false);
});

test('data vem do nome do caso e e-mail de autor nao aparece', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vault-uso2-'));
  fs.mkdirSync(path.join(root, 'trafegus/casos/X-PLACA-20260910'), { recursive: true });
  fs.writeFileSync(path.join(root, 'trafegus/casos/X-PLACA-20260910/log.jsonl'), JSON.stringify({ autor: 'alguem@exemplo.com' }) + '\n');
  const [c] = resumoDosCasos(root);
  assert.equal(c.data, '2026-09-10');
  assert.equal(c.autor, 'pessoa');
});
