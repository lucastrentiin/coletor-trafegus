// Camada de persistencia de configuracao (clientes, grupos de
// credenciais, buscas personalizadas). Quando APP_DB_* esta
// configurado, tudo isso vive no banco (tabelas clie_cliente,
// cred_grupo_credencial, alia_cliente_alias, busc_busca_personalizada)
// com senhas/chaves criptografadas. Sem APP_DB_*, continua 100% em
// arquivo (config/clients.json, config/credential-groups.json,
// config/credentials.env, config/custom-queries.json) como sempre foi.
// Por pedido explicito do cliente, senha/usuario/chave de banco e SSH
// ficam em texto puro no banco (colunas TEXT), sem criptografia -
// facilita conferir/editar direto pelo DBeaver.
//
// O formato dos objetos devolvidos e IDENTICO nos dois modos, entao o
// resto da aplicacao (web/server.js) nao precisa saber qual dos dois
// esta em uso.
const fs = require('fs');
const path = require('path');
const { appPool, appDbConfigured } = require('./appdb');

const CONFIG_DIR = path.join(__dirname, '..', 'config');
const CLIENTS_FILE = path.join(CONFIG_DIR, 'clients.json');
const GROUPS_FILE = path.join(CONFIG_DIR, 'credential-groups.json');
const ENV_FILE = path.join(CONFIG_DIR, 'credentials.env');
const CUSTOM_FILE = path.join(CONFIG_DIR, 'custom-queries.json');

function dbMode() { return appDbConfigured(); }

function readJson(file, fallback) {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
}
function atomicWrite(file, content) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, content, 'utf8');
    fs.renameSync(tmp, file);
}

// ================= CLIENTES (clie_cliente / alia_cliente_alias) =================

function fileListClients() {
    return readJson(CLIENTS_FILE, { version: 1, clients: [] }).clients || [];
}
function fileWriteClients(clients) {
    atomicWrite(CLIENTS_FILE, JSON.stringify({ version: 1, clients }, null, 2) + '\n');
}

function clientRowToModel(row) {
    return {
        id: row.clie_codigo,
        name: row.clie_nome,
        enabled: row.clie_ativo,
        reason: row.clie_ultimo_erro || '',
        attendanceName: (row.aliases && row.aliases[0]) || row.clie_nome,
        attendanceAliases: row.aliases || [],
        db: {
            host: row.clie_banco_host || '',
            port: row.clie_banco_porta,
            database: row.clie_banco_nome || '',
            credentialGroup: row.cred_sigla || '',
            hasOwnCredential: !!row.clie_banco_usuario,
            ownUser: row.clie_banco_usuario || ''
        },
        ssh: {
            enabled: row.clie_ssh_ativo,
            host: row.clie_ssh_host || '',
            port: row.clie_ssh_porta,
            credentialGroup: row.ssh_cred_sigla || '',
            hasOwnCredential: !!(row.clie_ssh_usuario || row.clie_ssh_chave),
            ownUser: row.clie_ssh_usuario || '',
            hasOwnKey: !!row.clie_ssh_chave,
            dbHost: row.clie_ssh_banco_host || '',
            dbPort: row.clie_ssh_banco_porta || row.clie_banco_porta
        },
        lastError: row.clie_ultimo_erro || '',
        lastErrorAt: row.clie_ultimo_erro_data ? new Date(row.clie_ultimo_erro_data).toISOString() : ''
    };
}

async function dbListClients() {
    const pool = appPool();
    const { rows } = await pool.query(`
        SELECT c.*, cg.cred_sigla AS cred_sigla, sg.cred_sigla AS ssh_cred_sigla,
               COALESCE(array_agg(a.alia_nome_atendimento) FILTER (WHERE a.alia_nome_atendimento IS NOT NULL), '{}') AS aliases
        FROM clie_cliente c
        LEFT JOIN cred_grupo_credencial cg ON cg.cred_codigo = c.clie_cred_codigo
        LEFT JOIN cred_grupo_credencial sg ON sg.cred_codigo = c.clie_ssh_cred_codigo
        LEFT JOIN alia_cliente_alias a ON a.alia_clie_codigo = c.clie_codigo AND a.alia_ativo
        GROUP BY c.clie_codigo, cg.cred_sigla, sg.cred_sigla
        ORDER BY c.clie_nome`);
    return rows.map(clientRowToModel);
}

