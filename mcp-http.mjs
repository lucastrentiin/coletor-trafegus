import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import dotenv from 'dotenv';
import { PROJECT_FILE_ALLOWLIST, readAllowedProjectFile } from './mcp/lib/project-files.mjs';
import { createGeminiAnalyzer } from './mcp/lib/gemini-client.mjs';
import { QuotaGate, shouldUseGemini } from './mcp/lib/gemini-policy.mjs';
import { persistGeminiArtifacts } from './mcp/lib/gemini-artifacts.mjs';
import { createKnowledgeIndex } from './mcp/lib/knowledge-index.mjs';
import { createVault } from './mcp/lib/vault.mjs';
import { registrarToolsVault } from './mcp/lib/vault-tools.mjs';
dotenv.config({ path: '/app/.env' });
const BASE_URL = (process.env.TRAFEGUS_BASE_URL || 'http://coletor-web:3001').replace(/\/+$/, '');
const LOGIN = process.env.TRAFEGUS_LOGIN || '';
const PASSWORD = process.env.TRAFEGUS_PASSWORD || '';
const API_TOKEN = process.env.MCP_API_TOKEN || '';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';
const KNOWLEDGE_DIR = process.env.KNOWLEDGE_DIR || '/knowledge';
const LOG_DIR = process.env.LOG_DIR || '/logs';
const PORT = Number(process.env.MCP_PORT || 8000);
const execFileAsync = promisify(execFile);
const COMPOSE_DIR = process.env.COMPOSE_PROJECT_DIR || '/workspace';
const ACTIVITY_FILE = process.env.ACTIVITY_FILE || '/state/last-activity';
const CASOS_DIR = process.env.CASOS_DIR || '/casos';
const COORD_DIR = process.env.COORD_DIR || '/coordenacao';
const PROJECT_ROOT = process.env.PROJECT_ROOT || '/workspace';
const KNOWLEDGE_INDEX_PATH = process.env.KNOWLEDGE_INDEX_PATH || '/state/knowledge-index.json';
const VAULT_DIR = process.env.VAULT_DIR || '/vault';
const VAULT_LOG = process.env.VAULT_LOG || '/state/vault-escritas.jsonl';
const SERVICOS_PERMITIDOS = ['coletor-mcp', 'coletor-web', 'gateway'];
const geminiQuota = new QuotaGate({
  rpm: Number(process.env.GEMINI_RPM || 15),
  tpm: Number(process.env.GEMINI_TPM || 250000),
  rpd: Number(process.env.GEMINI_RPD || 500)
});
const geminiAnalyzer = createGeminiAnalyzer({ fetchImpl: fetch, apiKey: GEMINI_API_KEY, model: GEMINI_MODEL, quotaGate: geminiQuota });
const knowledgeIndex = createKnowledgeIndex({ rootDir: KNOWLEDGE_DIR, indexPath: KNOWLEDGE_INDEX_PATH });

let vaultInstancia = null;
function obterVault() {
  if (!vaultInstancia) vaultInstancia = createVault({ rootDir: VAULT_DIR, logPath: VAULT_LOG });
  return vaultInstancia;
}

function tocarAtividade() {
  try { fs.writeFileSync(ACTIVITY_FILE, String(Math.floor(Date.now() / 1000))); } catch (e) { console.error('Falha ao gravar atividade:', e.message); }
}

