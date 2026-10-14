import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

// Tools vault_* registradas no MCP do Trafegus (mcp-http.mjs) e no MCP do cerebro (cerebro-http.mjs).
export const NOMES_TOOLS_VAULT = Object.freeze(['vault_indice', 'vault_listar', 'vault_ler', 'vault_buscar', 'vault_escrever', 'vault_editar']);

// Registro de uso (uma linha JSON por chamada, sem conteudo de nota) para medir se as IAs usam o cerebro.
const USO_LOG_PADRAO = process.env.VAULT_USO_LOG || '/state/vault-uso.jsonl';
const MCP_PADRAO = process.env.MCP_NOME || path.basename(process.argv[1] || '').replace(/(-http)?\.mjs$/, '') || 'mcp';

export function nomeDaIA(userAgent) {
  const ua = String(userAgent || '');
  if (!ua) return 'desconhecida';
  if (/codex/i.test(ua)) return 'Codex';
  if (/openai|chatgpt/i.test(ua)) return 'ChatGPT';
  if (/claude|anthropic/i.test(ua)) return 'Claude';
  if (/gemini|google/i.test(ua)) return 'Gemini';
  return ua.slice(0, 40);
}

function cabecalho(extra, nome) {
  const h = extra && extra.requestInfo && extra.requestInfo.headers;
  if (!h) return '';
  const v = typeof h.get === 'function' ? h.get(nome) : h[nome];
  return Array.isArray(v) ? v[0] : (v || '');
}

export function registrarToolsVault(server, obterVault, { usoLog = USO_LOG_PADRAO, mcp = MCP_PADRAO } = {}) {
  const json = dados => ({ content: [{ type: 'text', text: JSON.stringify(dados, null, 2) }] });
  const anotar = entrada => { try { fs.appendFileSync(usoLog, JSON.stringify(entrada) + '\n'); } catch { /* medir nunca pode quebrar a tool */ } };

  const ferramenta = (nome, descricao, schema, fn) => server.tool(nome, descricao, schema, async (args = {}, extra) => {
    const inicio = Date.now();
    let ok = true;
    try { return await fn(args); } catch (e) { ok = false; throw e; } finally {
      anotar({
        ts: new Date(inicio).toISOString(), mcp, ia: nomeDaIA(cabecalho(extra, 'user-agent')), tool: nome,
        caminho: args.caminho || args.pasta || '', termo: args.termo ? String(args.termo).slice(0, 60) : undefined,
        ok, ms: Date.now() - inicio,
      });
    }
  });

  ferramenta('vault_indice', 'PRIMEIRA chamada em qualquer tarefa: indice da arvore do cerebro (vault Obsidian: arvores trafegus, projetos e servidor) com tarefas em andamento e casos recentes. Gerado automaticamente, max 8000 caracteres. Protocolo em COMO-USAR.md.', {}, async () => {
    return { content: [{ type: 'text', text: obterVault().indice().conteudo }] };
  });

  ferramenta('vault_listar', 'Lista notas e pastas do vault com tamanho e data de modificacao (max 200 itens).', {
    pasta: z.string().max(240).optional().describe('Pasta relativa ao vault, ex: trafegus/casos ou projetos. Vazio = raiz.'),
    recursivo: z.boolean().optional()
  }, async ({ pasta, recursivo = false }) => json(obterVault().listar({ pasta, recursivo })));

  ferramenta('vault_ler', 'Le uma nota do vault paginada por caracteres (max 8000 por chamada). Continue com inicio=proximo_inicio enquanto ha_mais for true.', {
    caminho: z.string().min(1).max(240).describe('Caminho relativo, ex: trafegus/tarefas/anjun-fim-viagem.md'),
    inicio: z.number().int().min(0).optional(),
    limite: z.number().int().min(1).max(8000).optional()
  }, async ({ caminho, inicio = 0, limite = 8000 }) => json(obterVault().ler({ caminho, inicio, limite })));

  ferramenta('vault_buscar', 'Busca no vault (nome e conteudo das notas .md, sem diferenciar maiusculas nem acentos). Retorna so caminho, linha e trecho de ~200 caracteres; depois use vault_ler.', {
    termo: z.string().min(2).max(200),
    pasta: z.string().max(240).optional().describe('Restringe a busca a uma PASTA (nunca um arquivo), ex: trafegus/casos, trafegus/conhecimento ou projetos/prospector.'),
    limite: z.number().int().min(1).max(30).optional()
  }, async ({ termo, pasta, limite = 10 }) => json(obterVault().buscar({ termo, pasta, limite })));

  ferramenta('vault_escrever', 'Cria, substitui ou anexa uma nota .md no vault, dentro de uma arvore (ex: trafegus/tarefas/, trafegus/armadilhas/, projetos/<projeto>/, servidor/). templates/ e trafegus/conhecimento/ sao somente leitura. criar falha se ja existir. Max 100 KB. Nunca grave segredos. Para mudar um trecho, prefira vault_editar.', {
    caminho: z.string().min(1).max(240),
    conteudo: z.string(),
    modo: z.enum(['criar', 'substituir', 'anexar'])
  }, async ({ caminho, conteudo, modo }) => json(obterVault().escrever({ caminho, conteudo, modo })));

  ferramenta('vault_editar', 'Substitui um trecho de uma nota do vault. trecho_antigo precisa aparecer exatamente uma vez. Economiza tokens em vez de reescrever a nota.', {
    caminho: z.string().min(1).max(240),
    trecho_antigo: z.string().min(1),
    trecho_novo: z.string()
  }, async ({ caminho, trecho_antigo, trecho_novo }) => json(obterVault().editar({ caminho, trecho_antigo, trecho_novo })));
}