async function resolveGroupId(pool, code) {
    if (!code) return null;
    const { rows } = await pool.query('SELECT cred_codigo FROM cred_grupo_credencial WHERE cred_sigla = $1', [String(code).toUpperCase()]);
    return rows[0]?.cred_codigo || null;
}

// Segredos reais (texto puro) para abrir conexao com UM cliente
// especifico: usa a credencial propria do cliente quando cadastrada,
// senao cai para o grupo de credencial vinculado. Uso interno apenas
// (backend/db.js) - nunca exposto pela API.
async function getClientCredentials(clientId) {
    const pool = appPool();
    const { rows } = await pool.query(`
        SELECT c.clie_banco_usuario, c.clie_banco_senha,
               c.clie_ssh_usuario, c.clie_ssh_senha, c.clie_ssh_chave,
               cg.cred_sigla AS cred_sigla, sg.cred_sigla AS ssh_cred_sigla
        FROM clie_cliente c
        LEFT JOIN cred_grupo_credencial cg ON cg.cred_codigo = c.clie_cred_codigo
        LEFT JOIN cred_grupo_credencial sg ON sg.cred_codigo = c.clie_ssh_cred_codigo
        WHERE c.clie_codigo = $1`, [clientId]);
    const row = rows[0];
    if (!row) throw new Error('Cliente não encontrado.');

    const db = row.clie_banco_usuario
        ? { user: row.clie_banco_usuario, password: row.clie_banco_senha || '' }
        : await getGroupSecrets(row.cred_sigla).then(s => ({ user: s.dbUser, password: s.dbPassword }));

    const ssh = (row.clie_ssh_usuario || row.clie_ssh_chave)
        ? { user: row.clie_ssh_usuario || '', password: row.clie_ssh_senha || '', key: row.clie_ssh_chave || '' }
        : await getGroupSecrets(row.ssh_cred_sigla).then(s => ({ user: s.sshUser, password: s.sshPassword, key: s.sshKey }));

    return { db, ssh };
}

async function listClients() {
    return dbMode() ? dbListClients() : fileListClients();
}

