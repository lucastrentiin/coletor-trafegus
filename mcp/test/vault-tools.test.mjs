import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createVault } from '../lib/vault.mjs';

// vault-tools.mjs depende de zod (instalado na imagem do MCP). Fora do container, sem zod, o teste e pulado.
let modulo = null;
try { modulo = await import('../lib/vault-tools.mjs'); } catch (e) { if (e.code !== 'ERR_MODULE_NOT_FOUND') throw e; }

test('registra as 6 tools do vault e elas funcionam pelo handler', { skip: modulo ? false : 'zod indisponivel fora do container' }, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vault-tools-'));
  fs.mkdirSync(path.join(root, 'inbox'));
  const tools = new Map();
  const server = { tool: (nome, descricao, schema, handler) => tools.set(nome, { descricao, schema, handler }) };
  modulo.registrarToolsVault(server, () => createVault({ rootDir: root }));
  assert.deepEqual([...tools.keys()].sort(), [...modulo.NOMES_TOOLS_VAULT].sort());
  await tools.get('vault_escrever').handler({ caminho: 'inbox/a.md', conteudo: 'ola mundo', modo: 'criar' });
  const lido = await tools.get('vault_ler').handler({ caminho: 'inbox/a.md' });
  assert.match(lido.content[0].text, /ola mundo/);
  const indice = await tools.get('vault_indice').handler({});
  assert.match(indice.content[0].text, /Indice do cerebro/);
  await assert.rejects(() => tools.get('vault_escrever').handler({ caminho: 'inbox/s.md', conteudo: ['sen', 'ha=abc12345'].join(''), modo: 'criar' }), /Segredos/);
});

test('registra o uso de cada chamada sem o conteudo e identifica a IA pelo user-agent', { skip: modulo ? false : 'zod indisponivel fora do container' }, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vault-tools-uso-'));
  fs.mkdirSync(path.join(root, 'projetos'));
  const usoLog = path.join(root, 'uso.jsonl');
  const tools = new Map();
  modulo.registrarToolsVault({ tool: (nome, d, s, handler) => tools.set(nome, handler) }, () => createVault({ rootDir: root }), { usoLog, mcp: 'cerebro' });
  const extra = { requestInfo: { headers: { 'user-agent': 'openai-mcp/1.0 (ChatGPT)' } } };
  await tools.get('vault_escrever')({ caminho: 'projetos/a.md', conteudo: 'texto secreto do usuario', modo: 'criar' }, extra);
  await tools.get('vault_buscar')({ termo: 'texto', pasta: 'projetos' }, {});
  await assert.rejects(() => tools.get('vault_ler')({ caminho: '../fora.md' }, extra));
  const linhas = fs.readFileSync(usoLog, 'utf8').trim().split('\n').map(l => JSON.parse(l));
  assert.deepEqual(linhas.map(l => [l.tool, l.ia, l.mcp, l.caminho, l.ok]), [
    ['vault_escrever', 'ChatGPT', 'cerebro', 'projetos/a.md', true],
    ['vault_buscar', 'desconhecida', 'cerebro', 'projetos', true],
    ['vault_ler', 'ChatGPT', 'cerebro', '../fora.md', false],
  ]);
  assert.ok(!fs.readFileSync(usoLog, 'utf8').includes('secreto'));
  assert.equal(modulo.nomeDaIA('codex_cli_rs/0.40'), 'Codex');
  assert.equal(modulo.nomeDaIA('Claude-User'), 'Claude');
});

test('uso nao quebra a tool quando o log nao pode ser gravado', { skip: modulo ? false : 'zod indisponivel fora do container' }, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vault-tools-uso2-'));
  fs.mkdirSync(path.join(root, 'projetos'));
  const tools = new Map();
  modulo.registrarToolsVault({ tool: (nome, d, s, handler) => tools.set(nome, handler) }, () => createVault({ rootDir: root }), { usoLog: path.join(root, 'nao/existe/uso.jsonl') });
  const r = await tools.get('vault_indice')({}, undefined);
  assert.match(r.content[0].text, /Indice do cerebro/);
});
