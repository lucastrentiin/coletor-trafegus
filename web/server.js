require('dotenv').config({
    path: require('path').join(__dirname, '..', 'config', 'credentials.env')
});
const http = require('http');
const fs = require('fs');
const path = require('path');
const {
    Client
} = require('pg');
const cfg = require('../backend/config');
const {
    collectClient,
    collectAtendimentos,
    attendanceConfigured,
    INFO
} = require('../backend/collector');
const { formatError } = require('../backend/errors');
const { log: fileLog } = require('../backend/logger');
const { normalizeSshKey } = require('../backend/ssh-key');
const { appPool, appDbConfigured } = require('../backend/appdb');
const configStore = require('../backend/config-store');
const logConfig = require('../backend/log-config');
const authLib = require('../backend/auth');
const { hashPassword, randomTempPassword, encryptSecret, decryptSecret } = require('../backend/crypto-util');

const ROOT = __dirname;
const CONFIG_DIR = path.join(__dirname, '..', 'config');
const ENV_FILE = path.join(CONFIG_DIR, 'credentials.env');
const LOG_DIR = path.join(__dirname, '..', 'logs');
const PORT = cfg.webPort || 3000;

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.ico': 'image/x-icon'
};

function send(res, status, type, body, extra = {}) {
    res.writeHead(status, {
        'Content-Type': type,
        'Cache-Control': 'no-store',
        ...extra
    });
    res.end(body);
}

function json(res, status, body) {
    send(res, status, 'application/json; charset=utf-8', JSON.stringify(body));
}

function atomicWrite(file, content) {
    fs.mkdirSync(path.dirname(file), {
        recursive: true
    });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, content, 'utf8');
    fs.renameSync(tmp, file);
}

// Clientes, grupos de credenciais e buscas personalizadas moraram
// direto em arquivo aqui. Agora passam pela camada backend/config-store,
// que grava em banco quando APP_DB_* esta configurado, e em arquivo
// quando nao esta - sem mudar o formato usado pelo resto deste arquivo.
async function readClients() { return configStore.listClients(); }
async function disableClientAfterFailure(client, error) {
    await configStore.markClientFailure(client.id, formatError(error));
    fileLog(`CLIENTE DESATIVADO: ${client.name} — ${formatError(error)}`, 'ERRO', 'CLIENTE.FALHA_CONEXAO');
    if (appDbConfigured()) {
        await authLib.recordAudit(appPool(), {
            action: 'DESATIVAR_FALHA', resource: 'cliente', resourceId: client.id,
            status: 'FALHA', details: { cliente: client.name, erro: formatError(error) },
            event: 'CLIENTE.FALHA_CONEXAO'
        });
    }
}

function parseEnv() {
    const out = {};
    if (!fs.existsSync(ENV_FILE)) return out;
    for (const line of fs.readFileSync(ENV_FILE, 'utf8').split(/\r?\n/)) {
        if (!line.trim() || line.trim().startsWith('#') || !line.includes('=')) continue;
        const i = line.indexOf('=');
        out[line.slice(0, i).trim()] = line.slice(i + 1);
    }
    return out;
}

function writeEnv(values) {
    let text = fs.existsSync(ENV_FILE) ? fs.readFileSync(ENV_FILE, 'utf8') : '';
    const lines = text.split(/\r?\n/);
    const seen = new Set();
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line || line.trim().startsWith('#') || !line.includes('=')) continue;
        const key = line.slice(0, line.indexOf('=')).trim();
        if (Object.prototype.hasOwnProperty.call(values, key)) {
            lines[i] = `${key}=${values[key] ?? ''}`;
            seen.add(key);
        }
    }
    for (const [key, value] of Object.entries(values))
        if (!seen.has(key)) lines.push(`${key}=${value ?? ''}`);
    atomicWrite(ENV_FILE, lines.join('\n').replace(/\n+$/, '') + '\n');
}
async function parseBody(req) {
    return await new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => {
            body += chunk;
            if (body.length > 6_000_000) {
                reject(new Error('Payload muito grande'));
                req.destroy();
            }
        });
        req.on('end', () => {
            try {
                resolve(body ? JSON.parse(body) : {});
            } catch {
                reject(new Error('JSON inválido'));
            }
        });
        req.on('error', reject);
    });
}

function clientDto(c) {
    return {
        id: c.id,
        nome: c.name || '',
        name: c.name || '',
        enabled: !!c.enabled,
        host: c.db?.host || '',
        port: Number(c.db?.port || 5432),
        database: c.db?.database || '',
        credentialGroup: c.db?.credentialGroup || '',
        hasOwnDbCredential: !!c.db?.hasOwnCredential,
        dbUser: c.db?.ownUser || '',
        sshEnabled: !!c.ssh?.enabled,
        sshHost: c.ssh?.host || '',
        sshPort: Number(c.ssh?.port || 22),
        sshCredentialGroup: c.ssh?.credentialGroup || '',
        hasOwnSshCredential: !!c.ssh?.hasOwnCredential,
        hasOwnSshKey: !!c.ssh?.hasOwnKey,
        sshUser: c.ssh?.ownUser || '',
        sshDbHost: c.ssh?.dbHost || '',
        sshDbPort: Number(c.ssh?.dbPort || c.db?.port || 5432),
        attendanceName: c.attendanceName || c.name || '',
        lastError: c.lastError || '',
        lastErrorAt: c.lastErrorAt || ''
    };
}

function externalDto(env) {
    const read = prefix => ({
        enabled: String(env[`${prefix}ENABLED`] || '').toLowerCase() === 'true',
        host: env[`${prefix}HOST`] || '',
        port: Number(env[`${prefix}PORT`] || 5432),
        database: env[`${prefix}NAME`] || '',
        user: env[`${prefix}USER`] || '',
        hasPassword: !!env[`${prefix}PASSWORD`],
        ssl: String(env[`${prefix}SSL`] || '').toLowerCase() === 'true'
    });
    return {
        atendimentos: read('ATENDIMENTOS_DB_'),
        central: read('CENTRAL_DB_')
    };
}

async function groupDto(g) {
    const detail = await configStore.groupDetail(g.id);
    return { ...detail, name: g.name || g.id, usedBy: await configStore.groupUsageCount(g.id) };
}

function validateDateString(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) throw new Error(`Data inválida: ${value || '(vazia)'}`);
    const [y, m, d] = value.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) throw new Error(`Data inexistente: ${value}`);
    return value;
}