async function upsertClient(model) {
    if (!dbMode()) {
        const clients = fileListClients();
        if (model.id) {
            const i = clients.findIndex(c => String(c.id) === String(model.id));
            if (i < 0) throw new Error('Cliente não encontrado.');
            model.reason = clients[i].reason || '';
            model.lastError = clients[i].lastError || '';
            model.lastErrorAt = clients[i].lastErrorAt || '';
            clients[i] = model;
        } else {
            model.id = Math.max(0, ...clients.map(c => Number(c.id) || 0)) + 1;
            clients.push(model);
        }
        fileWriteClients(clients);
        return model;
    }

    const pool = appPool();
    // Grupo de credencial agora e OPCIONAL: se o cadastro trouxer
    // usuario/senha proprios (sem grupo selecionado), a credencial fica
    // direto nas colunas do cliente e clie_cred_codigo vira NULL. Senha
    // vazia num UPDATE mantem a senha ja salva (mesmo padrao usado no
    // grupo de credencial) - por isso o CASE/EXCLUDED abaixo, e nao um
    // SET incondicional.
    const dbOwnMode = !model.db.credentialGroup && !!(model.db.user || model.db.password);
    const sshOwnMode = !model.ssh?.credentialGroup && !!(model.ssh?.user || model.ssh?.password || model.ssh?.key);
    const credentialGroupId = dbOwnMode ? null : await resolveGroupId(pool, model.db.credentialGroup);
    const sshCredentialGroupId = sshOwnMode ? null : await resolveGroupId(pool, model.ssh?.credentialGroup);
    let id = model.id;
    if (!id) {
        const { rows } = await pool.query('SELECT COALESCE(MAX(clie_codigo),0)+1 AS next FROM clie_cliente');
        id = rows[0].next;
    }
    await pool.query(`
        INSERT INTO clie_cliente(clie_codigo, clie_nome, clie_ativo, clie_banco_host, clie_banco_porta, clie_banco_nome, clie_cred_codigo,
            clie_banco_usuario, clie_banco_senha,
            clie_ssh_ativo, clie_ssh_host, clie_ssh_porta, clie_ssh_cred_codigo,
            clie_ssh_usuario, clie_ssh_senha, clie_ssh_chave,
            clie_ssh_banco_host, clie_ssh_banco_porta)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
        ON CONFLICT (clie_codigo) DO UPDATE SET
            clie_nome=EXCLUDED.clie_nome, clie_ativo=EXCLUDED.clie_ativo, clie_banco_host=EXCLUDED.clie_banco_host,
            clie_banco_porta=EXCLUDED.clie_banco_porta, clie_banco_nome=EXCLUDED.clie_banco_nome,
            clie_cred_codigo=EXCLUDED.clie_cred_codigo,
            clie_banco_usuario=EXCLUDED.clie_banco_usuario,
            clie_banco_senha=CASE WHEN NOT $19 THEN NULL WHEN EXCLUDED.clie_banco_senha <> '' THEN EXCLUDED.clie_banco_senha ELSE clie_cliente.clie_banco_senha END,
            clie_ssh_ativo=EXCLUDED.clie_ssh_ativo,
            clie_ssh_host=EXCLUDED.clie_ssh_host, clie_ssh_porta=EXCLUDED.clie_ssh_porta,
            clie_ssh_cred_codigo=EXCLUDED.clie_ssh_cred_codigo,
            clie_ssh_usuario=EXCLUDED.clie_ssh_usuario,
            clie_ssh_senha=CASE WHEN NOT $20 THEN NULL WHEN EXCLUDED.clie_ssh_senha <> '' THEN EXCLUDED.clie_ssh_senha ELSE clie_cliente.clie_ssh_senha END,
            clie_ssh_chave=CASE WHEN NOT $20 THEN NULL WHEN EXCLUDED.clie_ssh_chave <> '' THEN EXCLUDED.clie_ssh_chave ELSE clie_cliente.clie_ssh_chave END,
            clie_ssh_banco_host=EXCLUDED.clie_ssh_banco_host,
            clie_ssh_banco_porta=EXCLUDED.clie_ssh_banco_porta, clie_data_alteracao=now()`,
        [id, model.name, !!model.enabled, model.db.host, model.db.port, model.db.database, credentialGroupId,
         dbOwnMode ? (model.db.user || null) : null, dbOwnMode ? (model.db.password || '') : '',
         !!model.ssh?.enabled, model.ssh?.host || null, model.ssh?.port || 22, sshCredentialGroupId,
         sshOwnMode ? (model.ssh?.user || null) : null, sshOwnMode ? (model.ssh?.password || '') : '', sshOwnMode ? (model.ssh?.key || '') : '',
         model.ssh?.dbHost || null, model.ssh?.dbPort || model.db.port,
         dbOwnMode, sshOwnMode]
    );
    await pool.query('DELETE FROM alia_cliente_alias WHERE alia_clie_codigo = $1', [id]);
    if (model.attendanceName && model.attendanceName !== model.name) {
        await pool.query('INSERT INTO alia_cliente_alias(alia_clie_codigo, alia_nome_atendimento) VALUES ($1,$2) ON CONFLICT DO NOTHING', [id, model.attendanceName]);
    }
    model.id = id;
    return model;
}

async function markClientFailure(id, formattedError) {
    if (!dbMode()) {
        const clients = fileListClients();
        const target = clients.find(c => String(c.id) === String(id));
        if (!target) return;
        target.enabled = false;
        target.lastError = formattedError;
        target.lastErrorAt = new Date().toISOString();
        fileWriteClients(clients);
        return;
    }
    await appPool().query('UPDATE clie_cliente SET clie_ativo=false, clie_ultimo_erro=$2, clie_ultimo_erro_data=now() WHERE clie_codigo=$1', [id, formattedError]);
}