if (!LOGIN || !PASSWORD || !API_TOKEN) {
  console.error('TRAFEGUS_LOGIN, TRAFEGUS_PASSWORD e MCP_API_TOKEN são obrigatórios.');
  process.exit(1);
}
tocarAtividade();
let sessionCookie = null;
let sessionExpiresAt = 0;
function cookieFromSetCookie(res) {
  const raw = res.headers.get('set-cookie') || '';
  const match = raw.match(/(?:^|,\s*)(trafegus_session=[^;]+)/);
  return match?.[1] || null;
}
async function login() {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login: LOGIN, password: PASSWORD })
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.ok) throw new Error(`Login no coletor falhou: ${body.error || res.status}`);
  sessionCookie = cookieFromSetCookie(res);
  if (!sessionCookie) throw new Error('Login OK, mas sem cookie de sessão.');
  sessionExpiresAt = Date.now() + 11 * 3600 * 1000;
}
async function apiFetch(apiPath, opts = {}) {
  if (!sessionCookie || Date.now() >= sessionExpiresAt) await login();
  const run = () => fetch(`${BASE_URL}${apiPath}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Cookie: sessionCookie, ...(opts.headers || {}) }
  });
  let res = await run();
  if (res.status === 401) { await login(); res = await run(); }
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.ok === false) throw new Error(body.error || `Erro HTTP ${res.status}`);
  return body;
}
function knowledgeFiles(dir = KNOWLEDGE_DIR, prefixo = '') {
  if (!fs.existsSync(dir)) return [];
  let arquivos = [];
  for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
    const relativo = prefixo ? `${prefixo}/${entrada.name}` : entrada.name;
    if (entrada.isDirectory()) {
      arquivos = arquivos.concat(knowledgeFiles(path.join(dir, entrada.name), relativo));
    } else if (entrada.name.endsWith('.md')) {
      arquivos.push(relativo);
    }
  }
  return arquivos.sort();
}
async function analisarComPolitica(question, source) {
  const routing = shouldUseGemini(source);
  if (!routing.use) {
    return { status: 'dispensado', evidence: null, validation: { ok: true, errors: [] }, usage: { calls: 0 }, rawAttempts: [], routing };
  }
  return geminiAnalyzer.analyze({ question, source });
}

function proximoIndice(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const contadorPath = path.join(dir, '.contador');
  let atual = 0;
  if (fs.existsSync(contadorPath)) atual = parseInt(fs.readFileSync(contadorPath, 'utf8'), 10) || 0;
  const proximo = atual + 1;
  fs.writeFileSync(contadorPath, String(proximo), 'utf8');
  return proximo;
}

function salvarResultado(casoId, sql, resultado) {
  const dir = path.join(CASOS_DIR, casoId);
  const idx = proximoIndice(dir);
  const idxStr = String(idx).padStart(2, '0');
  fs.writeFileSync(path.join(dir, `consulta-${idxStr}.sql`), sql, 'utf8');
  const json = JSON.stringify(resultado, null, 2);
  const gz = zlib.gzipSync(Buffer.from(json, 'utf8'));
  fs.writeFileSync(path.join(dir, `resultado-${idxStr}.json.gz`), gz);
  return { indice: idx, indiceStr: idxStr, resultadoId: `RES-${casoId}-${idxStr}` };
}

function salvarArtefatosGemini(casoId, indiceStr, source, analysis) {
  return persistGeminiArtifacts({ dir: path.join(CASOS_DIR, casoId), index: indiceStr, source, analysis });
}

function registrarLogCaso(casoId, entrada) {
  try {
    const dir = path.join(CASOS_DIR, casoId);
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(dir, 'log.jsonl'), JSON.stringify({ timestamp: new Date().toISOString(), ...entrada }) + '\n', 'utf8');
  } catch (e) { console.error('Falha ao registrar log do caso:', e.message); }
}

function sqlHash(sql) {
  return crypto.createHash('sha256').update(sql).digest('hex').slice(0, 8);
}

function createServer() {
  const server = new McpServer({ name: 'coletor-trafegus', version: '3.0.0' });

  server.tool('listar_clientes', 'Lista os clientes habilitados e seus identificadores.', {}, async () => {
    const data = await apiFetch('/api/clients', { method: 'GET' });
    return { content: [{ type: 'text', text: JSON.stringify(data.clients, null, 2) }] };
  });

  server.tool('consulta_personalizada', 'Executa um único SELECT somente leitura em clientes escolhidos. Se caso_id for informado, a consulta e o resultado ficam salvos na pasta do caso e disponiveis via obter_resultado/obter_logs_mcp.', {
    sql: z.string().describe('SELECT único, sem ponto e vírgula.'),
    clientIds: z.array(z.string()).min(1),
    nome: z.string().optional(),
    motivo: z.string().optional(),
    caso_id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/).optional(),
    limite: z.number().int().min(1).max(2000).optional(),
    autor: z.string().optional()
  }, async ({ sql, clientIds, nome, motivo, caso_id, limite = 500, autor }) => {
    const inicio = Date.now();
    const data = await apiFetch('/api/custom-query', {
      method: 'POST',
      body: JSON.stringify({ source: 'CLIENTES', sql, clientIds, name: nome || motivo || 'Consulta via MCP', category: 'MCP' })
    });
    const results = (data.results || []).map(r => Array.isArray(r.rows) && r.rows.length > limite
      ? { ...r, rows: r.rows.slice(0, limite), truncated: true, totalRows: r.rows.length }
      : r);
    const payload = { failed: data.failed, errors: data.errors, results };
    let resultadoId = null;
    if (caso_id) {
      const salvo = salvarResultado(caso_id, sql, payload);
      resultadoId = salvo.resultadoId;
      registrarLogCaso(caso_id, {
        ferramenta: 'consulta_personalizada', autor: autor || 'desconhecido', motivo: motivo || nome || '',
        clientIds, sql_hash: sqlHash(sql),
        linhas: results.reduce((acc, r) => acc + (r.rows?.length || 0), 0),
        duracao_ms: Date.now() - inicio, status: data.failed ? 'parcial' : 'sucesso', resultado_id: resultadoId
      });
    }
    return { content: [{ type: 'text', text: JSON.stringify({ ...payload, resultado_id: resultadoId }, null, 2) }] };
  });

  server.tool('consulta_analisada', 'Executa um SELECT somente leitura e faz o Gemini ler todo o resultado antes de devolver um pacote estruturado de evidências (resumo, marcos, anomalias, incertezas). Se caso_id for informado, tudo fica salvo na pasta do caso.', {
    pergunta: z.string().min(5),
    sql: z.string().describe('SELECT único, sem ponto e vírgula.'),
    clientIds: z.array(z.string()).min(1),
    nome: z.string().optional(),
    motivo: z.string().optional(),
    caso_id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/).optional(),
    limite: z.number().int().min(1).max(2000).optional(),
    autor: z.string().optional()
  }, async ({ pergunta, sql, clientIds, nome, motivo, caso_id, limite = 500, autor }) => {
    const inicio = Date.now();
    const data = await apiFetch('/api/custom-query', {
      method: 'POST',
      body: JSON.stringify({ source: 'CLIENTES', sql, clientIds, name: nome || motivo || 'Consulta analisada via MCP', category: 'MCP_GEMINI' })
    });
    const analysis = await analisarComPolitica(pergunta, data);
    let resultadoId = null;
    if (caso_id) {
      const salvo = salvarResultado(caso_id, sql, data);
      resultadoId = salvo.resultadoId;
      salvarArtefatosGemini(caso_id, salvo.indiceStr, data, analysis);
      registrarLogCaso(caso_id, {
        ferramenta: 'consulta_analisada', autor: autor || 'desconhecido', motivo: motivo || nome || pergunta,
        clientIds, sql_hash: sqlHash(sql), duracao_ms: Date.now() - inicio,
        status: analysis.status === 'ok' || analysis.status === 'dispensado' ? 'sucesso' : analysis.status,
        gemini: analysis.usage?.calls > 0, gemini_status: analysis.status, resultado_id: resultadoId
      });
    }
    return { content: [{ type: 'text', text: JSON.stringify({ ...analysis, resultado_id: resultadoId }, null, 2) }] };
  });

  server.tool('analisar_logs', 'Faz o Gemini ler integralmente os logs recentes do coletor e devolve um pacote estruturado de evidências.', {
    pergunta: z.string().min(5),
    arquivos: z.number().int().min(1).max(30).optional(),
    caso_id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/).optional(),
    autor: z.string().optional()
  }, async ({ pergunta, arquivos = 10, caso_id, autor }) => {
    const inicio = Date.now();
    const names = fs.existsSync(LOG_DIR) ? fs.readdirSync(LOG_DIR).filter(n => n.endsWith('.log')).sort().slice(-arquivos) : [];
    const rows = names.flatMap(name => fs.readFileSync(path.join(LOG_DIR, name), 'utf8').split(/\r?\n/)
      .map((conteudo, index) => ({ arquivo: name, linha_arquivo: index + 1, conteudo })));
    if (!rows.length) throw new Error('Nenhum log disponível.');
    const source = { failed: false, errors: [], results: [{ ok: true, clientId: 'LOGS', clientName: 'Logs do coletor', rows }] };
    const analysis = await analisarComPolitica(pergunta, source);
    let resultadoId = null;
    if (caso_id) {
      const salvo = salvarResultado(caso_id, `-- logs: ${names.join(', ')}`, source);
      resultadoId = salvo.resultadoId;
      salvarArtefatosGemini(caso_id, salvo.indiceStr, source, analysis);
      registrarLogCaso(caso_id, {
        ferramenta: 'analisar_logs', autor: autor || 'desconhecido', motivo: pergunta, arquivos: names,
        linhas: rows.length, duracao_ms: Date.now() - inicio,
        status: analysis.status === 'ok' || analysis.status === 'dispensado' ? 'sucesso' : analysis.status,
        gemini: analysis.usage?.calls > 0, gemini_status: analysis.status, resultado_id: resultadoId
      });
    }
    return { content: [{ type: 'text', text: JSON.stringify({ ...analysis, resultado_id: resultadoId }, null, 2) }] };
  });

  server.tool('localizar_regra', 'Localiza regras de evento por indice deterministico local e retorna apenas metadados compactos. Nao usa Gemini nem banco. Para evitar ambiguidade, prefira codigo_pgr, codigo_sistema ou artigo quando conhecidos.', {
    termo: z.string().min(1).optional(),
    artigo: z.string().regex(/^\d+$/).optional(),
    codigo_pgr: z.string().regex(/^\d+$/).optional(),
    codigo_sistema: z.string().regex(/^\d+$/).optional(),
    limite: z.number().int().min(1).max(20).optional()
  }, async (query) => {
    if (!query.termo && !query.artigo && !query.codigo_pgr && !query.codigo_sistema) throw new Error('Informe termo, artigo, codigo_pgr ou codigo_sistema.');
    return { content: [{ type: 'text', text: JSON.stringify(knowledgeIndex.locate(query), null, 2) }] };
  });

  server.tool('ler_trecho_regra', 'Le texto literal de uma secao em paginas de ate 8000 caracteres. Continue por proximo_offset e sha256_esperado ate null. Fonte pode ser resumo: ver alertas e dependencias_a_verificar.', {
    regra_id: z.string().regex(/^REGRA-(ART-\d+|SEC-[a-f0-9]{16})$/),
    documento: z.string().optional(),
    offset: z.number().int().min(0).optional(),
    max_caracteres: z.number().int().min(1).max(8000).optional(),
    sha256_esperado: z.string().regex(/^[a-f0-9]{64}$/).optional()
  }, async ({ regra_id, ...options }) => {
    return { content: [{ type: 'text', text: JSON.stringify(knowledgeIndex.read(regra_id, options), null, 2) }] };
  });

  server.tool('ler_regra_original', 'Le o conteudo integral e original de uma regra de negocio da base de conhecimento (ex: regras/REGRA-0003-x.md), sem resumir. Use antes de concluir uma analise sobre um evento/regra especifica.', {
    documento: z.string().describe('Caminho relativo a trafegus/conhecimento/ do vault, como retornado por localizar_regra (ex: eventos/Controle da Viagem/Fim de Viagem.md).')
  }, async ({ documento }) => {
    if (!knowledgeFiles().includes(documento)) throw new Error('Documento inexistente.');
    const text = fs.readFileSync(path.join(KNOWLEDGE_DIR, documento), 'utf8');
    return { content: [{ type: 'text', text: text.slice(0, 300000) }] };
  });

  server.tool('abrir_caso', 'Cria um novo caso de analise, gravando cliente, placa e descricao inicial do problema.', {
    caso_id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
    cliente: z.string(),
    descricao: z.string(),
    placa: z.string().optional()
  }, async ({ caso_id, cliente, descricao, placa }) => {
    const dir = path.join(CASOS_DIR, caso_id);
    fs.mkdirSync(dir, { recursive: true });
    const entrada = { caso_id, cliente, placa: placa || null, descricao, criado_em: new Date().toISOString() };
    fs.writeFileSync(path.join(dir, 'entrada.json'), JSON.stringify(entrada, null, 2), 'utf8');
    return { content: [{ type: 'text', text: JSON.stringify({ ok: true, caso_id, pasta: dir }, null, 2) }] };
  });

  server.tool('listar_casos', 'Lista os casos de analise existentes.', {}, async () => {
    if (!fs.existsSync(CASOS_DIR)) return { content: [{ type: 'text', text: '[]' }] };
    const casos = fs.readdirSync(CASOS_DIR, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name).sort();
    return { content: [{ type: 'text', text: JSON.stringify(casos, null, 2) }] };
  });

  server.tool('salvar_arquivo_caso', 'Salva um arquivo dentro da pasta de um caso (ex: veredito.md, regras-utilizadas.json). So aceita nomes simples com extensao md/json/txt, sem caminhos.', {
    caso_id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
    nome: z.string().regex(/^[A-Za-z0-9_-]{1,80}\.(md|json|txt)$/),
    conteudo: z.string()
  }, async ({ caso_id, nome, conteudo }) => {
    const dir = path.join(CASOS_DIR, caso_id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, nome), conteudo, 'utf8');
    return { content: [{ type: 'text', text: JSON.stringify({ ok: true, arquivo: path.join(dir, nome) }, null, 2) }] };
  });

  server.tool('ler_arquivo_caso', 'Le um arquivo salvo dentro da pasta de um caso.', {
    caso_id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
    nome: z.string().regex(/^[A-Za-z0-9_-]{1,80}\.(md|json|txt)$/)
  }, async ({ caso_id, nome }) => {
    const filePath = path.join(CASOS_DIR, caso_id, nome);
    if (!fs.existsSync(filePath)) throw new Error('Arquivo nao encontrado.');
    const conteudo = fs.readFileSync(filePath, 'utf8');
    return { content: [{ type: 'text', text: conteudo }] };
  });

  server.tool('obter_resultado', 'Recupera linhas especificas (por indice) de um resultado de consulta salvo anteriormente, identificado por resultado_id, sem precisar rodar a consulta de novo.', {
    resultado_id: z.string().regex(/^RES-[A-Za-z0-9_-]{1,64}-\d{1,6}$/),
    linha_inicio: z.number().int().min(1).optional(),
    linha_fim: z.number().int().min(1).optional()
  }, async ({ resultado_id, linha_inicio = 1, linha_fim = 50 }) => {
    const m = resultado_id.match(/^RES-([A-Za-z0-9_-]{1,64})-(\d{1,6})$/);
    if (!m) throw new Error('resultado_id invalido.');
    const [, casoId, idx] = m;
    const filePath = path.join(CASOS_DIR, casoId, `resultado-${idx}.json.gz`);
    if (!fs.existsSync(filePath)) throw new Error('Resultado nao encontrado.');
    const json = zlib.gunzipSync(fs.readFileSync(filePath)).toString('utf8');
    const dados = JSON.parse(json);
    if (Array.isArray(dados.results)) {
      dados.results = dados.results.map(r => Array.isArray(r.rows)
        ? { ...r, rows: r.rows.slice(linha_inicio - 1, linha_fim), totalLinhasArmazenadas: r.rows.length }
        : r);
    }
    return { content: [{ type: 'text', text: JSON.stringify(dados, null, 2) }] };
  });

  server.tool('obter_logs_mcp', 'Le o log de acoes registradas para um caso especifico (consultas, ferramentas usadas, resultados gerados).', {
    caso_id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
    limite: z.number().int().min(1).max(500).optional()
  }, async ({ caso_id, limite = 50 }) => {
    const logPath = path.join(CASOS_DIR, caso_id, 'log.jsonl');
    if (!fs.existsSync(logPath)) return { content: [{ type: 'text', text: JSON.stringify({ caso_id, entradas: [] }, null, 2) }] };
    const linhas = fs.readFileSync(logPath, 'utf8').split('\n').filter(Boolean);
    const entradas = linhas.slice(-limite).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean).reverse();
    return { content: [{ type: 'text', text: JSON.stringify({ caso_id, entradas }, null, 2) }] };
  });

  server.tool('registrar_mudanca', 'Registra no log compartilhado o que voce (Claude, Codex, ChatGPT etc) alterou ou fez no servidor/codigo, para os outros assistentes ficarem sincronizados. Use sempre que fizer uma mudanca relevante.', {
    autor: z.string().describe('Identifique-se: Claude, Codex, ChatGPT, etc.'),
    resumo: z.string(),
    detalhes: z.string().optional()
  }, async ({ autor, resumo, detalhes }) => {
    const entrada = { timestamp: new Date().toISOString(), autor, resumo, detalhes: detalhes || '' };
    fs.mkdirSync(COORD_DIR, { recursive: true });
    fs.appendFileSync(path.join(COORD_DIR, 'mudancas.jsonl'), JSON.stringify(entrada) + '\n', 'utf8');
    return { content: [{ type: 'text', text: JSON.stringify({ ok: true }, null, 2) }] };
  });

  server.tool('ler_mudancas', 'Le as ultimas mudancas registradas por qualquer assistente (Claude, Codex, etc), para saber o que ja foi feito por outros antes de comecar algo novo.', {
    limite: z.number().int().min(1).max(200).optional()
  }, async ({ limite = 20 }) => {
    const filePath = path.join(COORD_DIR, 'mudancas.jsonl');
    if (!fs.existsSync(filePath)) return { content: [{ type: 'text', text: '[]' }] };
    const linhas = fs.readFileSync(filePath, 'utf8').split('\n').filter(Boolean);
    const entradas = linhas.slice(-limite).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean).reverse();
    return { content: [{ type: 'text', text: JSON.stringify(entradas, null, 2) }] };
  });

  server.tool('ler_arquivo_projeto', `Le um arquivo de coordenacao, documentacao, modulo ou teste dentro das pastas permitidas: ${PROJECT_FILE_ALLOWLIST.join(', ')}. Bloqueia caminhos fora da lista e arquivos sensiveis.`, {
    caminho: z.string().min(1).max(240).describe('Caminho relativo, por exemplo agent_sync/changes/arquivo.md.')
  }, async ({ caminho }) => {
    const conteudo = readAllowedProjectFile(PROJECT_ROOT, caminho);
    return { content: [{ type: 'text', text: conteudo }] };
  });


  registrarToolsVault(server, obterVault);

  return server;
}

const httpServer = http.createServer(async (req, res) => {
  if (req.url === '/health') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end('{"ok":true}'); }
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  if (parsedUrl.pathname !== '/mcp') { res.writeHead(404); return res.end(); }
  const headerOk = req.headers.authorization === `Bearer ${API_TOKEN}`;
  const queryOk = parsedUrl.searchParams.get('token') === API_TOKEN;
  if (!headerOk && !queryOk) {
    res.writeHead(401, { 'Content-Type': 'application/json', 'WWW-Authenticate': 'Bearer' });
    return res.end('{"error":"unauthorized"}');
  }
  tocarAtividade();
  const server = createServer();
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
httpServer.listen(PORT, '0.0.0.0', () => console.log(`MCP HTTP ativo na porta ${PORT}`));