function addDays(s, n) {
    const d = new Date(`${s}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
}

function nextMonth(s) {
    const d = new Date(`${s}T00:00:00Z`);
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() + 1);
    return d.toISOString().slice(0, 10);
}

function periodRange(type, payload) {
    type = String(type || 'DIA').toUpperCase();
    if (type === 'MES') {
        const month = String(payload.month || payload.date || '');
        if (!/^\d{4}-\d{2}$/.test(month)) throw new Error('Mês inválido.');
        const start = validateDateString(`${month}-01`);
        return {
            start,
            end: nextMonth(start),
            endInclusive: addDays(nextMonth(start), -1),
            collectorDate: start,
            period: 'MENSAL',
            mode: 'MES'
        };
    }
    if (type === 'PERIODO') {
        const start = validateDateString(payload.startDate);
        const endInclusive = validateDateString(payload.endDate);
        if (endInclusive < start) throw new Error('A data final não pode ser anterior à inicial.');
        return {
            start,
            end: addDays(endInclusive, 1),
            endInclusive,
            collectorDate: start,
            period: 'DIARIO',
            mode: 'PERIODO'
        };
    }
    const date = validateDateString(payload.date);
    if (type === 'SEMANA') {
        // Regra da interface: a data escolhida é o início e o intervalo
        // termina 7 dias depois, inclusive. Portanto 14/08 -> 21/08
        // usa fim exclusivo em 22/08 00:00:00.
        const endInclusive = addDays(date, 7);
        return {
            start: date,
            end: addDays(endInclusive, 1),
            collectorDate: date,
            period: 'DIARIO',
            mode: 'SEMANA',
            endInclusive
        };
    }
    return {
        start: date,
        end: addDays(date, 1),
        collectorDate: date,
        period: 'DIARIO',
        mode: 'DIA',
        endInclusive: date
    };
}

// Antes, um unico cliente ja desabilitado bloqueava a consulta do lote
// inteiro (mesmo os demais clientes saudaveis). Agora os desabilitados
// sao apenas ignorados e devolvidos em "skipped" para o frontend remover
// da selecao automaticamente.
async function selectedClients(ids) {
    const wanted = new Set((ids || []).map(String));
    const requested = (await readClients()).filter(c => wanted.has(String(c.id)));
    const clients = requested.filter(c => c.enabled);
    const skipped = requested.filter(c => !c.enabled);
    if (!clients.length) throw new Error('Selecione pelo menos um cliente habilitado.');
    return { clients, skipped };
}

function skippedDto(skipped) {
    return skipped.map(c => ({
        id: c.id,
        name: c.name,
        error: c.lastError || 'Cliente desabilitado.'
    }));
}

function aggregateRows(all) {
    const map = new Map();
    for (const item of all) {
        const scope = item.escopo || 'PERIODO';
        const key = `${item.categoria}\u0000${item.indicador}\u0000${item.evento || ''}\u0000${scope}`;
        const current = map.get(key);
        const value = item.quantidade == null ? null : Number(item.quantidade);
        if (current) {
            if (value != null) current.quantidade = Number(current.quantidade || 0) + value;
        } else {
            map.set(key, {
                ...item,
                quantidade: value
            });
        }
    }
    return [...map.values()];
}

function totals(rows) {
    const find = (cat, ind, scope = 'PERIODO') => Number(rows.find(r => r.categoria === cat && r.indicador === ind && (r.escopo || 'PERIODO') === scope)?.quantidade || 0);
    return {
        eventosGerados: find('EVENTOS', 'TOTAL_PERIODO', 'PERIODO'),
        acessosTotal: find('USUARIOS', 'QUANTIDADE_ACESSOS', 'PERIODO'),
        usuariosConectados: find('USUARIOS', 'CONECTADOS_PERIODO', 'PERIODO'),
        viagens: find('VIAGENS', 'TOTAL_PERIODO', 'PERIODO'),
        terminaisAtivos: find('TERMINAIS', 'ATIVOS_SISTEMA', 'SISTEMA'),
    };
}


// Busca personalizada: roda dentro de uma transação READ ONLY com statement_timeout local.
// SET LOCAL vale só para esta transação (seguro mesmo com pgbouncer); o banco recusa qualquer escrita.
async function querySomenteLeitura(client, sql, params) {
    const ms = Math.max(1000, Number(cfg.queryTimeout) || 60000);
    await client.query('BEGIN READ ONLY');
    try {
        await client.query(`SET LOCAL statement_timeout = ${ms}`);
        const result = await client.query(sql, params);
        await client.query('COMMIT');
        return result;
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
    }
}

function isSafeSelect(sql, usesPeriod) {
    const s = String(sql || '').trim();
    if (!/^select\b/i.test(s)) throw new Error('A busca personalizada precisa começar com SELECT.');
    if (/[;\0]/.test(s)) throw new Error('A consulta deve conter somente um SELECT, sem ponto e vírgula/comandos extras.');
    if (/\b(insert|update|delete|drop|alter|create|truncate|grant|revoke|copy|do|call|vacuum|analyze|refresh)\b/i.test(s)) throw new Error('SQL não permitido para busca personalizada.');
    if (usesPeriod && (!/\$1\b/.test(s) || !/\$2\b/.test(s))) throw new Error('A consulta marcada com período deve usar $1 (início) e $2 (fim).');
    if (!usesPeriod && /\$(1|2)\b/.test(s)) throw new Error('A consulta sem período não pode usar $1 ou $2.');
    return s;
}

function externalDbConfig(source) {
    const env = parseEnv();
    const prefix = source === 'ATENDIMENTOS' ? 'ATENDIMENTOS_DB_' : 'CENTRAL_DB_';
    return {
        enabled: String(env[`${prefix}ENABLED`] || '').toLowerCase() === 'true',
        host: env[`${prefix}HOST`] || '',
        port: Number(env[`${prefix}PORT`] || 5432),
        database: env[`${prefix}NAME`] || '',
        user: env[`${prefix}USER`] || '',
        password: env[`${prefix}PASSWORD`] || '',
        ssl: String(env[`${prefix}SSL`] || 'false').toLowerCase() === 'true'
    };
}
async function openExternalSource(source) {
    const cfgDb = externalDbConfig(source);
    if (!cfgDb.enabled) {
        throw new Error(`Conexão do banco ${source === 'ATENDIMENTOS' ? 'de atendimentos' : 'central do coletor'} está desativada. Ative-a em Configuração.`);
    }
    if (!cfgDb.host || !cfgDb.database || !cfgDb.user || !cfgDb.password) {
        throw new Error(`Conexão do banco ${source === 'ATENDIMENTOS' ? 'de atendimentos' : 'central do coletor'} não configurada em config/credentials.env.`);
    }
    const client = new Client({
        ...cfgDb,
        connectionTimeoutMillis: cfg.connectionTimeout,
        query_timeout: cfg.queryTimeout
    });
    await client.connect();
    return client;
}

function normalizeCustomRows(rows, sourceLabel, queryName, category, description) {
    return {
        columns: rows.length ? Object.keys(rows[0]) : [],
        rows: rows.map(row => ({
            ...row
        })),
        source: sourceLabel,
        query: queryName,
        category: category || 'PERSONALIZADA',
        description: description || ''
    };
}
// Processa em lotes (mesmo tamanho do coletor automatico, cfg.concurrency)
// em vez de disparar todos os clientes de uma vez. Com muitos clientes
// selecionados, abrir varios tuneis SSH simultaneos satura a CPU (o
// handshake e trabalho de criptografia) e acaba deixando tudo mais
// lento do que processar em lotes menores.
// Identifica o SERVIDOR FISICO que vai receber a carga do cliente. Clientes
// diferentes usam portas diferentes, mas varios moram na mesma maquina, entao
// o limite por servidor tem de olhar so o host.
function hostKeyOf(client) {
    if (client?.ssh?.enabled && client.ssh.host) return `ssh:${client.ssh.host}`;
    return `db:${client?.db?.host || client?.host || 'desconhecido'}`;
}

async function runInBatches(items, size, worker, keyOf = hostKeyOf) {
    // Fila deslizante com teto por servidor.
    //
    // 1) Fila deslizante: antes isso processava em lotes fechados e cada lote
    //    so comecava depois que o cliente MAIS LENTO do lote anterior terminava
    //    - com 44 clientes e lote 22, dois lotes levavam ~75s enquanto todos
    //    juntos levavam ~38s: metade do tempo era espera ociosa. Agora, assim
    //    que um cliente termina, o proximo entra no lugar dele.
    //
    // 2) Teto por servidor: ha IPs que hospedam mais de 10 bases. Sem limite,
    //    a concorrencia global toda poderia cair sobre uma unica maquina. Se o
    //    servidor do proximo cliente da fila ja esta no teto, pulamos para o
    //    proximo cliente de OUTRO servidor em vez de segurar a fila.
    //
    // A ordem do array devolvido continua sendo a ordem de entrada.
    const limit = Math.max(1, Number(size) || 1);
    const perHost = Math.max(1, Number(cfg.concurrencyPerHost) || 4);
    const results = new Array(items.length);
    const pendentes = items.map((item, index) => ({ item, index }));
    const emUso = new Map();

    async function runner() {
        while (true) {
            let escolhido = -1;
            let restam = false;
            for (let k = 0; k < pendentes.length; k++) {
                if (!pendentes[k]) continue;
                restam = true;
                if ((emUso.get(keyOf(pendentes[k].item)) || 0) < perHost) { escolhido = k; break; }
            }
            if (escolhido === -1) {
                if (!restam) return;            // acabou a fila
                await new Promise(r => setTimeout(r, 25)); // todo servidor no teto
                continue;
            }
            const { item, index } = pendentes[escolhido];
            pendentes[escolhido] = null;
            const chave = keyOf(item);
            emUso.set(chave, (emUso.get(chave) || 0) + 1);
            try {
                results[index] = await worker(item, index);
            } finally {
                emUso.set(chave, (emUso.get(chave) || 1) - 1);
            }
        }
    }
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, runner));
    return results;
}

async function collectForClient(c, range) {
    let rows = [];
    let clientError = null;
    // O banco do cliente e o banco de atendimentos sao servidores diferentes,
    // entao as duas coletas rodam ao mesmo tempo em vez de uma esperar a outra.
    // A ordem das linhas no resultado continua identica: as de atendimentos sao
    // anexadas depois das do cliente, exatamente como antes.
    const clientPromise = collectClient(c, range.collectorDate, range.period, () => {}, {
        startDate: range.start,
        endDate: range.end
    });
    const attendancePromise = attendanceConfigured()
        ? collectAtendimentos(c.attendanceName || c.name, range.start, range.end, () => {}, c.attendanceAliases || [])
        : null;
    // Evita "unhandled rejection" caso a coleta do cliente falhe primeiro.
    if (attendancePromise) attendancePromise.catch(() => {});

    try {
        rows = await clientPromise;
    } catch (error) {
        clientError = formatError(error.message);
    }
    if (attendancePromise) {
        try {
            const attendance = await attendancePromise;
            rows.push(...attendance);
        } catch (error) {
            const message = `Banco de atendimentos: ${formatError(error.message)}`;
            for (const indicator of ['BACKLOG_ENTRADA','ABERTOS_PERIODO','FECHADOS_PERIODO','BACKLOG_SAIDA']) {
                rows.push({
                    categoria: 'CHAMADOS',
                    indicador: indicator,
                    evento: 'ATENDIMENTOS_INDISPONIVEIS',
                    quantidade: null,
                    info: message,
                    escopo: 'PERIODO'
                });
            }
        }
    } else {
        for (const indicator of ['BACKLOG_ENTRADA','ABERTOS_PERIODO','FECHADOS_PERIODO','BACKLOG_SAIDA']) {
            rows.push({
                categoria: 'CHAMADOS',
                indicador: indicator,
                evento: 'BANCO_NAO_CONFIGURADO',
                quantidade: null,
                info: 'Banco de atendimentos não configurado ou desativado. Configure em Configuração → Sistema.',
                escopo: 'PERIODO'
            });
        }
    }
    return { rows, ok: !clientError, error: clientError };
}
function excelColumnLetter(n) {
    let s = '';
    while (n > 0) {
        const r = (n - 1) % 26;
        s = String.fromCharCode(65 + r) + s;
        n = Math.floor((n - 1) / 26);
    }
    return s;
}

async function exportWorkbook(results, clients, range, mode = 'JUNTO', detailLevel = 'DETALHADA') {
    const { exportWorkbook } = require('../backend/report');
    return exportWorkbook(results, clients, range, mode, detailLevel);
}

// Publicas mesmo com o banco de aplicacao (login) ativado.
const PUBLIC_PATHS = new Set(['/login.html', '/api/health', '/api/auth/login']);

class HttpError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}


// --- VPNs: conversa com o vpn-agent do host por socket Unix ---
const VPN_AGENT_SOCKET = process.env.VPN_AGENT_SOCKET || '/app/vpn-run/vpn.sock';
function vpnAgent(method, agentPath, timeoutMs = 120000, payload) {
    return new Promise((resolve, reject) => {
        const r = http.request({ socketPath: VPN_AGENT_SOCKET, path: agentPath, method, timeout: timeoutMs, headers: payload ? { 'Content-Type': 'application/json' } : undefined }, (resp) => {
            let body = '';
            resp.setEncoding('utf8');
            resp.on('data', (c) => { body += c; });
            resp.on('end', () => {
                let data;
                try { data = JSON.parse(body); } catch { data = { ok: false, error: body.slice(0, 300) }; }
                resolve({ status: resp.statusCode, data });
            });
        });
        r.on('timeout', () => r.destroy(new Error('O agente de VPN demorou demais para responder.')));
        r.on('error', (e) => reject(new HttpError(503, e.code === 'ENOENT' || e.code === 'ECONNREFUSED'
            ? 'Agente de VPN fora do ar no servidor (serviço vpn-agent).'
            : e.message)));
        r.end(payload ? JSON.stringify(payload) : undefined);
    });
}

function requirePermission(session, code) {
    if (!authLib.hasPermission(session, code)) {
        throw new HttpError(403, 'Você não tem permissão para esta ação.');
    }
}

const server = http.createServer(async (req, res) => {
    try {
        const u = new URL(req.url, 'http://localhost');

        // Login por usuario/senha e opcional: so entra em vigor quando o
        // banco de aplicacao (APP_DB_*) estiver configurado. Sem isso, o
        // sistema continua funcionando 100% em arquivos, sem tela de login,
        // como sempre funcionou (compatibilidade com quem ainda nao migrou).
        const authOn = appDbConfigured();
        let session = null;
        if (authOn) {
            const pool = appPool();
            const cookies = authLib.parseCookies(req);
            session = await authLib.sessionFromToken(pool, cookies[authLib.COOKIE_NAME]);
            if (!session && !PUBLIC_PATHS.has(u.pathname)) {
                if (u.pathname.startsWith('/api/')) return json(res, 401, { ok: false, error: 'Sessão expirada ou inválida. Faça login novamente.' });
                res.writeHead(302, { Location: '/login.html' });
                return res.end();
            }
            if (session && u.pathname === '/login.html') {
                res.writeHead(302, { Location: '/' });
                return res.end();
            }
        }

        if (req.method === 'GET' && u.pathname === '/api/health') return json(res, 200, {
            ok: true,
            version: require('../package.json').version
        });

        if (req.method === 'POST' && u.pathname === '/api/auth/login') {
            if (!authOn) throw new Error('Login não está configurado neste ambiente (APP_DB_* ausente).');
            const b = await parseBody(req);
            const pool = appPool();
            const ip = req.socket.remoteAddress;
            let result;
            try {
                result = await authLib.login(pool, String(b.login || '').trim(), String(b.password || ''), {
                    ip,
                    userAgent: req.headers['user-agent']
                });
            } catch (error) {
                await authLib.recordAudit(pool, { action: 'LOGIN', resource: 'sessao', resourceId: b.login, status: 'FALHA', ip, details: { erro: error.message }, event: 'AUTH.LOGIN_FALHA' });
                throw error;
            }
            await authLib.recordAudit(pool, { userId: result.user.id, action: 'LOGIN', resource: 'sessao', resourceId: result.user.login, ip, event: 'AUTH.LOGIN_OK' });
            res.setHeader('Set-Cookie', authLib.sessionCookieHeader(result.token, authLib.SESSION_HOURS * 3600));
            return json(res, 200, { ok: true, user: result.user, permissions: result.permissions, profiles: result.profiles });
        }
        if (req.method === 'POST' && u.pathname === '/api/auth/logout') {
            if (authOn) {
                const cookies = authLib.parseCookies(req);
                await authLib.logout(appPool(), cookies[authLib.COOKIE_NAME]);
                if (session) await authLib.recordAudit(appPool(), { userId: session.user.id, action: 'LOGOUT', resource: 'sessao', resourceId: session.user.login, ip: req.socket.remoteAddress, event: 'AUTH.LOGOUT' });
            }
            res.setHeader('Set-Cookie', authLib.clearCookieHeader());
            return json(res, 200, { ok: true });
        }
        if (req.method === 'GET' && u.pathname === '/api/auth/me') {
            if (!authOn) return json(res, 200, { ok: true, authEnabled: false, user: null, permissions: [], profiles: [] });
            return json(res, 200, { ok: true, authEnabled: true, user: session.user, permissions: session.permissions, profiles: session.profiles });
        }
        if (req.method === 'POST' && u.pathname === '/api/auth/change-password') {
            if (!authOn) throw new Error('Login não está configurado neste ambiente.');
            const b = await parseBody(req);
            const newPassword = String(b.newPassword || '');
            if (newPassword.length < 8) throw new Error('A nova senha precisa ter pelo menos 8 caracteres.');
            await authLib.changePassword(appPool(), session.user.id, newPassword);
            await authLib.recordAudit(appPool(), { userId: session.user.id, action: 'TROCAR_SENHA', resource: 'sessao', resourceId: session.user.login, ip: req.socket.remoteAddress, event: 'AUTH.TROCA_SENHA' });
            return json(res, 200, { ok: true });
        }

        if (authOn && u.pathname.startsWith('/api/users')) {
            const pool = appPool();
            if (req.method === 'GET' && u.pathname === '/api/users') {
                requirePermission(session, 'users.view');
                const { rows } = await pool.query(`
                    SELECT u.usua_codigo, u.usua_login, u.usua_nome, u.usua_email, u.usua_ativo, u.usua_trocar_senha, u.usua_ultimo_acesso,
                           COALESCE(array_agg(p.perf_sigla) FILTER (WHERE p.perf_sigla IS NOT NULL), '{}') AS perfis
                    FROM usua_usuario u
                    LEFT JOIN usup_usuario_perfil up ON up.usup_usua_codigo = u.usua_codigo
                    LEFT JOIN perf_perfil p ON p.perf_codigo = up.usup_perf_codigo
                    GROUP BY u.usua_codigo ORDER BY u.usua_nome`);
                return json(res, 200, { ok: true, users: rows.map(r => ({
                    id: r.usua_codigo, login: r.usua_login, displayName: r.usua_nome, email: r.usua_email || '',
                    active: r.usua_ativo, mustChangePassword: r.usua_trocar_senha, lastLoginAt: r.usua_ultimo_acesso,
                    profiles: r.perfis
                })) });
            }
            if (req.method === 'POST' && u.pathname === '/api/users') {
                requirePermission(session, 'users.manage');
                const b = await parseBody(req);
                const login = String(b.login || '').trim();
                const displayName = String(b.displayName || '').trim();
                if (!login || !displayName) throw new Error('Login e nome são obrigatórios.');
                const profileIds = Array.isArray(b.profileIds) ? b.profileIds : [];
                let userId = b.id || null;
                let tempPassword = null;
                if (userId) {
                    await pool.query('UPDATE usua_usuario SET usua_login=$2, usua_nome=$3, usua_email=$4, usua_ativo=$5 WHERE usua_codigo=$1',
                        [userId, login, displayName, b.email || null, b.active !== false]);
                } else {
                    tempPassword = randomTempPassword();
                    const { rows } = await pool.query(
                        `INSERT INTO usua_usuario(usua_login, usua_nome, usua_email, usua_senha_hash, usua_ativo, usua_trocar_senha)
                         VALUES ($1,$2,$3,$4,$5,true) RETURNING usua_codigo`,
                        [login, displayName, b.email || null, hashPassword(tempPassword), b.active !== false]
                    );
                    userId = rows[0].usua_codigo;
                }
                await pool.query('DELETE FROM usup_usuario_perfil WHERE usup_usua_codigo = $1', [userId]);
                for (const profileId of profileIds) {
                    await pool.query('INSERT INTO usup_usuario_perfil(usup_usua_codigo, usup_perf_codigo) VALUES ($1,$2) ON CONFLICT DO NOTHING', [userId, profileId]);
                }
                await authLib.recordAudit(pool, { userId: session.user.id, action: b.id ? 'EDITAR' : 'CRIAR', resource: 'usuario', resourceId: userId, ip: req.socket.remoteAddress, details: { login }, event: b.id ? 'USUARIO.EDITAR' : 'USUARIO.CRIAR' });
                return json(res, 200, { ok: true, id: userId, tempPassword });
            }
            if (req.method === 'POST' && u.pathname === '/api/users/reset-password') {
                requirePermission(session, 'users.manage');
                const b = await parseBody(req);
                if (!b.id) throw new Error('Informe o usuário.');
                const tempPassword = randomTempPassword();
                await pool.query('UPDATE usua_usuario SET usua_senha_hash=$2, usua_trocar_senha=true WHERE usua_codigo=$1', [b.id, hashPassword(tempPassword)]);
                await authLib.recordAudit(pool, { userId: session.user.id, action: 'RESETAR_SENHA', resource: 'usuario', resourceId: b.id, ip: req.socket.remoteAddress, event: 'USUARIO.RESETAR_SENHA' });
                return json(res, 200, { ok: true, tempPassword });
            }
            if (req.method === 'DELETE' && u.pathname.startsWith('/api/users/')) {
                requirePermission(session, 'users.manage');
                const id = u.pathname.split('/').pop();
                if (String(id) === String(session.user.id)) throw new Error('Você não pode excluir o próprio usuário.');
                await pool.query('DELETE FROM usua_usuario WHERE usua_codigo = $1', [id]);
                await authLib.recordAudit(pool, { userId: session.user.id, action: 'EXCLUIR', resource: 'usuario', resourceId: id, ip: req.socket.remoteAddress, event: 'USUARIO.EXCLUIR' });
                return json(res, 200, { ok: true });
            }
        }

        if (authOn && u.pathname.startsWith('/api/profiles')) {
            const pool = appPool();
            if (req.method === 'GET' && u.pathname === '/api/profiles') {
                requirePermission(session, 'profiles.view');
                const { rows: profiles } = await pool.query('SELECT perf_codigo, perf_sigla, perf_nome, perf_descricao, perf_ativo FROM perf_perfil ORDER BY perf_nome');
                const { rows: perms } = await pool.query('SELECT perm_codigo, perm_sigla, perm_nome, perm_area, perm_acao FROM perm_permissao ORDER BY perm_area, perm_acao');
                const { rows: links } = await pool.query('SELECT pepe_perf_codigo, pepe_perm_codigo FROM pepe_perfil_permissao');
                const byProfile = {};
                links.forEach(l => { (byProfile[l.pepe_perf_codigo] ||= []).push(l.pepe_perm_codigo); });
                return json(res, 200, {
                    ok: true,
                    profiles: profiles.map(p => ({ id: p.perf_codigo, code: p.perf_sigla, name: p.perf_nome, description: p.perf_descricao || '', active: p.perf_ativo, permissionIds: byProfile[p.perf_codigo] || [] })),
                    permissions: perms.map(p => ({ id: p.perm_codigo, code: p.perm_sigla, name: p.perm_nome, area: p.perm_area, action: p.perm_acao }))
                });
            }
            if (req.method === 'POST' && u.pathname === '/api/profiles') {
                requirePermission(session, 'profiles.manage');
                const b = await parseBody(req);
                const code = String(b.code || '').trim().toUpperCase().replace(/\s+/g, '_');
                const name = String(b.name || '').trim();
                if (!code || !name) throw new Error('Código e nome são obrigatórios.');
                const permissionIds = Array.isArray(b.permissionIds) ? b.permissionIds : [];
                let profileId = b.id || null;
                if (profileId) {
                    await pool.query('UPDATE perf_perfil SET perf_sigla=$2, perf_nome=$3, perf_descricao=$4, perf_ativo=$5 WHERE perf_codigo=$1',
                        [profileId, code, name, b.description || null, b.active !== false]);
                } else {
                    const { rows } = await pool.query(
                        'INSERT INTO perf_perfil(perf_sigla, perf_nome, perf_descricao) VALUES ($1,$2,$3) RETURNING perf_codigo',
                        [code, name, b.description || null]
                    );
                    profileId = rows[0].perf_codigo;
                }
                await pool.query('DELETE FROM pepe_perfil_permissao WHERE pepe_perf_codigo = $1', [profileId]);
                for (const permissionId of permissionIds) {
                    await pool.query('INSERT INTO pepe_perfil_permissao(pepe_perf_codigo, pepe_perm_codigo) VALUES ($1,$2) ON CONFLICT DO NOTHING', [profileId, permissionId]);
                }
                await authLib.recordAudit(pool, { userId: session.user.id, action: b.id ? 'EDITAR' : 'CRIAR', resource: 'perfil', resourceId: profileId, ip: req.socket.remoteAddress, details: { code }, event: b.id ? 'PERFIL.EDITAR' : 'PERFIL.CRIAR' });
                return json(res, 200, { ok: true, id: profileId });
            }
            if (req.method === 'DELETE' && u.pathname.startsWith('/api/profiles/')) {
                requirePermission(session, 'profiles.manage');
                const id = u.pathname.split('/').pop();
                const { rows } = await pool.query('SELECT count(*)::int AS total FROM usup_usuario_perfil WHERE usup_perf_codigo = $1', [id]);
                if (rows[0].total > 0) throw new Error('Este perfil ainda está atribuído a usuários.');
                await authLib.recordAudit(pool, { userId: session.user.id, action: 'EXCLUIR', resource: 'perfil', resourceId: id, ip: req.socket.remoteAddress, event: 'PERFIL.EXCLUIR' });
                await pool.query('DELETE FROM perf_perfil WHERE perf_codigo = $1', [id]);
                return json(res, 200, { ok: true });
            }
        }

        if (authOn && req.method === 'GET' && u.pathname === '/api/audit-log') {
            requirePermission(session, 'logs.view');
            const limit = Math.min(Number(new URL(req.url, 'http://localhost').searchParams.get('limit')) || 8, 50);
            const { rows } = await appPool().query(`
                SELECT a.audi_acao, a.audi_recurso, a.audi_recurso_codigo, a.audi_status, a.audi_data_cadastro,
                       u.usua_nome, u.usua_login
                FROM audi_log_auditoria a
                LEFT JOIN usua_usuario u ON u.usua_codigo = a.audi_usua_codigo
                WHERE NOT (LOWER(COALESCE(u.usua_login, '')) = 'mcp_claude' AND a.audi_recurso = 'busca-personalizada')
                ORDER BY a.audi_data_cadastro DESC
                LIMIT $1`, [limit]);
            return json(res, 200, { ok: true, entries: rows.map(r => ({
                action: r.audi_acao, resource: r.audi_recurso, resourceId: r.audi_recurso_codigo,
                status: r.audi_status, at: r.audi_data_cadastro,
                userName: r.usua_nome || r.usua_login || 'Sistema'
            })) });
        }

        if (authOn && req.method === 'GET' && u.pathname === '/api/mcp-logs') {
            requirePermission(session, 'logs.view');
            const limit = Math.min(Number(u.searchParams.get('limit')) || 100, 500);
            const { rows } = await appPool().query(`
                SELECT a.audi_status, a.audi_data_cadastro, a.audi_detalhes,
                       u.usua_nome, u.usua_login
                FROM audi_log_auditoria a
                JOIN usua_usuario u ON u.usua_codigo = a.audi_usua_codigo
                WHERE LOWER(COALESCE(u.usua_login, '')) = 'mcp_claude'
                  AND a.audi_recurso = 'busca-personalizada'
                ORDER BY a.audi_data_cadastro DESC
                LIMIT $1`, [limit]);
            return json(res, 200, { ok: true, entries: rows.map(r => {
                let details = r.audi_detalhes || {};
                if (typeof details === 'string') {
                    try { details = JSON.parse(details); } catch { details = {}; }
                }
                return { status: r.audi_status, at: r.audi_data_cadastro, userName: r.usua_nome || r.usua_login, details };
            }) });
        }

        if (req.method === 'GET' && u.pathname === '/api/dashboard') {
            if (authOn) requirePermission(session, 'dashboard.view');
            const clients = await readClients();
            return json(res, 200, {
                ok: true,
                total: clients.length,
                enabled: clients.filter(c => c.enabled).length,
                disabled: clients.filter(c => !c.enabled).length,
                withError: clients.filter(c => c.lastError).length,
                batch: cfg.concurrency
            });
        }
        if (req.method === 'GET' && u.pathname === '/api/clients') {
            if (authOn) requirePermission(session, 'clients.view');
            return json(res, 200, {
                ok: true,
                clients: (await readClients()).map(clientDto)
            });
        }
        if (u.pathname === '/api/vpns' || u.pathname.startsWith('/api/vpns/')) {
            const parts = u.pathname.split('/').filter(Boolean); // api, vpns, nome, acao
            const nome = parts[2];
            const acao = parts[3];
            if (nome && !/^[a-z0-9][a-z0-9_-]{0,40}$/.test(nome)) throw new HttpError(400, 'Nome de VPN inválido.');
            if (req.method === 'GET' && !nome) {
                if (authOn) requirePermission(session, 'config.view');
                const r = await vpnAgent('GET', '/vpns', 40000);
                return json(res, r.status, r.data);
            }
            if (req.method === 'GET' && nome && acao === 'log') {
                if (authOn) requirePermission(session, 'config.view');
                const r = await vpnAgent('GET', `/vpns/${nome}/log`, 20000);
                return json(res, r.status, r.data);
            }
            if (req.method === 'POST' && nome && ['up', 'down', 'restart'].includes(acao)) {
                if (authOn) requirePermission(session, 'connections.manage');
                const r = await vpnAgent('POST', `/vpns/${nome}/${acao}`);
                if (authOn) await authLib.recordAudit(appPool(), {
                    userId: session.user.id,
                    action: { up: 'LIGAR', down: 'DESLIGAR', restart: 'REINICIAR' }[acao],
                    resource: 'vpn', resourceId: nome, ip: req.socket.remoteAddress,
                    status: r.data && r.data.ok ? undefined : 'FALHA',
                    details: { rc: r.data && r.data.rc }, event: 'VPN.' + acao.toUpperCase()
                }).catch(() => {});
                return json(res, r.status, r.data);
            }
            if (req.method === 'PUT' && nome && acao === 'config') {
                if (authOn) requirePermission(session, 'connections.manage');
                const b = await parseBody(req);
                const payload = {};
                if (typeof b.manter === 'boolean') payload.manter = b.manter;
                if (Object.prototype.hasOwnProperty.call(b, 'depende')) payload.depende = b.depende || null;
                const r = await vpnAgent('POST', `/vpns/${nome}/config`, 20000, payload);
                if (authOn) await authLib.recordAudit(appPool(), {
                    userId: session.user.id, action: 'CONFIGURAR', resource: 'vpn', resourceId: nome,
                    ip: req.socket.remoteAddress, status: r.data && r.data.ok ? undefined : 'FALHA',
                    details: payload, event: 'VPN.CONFIG'
                }).catch(() => {});
                return json(res, r.status, r.data);
            }
            throw new HttpError(404, 'Rota de VPN inexistente.');
        }
        if (req.method === 'GET' && u.pathname === '/api/credentials') {
            if (authOn) requirePermission(session, 'clients.manage');
            const groups = await configStore.ensureGroupsForClients();
            return json(res, 200, {
                ok: true,
                groups: await Promise.all(groups.map(g => groupDto(g)))
            });
        }
        if (req.method === 'GET' && u.pathname === '/api/external-config') {
            if (authOn) requirePermission(session, 'config.view');
            return json(res, 200, {
                ok: true,
                ...externalDto(parseEnv())
            });
        }
        if (req.method === 'GET' && u.pathname === '/api/custom-queries') {
            if (authOn) requirePermission(session, 'consulta.view');
            return json(res, 200, {
                ok: true,
                queries: await configStore.listCustomQueries()
            });
        }
        if (req.method === 'GET' && u.pathname === '/api/logs') {
            if (authOn) requirePermission(session, 'logs.view');
            const files = fs.existsSync(LOG_DIR) ? fs.readdirSync(LOG_DIR).filter(file => /^coleta-\d{4}-\d{2}-\d{2}\.log$/.test(file)).sort().reverse() : [];
            const lines = [];
            for (const file of files) {
                const content = fs.readFileSync(path.join(LOG_DIR, file), 'utf8').split(/\r?\n/).filter(Boolean).reverse();
                lines.push(...content.map(line => `[${file}] ${line}`));
                if (lines.length >= 1000) break;
            }
            return json(res, 200, { ok: true, files, lines: lines.slice(0, 1000).reverse() });
        }
        if (req.method === 'DELETE' && u.pathname === '/api/logs') {
            if (authOn) requirePermission(session, 'logs.manage');
            // escopo: ARQUIVOS (logs/*.log), AUDITORIA (trilha do Dashboard) ou TUDO.
            // Antes so apagava os arquivos, entao a "Atividade recente" do Dashboard
            // continuava cheia mesmo depois de "Limpar Logs" - era o que o usuario via.
            const escopo = ['ARQUIVOS', 'AUDITORIA', 'TUDO'].includes(String(u.searchParams.get('escopo') || '').toUpperCase())
                ? String(u.searchParams.get('escopo')).toUpperCase()
                : 'ARQUIVOS';
            let arquivos = 0;
            let auditoria = 0;
            if (escopo === 'ARQUIVOS' || escopo === 'TUDO') {
                const files = fs.existsSync(LOG_DIR) ? fs.readdirSync(LOG_DIR).filter(file => /^coleta-\d{4}-\d{2}-\d{2}\.log$/.test(file)) : [];
                for (const file of files) fs.unlinkSync(path.join(LOG_DIR, file));
                arquivos = files.length;
            }
            if ((escopo === 'AUDITORIA' || escopo === 'TUDO') && appDbConfigured()) {
                const { rowCount } = await appPool().query('DELETE FROM audi_log_auditoria');
                auditoria = rowCount || 0;
            }
            // Gravado DEPOIS da limpeza, entao continua visivel como prova de quem limpou.
            if (authOn) await authLib.recordAudit(appPool(), { userId: session.user.id, action: 'LIMPAR', resource: 'logs', resourceId: null, ip: req.socket.remoteAddress, details: { escopo, arquivos, auditoria }, event: 'LOG.LIMPAR' });
            return json(res, 200, { ok: true, escopo, removidos: arquivos, arquivos, auditoria });
        }

        if (req.method === 'GET' && u.pathname === '/api/log-config') {
            if (authOn) requirePermission(session, 'logs.view');
            return json(res, 200, { ok: true, eventos: await logConfig.listConfig() });
        }
        if (req.method === 'PUT' && u.pathname === '/api/log-config') {
            if (authOn) requirePermission(session, 'logs.manage');
            const b = await parseBody(req);
            const antes = await logConfig.listConfig();
            const estadoAntes = Object.fromEntries(antes.map(e => [e.chave, e.ativo]));
            const result = await logConfig.saveConfig(b.eventos || {}, authOn ? session.user.id : null);
            const ligados = [];
            const desligados = [];
            for (const [chave, ativo] of Object.entries(b.eventos || {})) {
                if (estadoAntes[chave] === undefined || estadoAntes[chave] === !!ativo) continue;
                (ativo ? ligados : desligados).push(chave);
            }
            if (authOn && (ligados.length || desligados.length)) {
                await authLib.recordAudit(appPool(), { userId: session.user.id, action: 'CONFIGURAR', resource: 'logs', resourceId: null, ip: req.socket.remoteAddress, details: { ligados, desligados }, event: 'LOG.CONFIGURAR' });
            }
            return json(res, 200, { ok: true, ...result, eventos: await logConfig.listConfig() });
        }

        if (req.method === 'POST' && u.pathname === '/api/query') {
            if (authOn) requirePermission(session, 'query.execute');
            const b = await parseBody(req);
            const { clients, skipped } = await selectedClients(b.clientIds || [b.clientId]);
            const range = periodRange(b.period, b);
            const quem = authOn ? session.user.login : 'local';
            fileLog(`CONSULTA MANUAL por ${quem}: ${clients.map(c => c.name).join(', ')} [${range.mode} ${range.start}..${range.end}]`, 'INFO', 'CONSULTA.INICIO');
            const results = await runInBatches(clients, cfg.concurrency, async c => {
                try {
                    const collected = await collectForClient(c, range);
                    if (!collected.ok) await disableClientAfterFailure(c, collected.error);
                    return {
                        client: c,
                        rows: collected.rows,
                        ok: collected.ok,
                        error: collected.error
                    };
                } catch (error) {
                    return {
                        client: c,
                        rows: [],
                        ok: false,
                        error: error.message
                    };
                }
            });
            const flattened = results.flatMap(({
                client,
                rows
            }) => rows.map(r => ({
                ...r,
                cliente: client.name
            })));
            const aggregated = aggregateRows(flattened);
            fileLog(`CONSULTA MANUAL concluída: ${results.filter(x => x.ok).length} ok, ${results.filter(x => !x.ok).length} falha(s)`, 'INFO', 'CONSULTA.FIM');
            return json(res, 200, {
                ok: true,
                period: range.period,
                mode: range.mode,
                start: range.start,
                end: range.end,
                endInclusive: range.endInclusive,
                clients: results.map(x => ({
                    id: x.client.id,
                    name: x.client.name,
                    ok: x.ok,
                    error: x.error || null
                })),
                failedClients: results.filter(x => !x.ok).map(x => ({
                    id: x.client.id,
                    name: x.client.name,
                    error: x.error
                })),
                rows: aggregated,
                totals: totals(aggregated),
                skippedClients: skippedDto(skipped),
                attendance: { configured: attendanceConfigured() },
                byClient: results.map(({
                    client,
                    rows,
                    ok,
                    error
                }) => ({
                    client: {
                        id: client.id,
                        name: client.name
                    },
                    ok,
                    error: error || null,
                    rows
                }))
            });
        }

        if (req.method === 'POST' && u.pathname === '/api/export') {
            if (authOn) requirePermission(session, 'export.execute');
            const b = await parseBody(req);
            const { clients, skipped } = await selectedClients(b.clientIds || [b.clientId]);
            const range = periodRange(b.period, b);
            const quemExp = authOn ? session.user.login : 'local';
            const mode = b.exportMode === 'SEPARADO' ? 'SEPARADO' : 'JUNTO';
            const detailLevel = b.detailLevel === 'NORMAL' ? 'NORMAL' : 'DETALHADA';
            fileLog(`EXPORTAÇÃO por ${quemExp}: ${clients.map(c => c.name).join(', ')} [${range.mode} ${range.start}..${range.end}] (${mode}/${detailLevel})`, 'INFO', 'EXPORTACAO.EXECUTAR');
            const results = await runInBatches(clients, cfg.concurrency, async c => {
                try {
                    const collected = await collectForClient(c, range);
                    if (!collected.ok) await disableClientAfterFailure(c, collected.error);
                    return {
                        client: c,
                        rows: collected.rows,
                        ok: collected.ok,
                        error: collected.error
                    };
                } catch (error) {
                    return {
                        client: c,
                        rows: [],
                        ok: false,
                        error: error.message
                    };
                }
            });
            const rows = aggregateRows(results.flatMap(({
                client,
                rows
            }) => rows.map(r => ({
                ...r,
                cliente: client.name
            }))));
            const file = await exportWorkbook(results, clients, range, mode, detailLevel);
            res.writeHead(200, {
                'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'Content-Disposition': `attachment; filename="coleta_${range.start}_${range.end}_${mode.toLowerCase()}_${detailLevel.toLowerCase()}.xlsx"`,
                'Content-Length': file.length,
                'X-Skipped-Clients': encodeURIComponent(JSON.stringify(skippedDto(skipped))),
                'Access-Control-Expose-Headers': 'X-Skipped-Clients'
            });
            return res.end(file);
        }

        if (req.method === 'POST' && u.pathname === '/api/external-config') {
            if (authOn) requirePermission(session, 'connections.manage');
            const b = await parseBody(req);
            const type = String(b.type || '').toUpperCase();
            if (!['ATENDIMENTOS','CENTRAL'].includes(type)) throw new Error('Tipo de conexão inválido.');
            const prefix = `${type}_DB_`;
            const enabled = !!b.enabled;
            const host = String(b.host || '').trim();
            const database = String(b.database || '').trim();
            const user = String(b.user || '').trim();
            const port = Number(b.port || 5432);
            if (enabled) {
                if (!host || !database || !user) throw new Error(`Informe host, banco e usuário para ${type === 'ATENDIMENTOS' ? 'atendimentos' : 'central'}.`);
                if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Porta PostgreSQL inválida.');
            }
            const values = {
                [`${prefix}ENABLED`]: enabled ? 'true' : 'false',
                [`${prefix}HOST`]: host,
                [`${prefix}PORT`]: String(port),
                [`${prefix}NAME`]: database,
                [`${prefix}USER`]: user,
                [`${prefix}SSL`]: b.ssl ? 'true' : 'false'
            };
            if (b.password) values[`${prefix}PASSWORD`] = String(b.password);
            writeEnv(values);
            Object.assign(process.env, values);
            return json(res, 200, { ok: true, ...externalDto(parseEnv()) });
        }

        if (req.method === 'POST' && u.pathname === '/api/test-external-config') {
            if (authOn) requirePermission(session, 'connections.manage');
            const b = await parseBody(req);
            const type = String(b.type || '').toUpperCase();
            if (!['ATENDIMENTOS', 'CENTRAL'].includes(type)) throw new Error('Tipo de conexão inválido.');
            const prefix = `${type}_DB_`;
            const env = parseEnv();
            const host = String(b.host || '').trim();
            const database = String(b.database || '').trim();
            const user = String(b.user || '').trim();
            const port = Number(b.port || 5432);
            const password = String(b.password || env[`${prefix}PASSWORD`] || '');
            if (!host || !database || !user || !password) throw new Error('Informe host, banco, usuário e senha para testar a conexão.');
            if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Porta PostgreSQL inválida.');
            const client = new Client({ host, port, database, user, password, ssl: !!b.ssl, connectionTimeoutMillis: cfg.connectionTimeout, query_timeout: cfg.queryTimeout });
            try {
                await client.connect();
                await client.query('SELECT 1');
                return json(res, 200, { ok: true, message: `Conexão com ${type === 'ATENDIMENTOS' ? 'banco de atendimentos' : 'banco central'} realizada com sucesso.` });
            } finally {
                await client.end().catch(() => {});
            }
        }

        if (req.method === 'POST' && u.pathname === '/api/custom-query') {
            if (authOn) requirePermission(session, 'query.custom');
            const b = await parseBody(req);
            const source = String(b.source || 'CLIENTES').toUpperCase();
            if (!['CLIENTES', 'ATENDIMENTOS', 'CENTRAL'].includes(source)) throw new Error('Origem inválida.');
            const sql = isSafeSelect(b.sql, Boolean(b.usesPeriod));
            const range = b.usesPeriod ? periodRange(b.period, b) : null;
            const params = b.usesPeriod ? [range.start, range.end] : [];
            const queryName = String(b.name || 'Busca personalizada').trim();
            const category = String(b.category || 'PERSONALIZADA').trim();
            const description = String(b.description || '').trim();
            const outputs = [];
            let skippedClients = [];

            if (source === 'CLIENTES') {
                const { clients, skipped } = await selectedClients(b.clientIds || []);
                skippedClients = skippedDto(skipped);
                for (const c of clients) {
                    let h;
                    try {
                        h = await require('../backend/db').openClient(c);
                        const result = await querySomenteLeitura(h.client, sql, params);
                        outputs.push({
                            ...normalizeCustomRows(result.rows, c.name, queryName, category, description),
                            clientId: c.id,
                            clientName: c.name,
                            ok: true
                        });
                    } catch (error) {
                        outputs.push({
                            columns: [],
                            rows: [],
                            source: c.name,
                            query: queryName,
                            category,
                            description,
                            clientId: c.id,
                            clientName: c.name,
                            ok: false,
                            error: formatError(error.message)
                        });
                    } finally {
                        if (h) {
                            await h.client.end().catch(() => {});
                            if (h.tunnel) await h.tunnel.close().catch(() => {});
                        }
                    }
                }
            } else {
                const client = await openExternalSource(source);
                try {
                    const result = await client.query(sql, params);
                    outputs.push({
                        ...normalizeCustomRows(result.rows, source === 'ATENDIMENTOS' ? 'Banco de atendimentos' : 'Banco central do coletor', queryName, category, description),
                        ok: true
                    });
                } finally {
                    await client.end().catch(() => {});
                }
            }

            if (b.save) {
                await configStore.addCustomQuery({
                    name: queryName,
                    category,
                    description,
                    sql,
                    usesPeriod: Boolean(b.usesPeriod),
                    source
                });
            }
            const failed = outputs.filter(x => x.ok === false);
            // Trilha de auditoria da busca personalizada: registra quem rodou, o SQL
            // e quais clientes foram atingidos. Necessario para as consultas vindas do
            // MCP coletor-trafegus, que antes nao deixavam rastro. Nunca derruba a resposta.
            if (authOn) {
                await authLib.recordAudit(appPool(), {
                    userId: session.user.id,
                    action: 'CONSULTAR',
                    resource: 'busca-personalizada',
                    resourceId: null,
                    status: (failed.length && outputs.every(x => x.ok === false)) ? 'FALHA' : 'OK',
                    ip: req.socket.remoteAddress,
                    details: {
                        source,
                        nome: queryName,
                        categoria: category,
                        sql,
                        clientes: outputs.map(x => ({ id: x.clientId, nome: x.clientName, ok: x.ok, linhas: (x.rows || []).length })),
                        falhas: failed.map(x => ({ nome: x.clientName || x.source, erro: x.error }))
                    },
                    event: 'CONSULTA.PERSONALIZADA'
                }).catch(() => {});
            }
            if (failed.length && outputs.every(x => x.ok === false)) return json(res, 200, {
                ok: true,
                source,
                custom: true,
                failed: true,
                errors: failed.map(x => ({
                    name: x.clientName || x.source,
                    error: x.error
                })),
                results: outputs,
                skippedClients
            });
            return json(res, 200, {
                ok: true,
                source,
                custom: true,
                failed: failed.length > 0,
                errors: failed.map(x => ({
                    name: x.clientName || x.source,
                    error: x.error
                })),
                results: outputs,
                skippedClients
            });
        }
        if (req.method === 'DELETE' && u.pathname.startsWith('/api/custom-query/')) {
            if (authOn) requirePermission(session, 'query.custom');
            const id = u.pathname.split('/').pop();
            await configStore.deleteCustomQuery(id);
            return json(res, 200, {
                ok: true
            });
        }

        if (req.method === 'POST' && u.pathname === '/api/config/client/test') {
            if (authOn) requirePermission(session, 'clients.manage');
            const b = await parseBody(req);
            if (!String(b.host || '').trim() || !String(b.database || '').trim()) throw new Error('Host e banco são obrigatórios para testar.');
            const port = Number(b.port);
            if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Porta PostgreSQL inválida.');
            const group = b.credentialGroup ? String(b.credentialGroup).toUpperCase() : '';
            if (!group && !String(b.dbUser || '').trim() && !b.id) throw new Error('Selecione um grupo de credencial ou informe usuário/senha próprios para testar.');
            const sshGroup = b.sshCredentialGroup ? String(b.sshCredentialGroup).toUpperCase() : '';
            const testModel = {
                id: b.id || null,
                name: String(b.name || 'Teste').trim(),
                db: {
                    host: String(b.host).trim(), port, database: String(b.database).trim(), credentialGroup: group,
                    user: String(b.dbUser || '').trim(), password: String(b.dbPassword || '')
                },
                ssh: {
                    enabled: !!b.sshEnabled,
                    host: String(b.sshHost || '').trim(),
                    port: Number(b.sshPort || 22),
                    credentialGroup: sshGroup,
                    user: String(b.sshUser || '').trim(),
                    password: String(b.sshPassword || ''),
                    key: b.sshKey ? normalizeSshKey(b.sshKey, b.sshKeyPassphrase) : '',
                    dbHost: String(b.sshDbHost || '').trim(),
                    dbPort: Number(b.sshDbPort || port)
                }
            };
            let h;
            try {
                h = await require('../backend/db').openClient(testModel);
                await h.client.query('SELECT 1');
                if (b.id) await configStore.clearClientError(b.id);
                return json(res, 200, { ok: true, message: `Conexão com "${testModel.name}" realizada com sucesso.` });
            } catch (error) {
                throw new Error(formatError(error.message));
            } finally {
                if (h) {
                    await h.client.end().catch(() => {});
                    if (h.tunnel) await h.tunnel.close().catch(() => {});
                }
            }
        }

        if (req.method === 'POST' && u.pathname === '/api/config/client') {
            if (authOn) requirePermission(session, 'clients.manage');
            const b = await parseBody(req);
            if (!String(b.name || '').trim()) throw new Error('Nome do cliente é obrigatório.');
            if (!String(b.host || '').trim() || !String(b.database || '').trim()) throw new Error('Host e banco são obrigatórios.');
            const port = Number(b.port);
            if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Porta PostgreSQL inválida.');
            const group = b.credentialGroup ? String(b.credentialGroup).toUpperCase() : '';
            if (!group && !String(b.dbUser || '').trim() && !b.id) throw new Error('Selecione um grupo de credencial ou informe usuário/senha próprios do banco.');
            if (group) {
                const existingGroups = await configStore.ensureGroupsForClients();
                if (!existingGroups.some(g => g.id === group)) await configStore.upsertGroup({ id: group, name: group });
            }
            const sshGroup = b.sshCredentialGroup ? String(b.sshCredentialGroup).toUpperCase() : '';
            const model = {
                id: b.id || null,
                name: String(b.name).trim(),
                enabled: !!b.enabled,
                reason: '',
                attendanceName: String(b.attendanceName || b.name || '').trim(),
                db: {
                    host: String(b.host).trim(),
                    port,
                    database: String(b.database).trim(),
                    credentialGroup: group,
                    user: String(b.dbUser || '').trim(),
                    password: String(b.dbPassword || '')
                },
                ssh: {
                    enabled: !!b.sshEnabled,
                    host: String(b.sshHost || '').trim(),
                    port: Number(b.sshPort || 22),
                    credentialGroup: sshGroup,
                    user: String(b.sshUser || '').trim(),
                    password: String(b.sshPassword || ''),
                    key: b.sshKey ? normalizeSshKey(b.sshKey, b.sshKeyPassphrase) : '',
                    dbHost: String(b.sshDbHost || '').trim(),
                    dbPort: Number(b.sshDbPort || port)
                }
            };
            await configStore.upsertClient(model);
            return json(res, 200, {
                ok: true,
                clients: (await readClients()).map(clientDto)
            });
        }
        if (req.method === 'DELETE' && u.pathname.startsWith('/api/config/client/')) {
            if (authOn) requirePermission(session, 'clients.manage');
            const id = u.pathname.split('/').pop();
            await configStore.deleteClient(id);
            return json(res, 200, {
                ok: true
            });
        }
        if (req.method === 'POST' && u.pathname === '/api/config/credentials') {
            if (authOn) requirePermission(session, 'clients.manage');
            const b = await parseBody(req);
            // Aceita o arquivo de chave em qualquer formato comum (.ppk do
            // PuTTY ou OpenSSH/PEM ja pronto) e normaliza sozinho.
            const sshKey = b.sshKey ? normalizeSshKey(b.sshKey, b.sshKeyPassphrase) : b.sshKey;
            await configStore.upsertGroup({
                id: b.id || b.group,
                name: b.name,
                user: b.user,
                password: b.password,
                sshUser: b.sshUser,
                sshPassword: b.sshPassword,
                sshKey
            });
            return json(res, 200, {
                ok: true
            });
        }
        if (req.method === 'DELETE' && u.pathname.startsWith('/api/config/credentials/')) {
            if (authOn) requirePermission(session, 'clients.manage');
            const id = decodeURIComponent(u.pathname.slice('/api/config/credentials/'.length)).toUpperCase();
            await configStore.deleteGroup(id);
            return json(res, 200, {
                ok: true
            });
        }

        const pathname = u.pathname;
        const file = path.join(ROOT, pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, ''));
        if (!file.startsWith(ROOT) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return send(res, 404, 'text/plain; charset=utf-8', 'Not found');
        return send(res, 200, MIME[path.extname(file)] || 'application/octet-stream', fs.readFileSync(file));
    } catch (error) {
        console.error(error);
        return json(res, error.status || 500, {
            ok: false,
            error: error.message
        });
    }
});
// Carrega a configuracao de logs antes de aceitar requisicoes, para a
// primeira linha gravada ja respeitar o que o gestor escolheu.
logConfig.primeCache().finally(() => {
    server.listen(PORT, '0.0.0.0', () => console.log(`Interface: http://localhost:${PORT}`));
});