// Limpa o erro registrado (ex.: depois de um teste de conexao com sucesso).
async function clearClientError(id) {
    if (!dbMode()) {
        const clients = fileListClients();
        const target = clients.find(c => String(c.id) === String(id));
        if (!target) return;
        target.lastError = '';
        target.lastErrorAt = '';
        fileWriteClients(clients);
        return;
    }
    await appPool().query('UPDATE clie_cliente SET clie_ultimo_erro=NULL, clie_ultimo_erro_data=NULL WHERE clie_codigo=$1', [id]);
}

async function deleteClient(id) {
    if (!dbMode()) {
        const clients = fileListClients();
        const i = clients.findIndex(c => String(c.id) === String(id));
        if (i < 0) throw new Error('Cliente não encontrado.');
        clients.splice(i, 1);
        fileWriteClients(clients);
        return;
    }
    await appPool().query('DELETE FROM clie_cliente WHERE clie_codigo = $1', [id]);
}

// ================= GRUPOS DE CREDENCIAIS (cred_grupo_credencial) =================

function normalizeGroupCode(raw) {
    const id = String(raw || '').trim().toUpperCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^A-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');
    if (!id) throw new Error('Informe um identificador para o grupo.');
    return id.startsWith('GRUPO_') ? id : `GRUPO_${id}`;
}

function fileReadGroups() { return readJson(GROUPS_FILE, { groups: [] }).groups || []; }
function fileWriteGroups(groups) { atomicWrite(GROUPS_FILE, JSON.stringify({ groups }, null, 2) + '\n'); }
function fileParseEnv() {
    const out = {};
    if (!fs.existsSync(ENV_FILE)) return out;
    for (const line of fs.readFileSync(ENV_FILE, 'utf8').split(/\r?\n/)) {
        if (!line.trim() || line.trim().startsWith('#') || !line.includes('=')) continue;
        const i = line.indexOf('=');
        out[line.slice(0, i).trim()] = line.slice(i + 1);
    }
    return out;
}
function fileWriteEnv(values) {
    let text = fs.existsSync(ENV_FILE) ? fs.readFileSync(ENV_FILE, 'utf8') : '';
    const lines = text.split(/\r?\n/);
    const seen = new Set();
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line || line.trim().startsWith('#') || !line.includes('=')) continue;
        const key = line.slice(0, line.indexOf('=')).trim();
        if (Object.prototype.hasOwnProperty.call(values, key)) { lines[i] = `${key}=${values[key] ?? ''}`; seen.add(key); }
    }
    for (const [key, value] of Object.entries(values)) if (!seen.has(key)) lines.push(`${key}=${value ?? ''}`);
    atomicWrite(ENV_FILE, lines.join('\n').replace(/\n+$/, '') + '\n');
}

async function ensureGroupsForClients() {
    const groups = await listGroups();
    const clients = await listClients();
    const ids = new Set(groups.map(g => g.id));
    const missing = [...new Set(clients.map(c => c.db?.credentialGroup).filter(id => id && !ids.has(id)))];
    for (const id of missing) await upsertGroup({ id, name: id });
    return missing.length ? listGroups() : groups;
}

async function listGroups() {
    if (!dbMode()) return fileReadGroups();
    const { rows } = await appPool().query('SELECT cred_codigo, cred_sigla, cred_nome, cred_numero FROM cred_grupo_credencial ORDER BY cred_numero NULLS LAST');
    return rows.map(r => ({ id: r.cred_sigla, name: r.cred_nome, number: r.cred_numero, _dbId: r.cred_codigo }));
}

