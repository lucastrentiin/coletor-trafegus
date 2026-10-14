// MCP do cerebro (vault Obsidian) para qualquer IA: claude.ai, Claude Code, ChatGPT, Codex, Gemini.
// Expoe so as tools vault_*: nao acessa o Trafegus, o docker nem os segredos do coletor.
import http from 'node:http';
import crypto from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createVault } from './mcp/lib/vault.mjs';
import { registrarToolsVault } from './mcp/lib/vault-tools.mjs';

const TOKEN = process.env.CEREBRO_API_TOKEN || '';
const VAULT_DIR = process.env.VAULT_DIR || '/vault';
const VAULT_LOG = process.env.VAULT_LOG || '/state/vault-escritas.jsonl';
const PORT = Number(process.env.MCP_PORT || 8000);
const INSTRUCOES = 'Cerebro do Lucas (vault Obsidian compartilhado entre as IAs). Comece por vault_indice e siga COMO-USAR.md. ' +
  'Salve progresso em <galho>/tarefas/<slug>.md (ex: projetos/<projeto>/tarefas/). Nunca grave senhas, tokens ou dados pessoais.';

if (TOKEN.length < 32) {
  console.error('CEREBRO_API_TOKEN ausente ou curto (minimo 32 caracteres).');
  process.exit(1);
}

let vault = null;
function obterVault() {
  if (!vault) vault = createVault({ rootDir: VAULT_DIR, logPath: VAULT_LOG });
  return vault;
}

function iguais(a, b) {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function autorizado(req, url) {
  return iguais(req.headers.authorization, 'Bearer ' + TOKEN) || iguais(url.searchParams.get('token'), TOKEN);
}

const httpServer = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/health') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end('{"ok":true}'); }
  if (url.pathname !== '/mcp') { res.writeHead(404); return res.end(); }
  if (!autorizado(req, url)) {
    res.writeHead(401, { 'Content-Type': 'application/json', 'WWW-Authenticate': 'Bearer' });
    return res.end('{"error":"unauthorized"}');
  }
  const server = new McpServer({ name: 'cerebro', version: '1.0.0' }, { instructions: INSTRUCOES });
  registrarToolsVault(server, obterVault);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res);
  } catch (error) {
    console.error(error);
    if (!res.headersSent) res.writeHead(500);
    res.end();
  } finally {
    res.on('close', () => { transport.close(); server.close(); });
  }
});

httpServer.listen(PORT, '0.0.0.0', () => console.log('MCP do cerebro ativo na porta ' + PORT));
