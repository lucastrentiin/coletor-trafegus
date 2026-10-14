// Servidor MCP que expõe o /api/custom-query do coletor-trafegus como
// ferramentas para o Claude. Roda local (stdio), na mesma máquina onde
// `npm run web` do coletor está de pé.
//
// Variáveis de ambiente esperadas (ver mcp/.env.example):
//   TRAFEGUS_BASE_URL   - default http://localhost:3000
//   TRAFEGUS_LOGIN       - login do usuário de serviço (ver README-MCP.md)
//   TRAFEGUS_PASSWORD    - senha desse usuário
//
// Não usa as credenciais de banco de cada cliente diretamente - só fala
// HTTP com o coletor, que já sabe abrir a conexão certa (com ou sem
// túnel SSH) e já valida que o SQL é um SELECT único (backend/... /
// web/server.js -> isSafeSelect).

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

// Carrega mcp/.env explicitamente (não depende do cwd de quem chamou o node)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

const BASE_URL = (process.env.TRAFEGUS_BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');
const LOGIN = process.env.TRAFEGUS_LOGIN || '';
const PASSWORD = process.env.TRAFEGUS_PASSWORD || '';
const MAX_ROWS_PER_CLIENT = 500; // trava de segurança contra resposta gigante

if (!LOGIN || !PASSWORD) {
    console.error('[coletor-mcp] TRAFEGUS_LOGIN / TRAFEGUS_PASSWORD não configurados. Ver mcp/.env.example.');
    process.exit(1);
}

let sessionCookie = null;
let sessionExpiresAt = 0;

function cookieFromSetCookie(res) {
    const list = typeof res.headers.getSetCookie === 'function'
        ? res.headers.getSetCookie()
        : (res.headers.get('set-cookie') ? [res.headers.get('set-cookie')] : []);
    const found = list.find(c => c.startsWith('trafegus_session='));
    if (!found) return null;
    return found.split(';')[0]; // "trafegus_session=<token>"
}

async function login() {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login: LOGIN, password: PASSWORD })
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.ok) {
        throw new Error(`Login no coletor falhou: ${body.error || res.status}`);
    }
    const cookie = cookieFromSetCookie(res);
    if (!cookie) throw new Error('Login OK mas sem cookie de sessão na resposta.');
    sessionCookie = cookie;
    // sessão dura 12h no servidor - renova com folga
    sessionExpiresAt = Date.now() + 11 * 3600 * 1000;
}

async function ensureSession() {
    if (!sessionCookie || Date.now() >= sessionExpiresAt) await login();
}

async function apiFetch(path, opts = {}) {
    await ensureSession();
    const doFetch = () => fetch(`${BASE_URL}${path}`, {
        ...opts,
        headers: {
            'Content-Type': 'application/json',
            Cookie: sessionCookie,
            ...(opts.headers || {})
        }
    });

    let res = await doFetch();
    if (res.status === 401) {
        // sessão pode ter sido revogada do lado do servidor - loga de novo, uma vez
        await login();
        res = await doFetch();
    }
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body.ok === false) {
        throw new Error(body.error || `Erro HTTP ${res.status} em ${path}`);
    }
    return body;
}

function trimResults(results) {
    return (results || []).map(r => {
        if (Array.isArray(r.rows) && r.rows.length > MAX_ROWS_PER_CLIENT) {
            return {
                ...r,
                rows: r.rows.slice(0, MAX_ROWS_PER_CLIENT),
                truncated: true,
                totalRows: r.rows.length,
                aviso: `Resultado truncado em ${MAX_ROWS_PER_CLIENT} linhas - refine o SQL com WHERE/LIMIT/agregação.`
            };
        }
        return r;
    });
}

const server = new McpServer({
    name: 'coletor-trafegus',
    version: '1.0.0'
});

server.tool(
    'listar_clientes',
    'Lista os clientes cadastrados no coletor-trafegus (id, nome, se está habilitado). Use antes de consulta_personalizada para achar o clientId certo.',
    {},
    async () => {
        const data = await apiFetch('/api/clients', { method: 'GET' });
        return {
            content: [{ type: 'text', text: JSON.stringify(data.clients, null, 2) }]
        };
    }
);

server.tool(
    'consulta_personalizada',
    'Executa um SELECT (somente leitura, um único statement) no banco Postgres de um ou mais clientes do coletor-trafegus, via /api/custom-query. ' +
    'O backend já recusa qualquer coisa que não seja um único SELECT (sem ; , sem insert/update/delete/drop/alter/create/truncate/grant/revoke/copy/do/call/vacuum/analyze/refresh). ' +
    'Use listar_clientes primeiro para achar o clientId. Prefira SQL com WHERE/LIMIT/agregação a trazer muitas linhas.',
    {
        sql: z.string().describe('Query SQL, deve começar com SELECT e ser um único statement (sem ";").'),
        clientIds: z.array(z.string()).min(1).describe('IDs dos clientes (de listar_clientes) onde a query vai rodar.'),
        nome: z.string().optional().describe('Nome curto da consulta, só para identificação no log/auditoria do coletor.')
    },
    async ({ sql, clientIds, nome }) => {
        const data = await apiFetch('/api/custom-query', {
            method: 'POST',
            body: JSON.stringify({
                source: 'CLIENTES',
                sql,
                clientIds,
                name: nome || 'Consulta via Claude',
                category: 'CLAUDE'
            })
        });
        const results = trimResults(data.results);
        return {
            content: [{
                type: 'text',
                text: JSON.stringify({ failed: data.failed, errors: data.errors, results }, null, 2)
            }]
        };
    }
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`[coletor-mcp] conectado - falando com ${BASE_URL}`);