async function groupDetail(code) {
    if (!dbMode()) {
        const env = fileParseEnv();
        return {
            id: code,
            user: env[`DB_${code}_USER`] || '',
            hasPassword: !!env[`DB_${code}_PASSWORD`],
            sshUser: env[`SSH_${code}_USER`] || '',
            hasSshPassword: !!env[`SSH_${code}_PASSWORD`],
            hasSshKey: !!env[`SSH_${code}_PRIVATE_KEY`]
        };
    }
    const { rows } = await appPool().query('SELECT * FROM cred_grupo_credencial WHERE cred_sigla = $1', [code]);
    const g = rows[0];
    if (!g) return { id: code, user: '', hasPassword: false, sshUser: '', hasSshPassword: false, hasSshKey: false };
    return {
        id: g.cred_sigla,
        number: g.cred_numero,
        user: g.cred_banco_usuario || '',
        hasPassword: !!g.cred_banco_senha,
        sshUser: g.cred_ssh_usuario || '',
        hasSshPassword: !!g.cred_ssh_senha,
        hasSshKey: !!g.cred_ssh_chave
    };
}

// Segredos em texto puro, usados SOMENTE internamente para abrir
// conexoes reais (nunca expostos pela API).
async function getGroupSecrets(code) {
    const g = String(code || 'GRUPO_1').toUpperCase();
    if (!dbMode()) {
        const env = fileParseEnv();
        return {
            dbUser: env[`DB_${g}_USER`] ?? process.env[`DB_${g}_USER`] ?? '',
            dbPassword: env[`DB_${g}_PASSWORD`] ?? process.env[`DB_${g}_PASSWORD`] ?? '',
            sshUser: env[`SSH_${g}_USER`] ?? process.env[`SSH_${g}_USER`] ?? '',
            sshPassword: env[`SSH_${g}_PASSWORD`] ?? process.env[`SSH_${g}_PASSWORD`] ?? '',
            sshKey: env[`SSH_${g}_PRIVATE_KEY`] ?? process.env[`SSH_${g}_PRIVATE_KEY`] ?? ''
        };
    }
    const { rows } = await appPool().query('SELECT * FROM cred_grupo_credencial WHERE cred_sigla = $1', [g]);
    const row = rows[0];
    if (!row) return { dbUser: '', dbPassword: '', sshUser: '', sshPassword: '', sshKey: '' };
    return {
        dbUser: row.cred_banco_usuario || '',
        dbPassword: row.cred_banco_senha || '',
        sshUser: row.cred_ssh_usuario || '',
        sshPassword: row.cred_ssh_senha || '',
        sshKey: row.cred_ssh_chave || ''
    };
}

async function upsertGroup({ id, name, user, password, sshUser, sshPassword, sshKey }) {
    const code = normalizeGroupCode(id);
    const displayName = String(name || code).trim() || code;
    if (!dbMode()) {
        const values = {};
        values[`DB_${code}_USER`] = String(user ?? '');
        if (password) values[`DB_${code}_PASSWORD`] = String(password);
        values[`SSH_${code}_USER`] = String(sshUser ?? '');
        if (sshPassword) values[`SSH_${code}_PASSWORD`] = String(sshPassword);
        if (sshKey !== undefined) values[`SSH_${code}_PRIVATE_KEY`] = String(sshKey);
        fileWriteEnv(values);
        const groups = fileReadGroups();
        const i = groups.findIndex(g => g.id === code);
        if (i >= 0) groups[i] = { id: code, name: displayName }; else groups.push({ id: code, name: displayName });
        fileWriteGroups(groups);
        return { id: code, name: displayName };
    }

    const pool = appPool();
    // Numero sequencial so e atribuido na CRIACAO (nao entra no "sets"
    // do UPDATE, entao um grupo ja existente nunca troca de numero).
    const { rows: numRows } = await pool.query('SELECT COALESCE(MAX(cred_numero),0)+1 AS next FROM cred_grupo_credencial');
    const nextNumber = numRows[0].next;

    // Uma unica fonte de verdade para colunas/valores/parametros - antes
    // "sets" (para o UPDATE) e a lista de valores do INSERT eram montadas
    // separadamente com numeracao propria, e so batiam por coincidencia
    // quando TODOS os campos vinham juntos. Editar so parte dos campos
    // (o caso normal pela tela) gravava valor errado ou trocado de coluna.
    const columns = ['cred_sigla', 'cred_nome', 'cred_numero'];
    const values = [code, displayName, nextNumber];
    const sets = ['cred_nome=$2'];
    function addField(column, value) {
        columns.push(column);
        values.push(value);
        sets.push(`${column}=$${values.length}`);
    }
    if (user !== undefined) addField('cred_banco_usuario', user || null);
    if (password) addField('cred_banco_senha', password);
    if (sshUser !== undefined) addField('cred_ssh_usuario', sshUser || null);
    if (sshPassword) addField('cred_ssh_senha', sshPassword);
    if (sshKey) addField('cred_ssh_chave', sshKey);

    await pool.query(
        `INSERT INTO cred_grupo_credencial(${columns.join(', ')})
         VALUES (${values.map((_, idx) => '$' + (idx + 1)).join(', ')})
         ON CONFLICT (cred_sigla) DO UPDATE SET ${sets.join(', ')}, cred_data_alteracao=now()`,
        values
    );
    return { id: code, name: displayName };
}

async function groupUsageCount(code) {
    const clients = await listClients();
    return clients.filter(c => (c.db?.credentialGroup || '') === code || (c.ssh?.credentialGroup || '') === code).length;
}

async function deleteGroup(code) {
    if (await groupUsageCount(code) > 0) throw new Error('O grupo ainda está sendo usado por clientes.');
    if (!dbMode()) {
        fileWriteGroups(fileReadGroups().filter(g => g.id !== code));
        return;
    }
    await appPool().query('DELETE FROM cred_grupo_credencial WHERE cred_sigla = $1', [code]);
}

// ================= BUSCAS PERSONALIZADAS (busc_busca_personalizada) =================

function fileReadCustom() { return readJson(CUSTOM_FILE, { queries: [] }).queries || []; }
function fileWriteCustom(queries) { atomicWrite(CUSTOM_FILE, JSON.stringify({ version: 1, queries }, null, 2) + '\n'); }

async function listCustomQueries() {
    if (!dbMode()) return fileReadCustom();
    const { rows } = await appPool().query('SELECT * FROM busc_busca_personalizada WHERE busc_ativo ORDER BY busc_data_cadastro DESC');
    return rows.map(r => ({
        id: r.busc_codigo, name: r.busc_nome, category: r.busc_categoria, description: r.busc_descricao || '',
        sql: r.busc_sql, usesPeriod: r.busc_usa_periodo, source: r.busc_origem, createdAt: r.busc_data_cadastro
    }));
}

async function addCustomQuery(q) {
    if (!dbMode()) {
        const qs = fileReadCustom();
        const id = qs.length ? Math.max(...qs.map(x => Number(x.id) || 0)) + 1 : 1;
        qs.push({ id, ...q, createdAt: new Date().toISOString() });
        fileWriteCustom(qs);
        return id;
    }
    const { rows } = await appPool().query(
        `INSERT INTO busc_busca_personalizada(busc_nome, busc_categoria, busc_descricao, busc_origem, busc_sql, busc_usa_periodo) VALUES ($1,$2,$3,$4,$5,$6) RETURNING busc_codigo`,
        [q.name, q.category, q.description || null, q.source, q.sql, !!q.usesPeriod]
    );
    return rows[0].busc_codigo;
}

async function deleteCustomQuery(id) {
    if (!dbMode()) {
        fileWriteCustom(fileReadCustom().filter(q => String(q.id) !== String(id)));
        return;
    }
    await appPool().query('DELETE FROM busc_busca_personalizada WHERE busc_codigo = $1', [id]);
}

module.exports = {
    dbMode,
    listClients, upsertClient, deleteClient, markClientFailure, clearClientError, getClientCredentials,
    listGroups, groupDetail, getGroupSecrets, upsertGroup, deleteGroup, groupUsageCount, ensureGroupsForClients, normalizeGroupCode,
    listCustomQueries, addCustomQuery, deleteCustomQuery
};
