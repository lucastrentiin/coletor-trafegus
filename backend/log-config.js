// Configuracao de quais eventos do sistema sao registrados em log.
//
// Segue o mesmo padrao dual do config-store: com APP_DB_* configurado a
// escolha vive na tabela logc_configuracao_log; sem APP_DB_* fica em
// config/log-config.json. O formato devolvido e identico nos dois modos.
//
// Os eventos sao consultados a cada linha de log gravada, entao o estado
// fica em cache na memoria por CACHE_MS. Qualquer gravacao invalida o
// cache na hora, para o efeito ser imediato para quem salvou.
const fs = require('fs');
const path = require('path');
const { appPool, appDbConfigured } = require('./appdb');
const { LOG_EVENTS, getEvent, defaultEnabled } = require('./log-events');

const CONFIG_DIR = path.join(__dirname, '..', 'config');
const CONFIG_FILE = path.join(CONFIG_DIR, 'log-config.json');
const CACHE_MS = 15000;

let cache = null;
let cacheAt = 0;

function dbMode() { return appDbConfigured(); }

function invalidateCache() {
    cache = null;
    cacheAt = 0;
}

function fileRead() {
    if (!fs.existsSync(CONFIG_FILE)) return {};
    try {
        return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')).events || {};
    } catch {
        return {};
    }
}

function fileWrite(map) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
    const tmp = `${CONFIG_FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ version: 1, events: map }, null, 2) + '\n', 'utf8');
    fs.renameSync(tmp, CONFIG_FILE);
}

// Devolve { chave: boolean } apenas com o que foi explicitamente salvo.
// Eventos ausentes caem no padrao definido no catalogo.
async function readOverrides() {
    if (!dbMode()) return fileRead();
    const { rows } = await appPool().query('SELECT logc_codigo, logc_ativo FROM logc_configuracao_log');
    const map = {};
    for (const row of rows) map[row.logc_codigo] = row.logc_ativo;
    return map;
}

async function getStateMap() {
    const now = Date.now();
    if (cache && now - cacheAt < CACHE_MS) return cache;
    let overrides = {};
    try {
        overrides = await readOverrides();
    } catch (error) {
        // Se a tabela ainda nao existe ou o banco esta fora, nao derruba a
        // aplicacao: cai no padrao do catalogo (tudo essencial ligado).
        console.error('Falha ao ler configuracao de logs, usando padroes:', error.message);
    }
    const state = {};
    for (const event of LOG_EVENTS) {
        state[event.chave] = Object.prototype.hasOwnProperty.call(overrides, event.chave)
            ? !!overrides[event.chave]
            : event.padrao;
    }
    cache = state;
    cacheAt = now;
    return state;
}

// Consulta usada pelos pontos de log. Nunca lanca excecao: se algo der
// errado, deixa o evento passar (melhor um log a mais que perder rastro).
async function isEnabled(chave) {
    if (!chave) return true;
    if (!getEvent(chave)) return true;
    try {
        const state = await getStateMap();
        return state[chave] !== false;
    } catch {
        return defaultEnabled(chave);
    }
}

// Versao sincrona, para os pontos de log que nao podem virar async
// (backend/logger.js roda dentro de fluxos sincronos). Usa o ultimo estado
// conhecido; se estiver vencido, dispara a atualizacao em segundo plano e
// responde com o que tem em maos neste instante.
let refreshing = false;
function refreshInBackground() {
    if (refreshing) return;
    refreshing = true;
    getStateMap()
        .catch(() => {})
        .finally(() => { refreshing = false; });
}

function isEnabledSync(chave) {
    if (!chave) return true;
    if (!getEvent(chave)) return true;
    if (!cache || Date.now() - cacheAt >= CACHE_MS) refreshInBackground();
    if (!cache) return defaultEnabled(chave);
    return cache[chave] !== false;
}

// Carrega o estado uma vez na subida do processo, para a primeira linha de
// log ja respeitar a configuracao salva em vez de cair no padrao.
function primeCache() {
    return getStateMap().catch(() => {});
}

// Catalogo + estado atual, para a tela de configuracao.
async function listConfig() {
    const state = await getStateMap();
    return LOG_EVENTS.map(event => ({
        chave: event.chave,
        grupo: event.grupo,
        rotulo: event.rotulo,
        descricao: event.descricao,
        destino: event.destino,
        padrao: event.padrao,
        ativo: state[event.chave] !== false
    }));
}

// Grava as escolhas. `updates` e um objeto { chave: boolean }.
// Chaves desconhecidas sao ignoradas (protege contra payload adulterado).
async function saveConfig(updates, userId = null) {
    const valid = {};
    for (const [chave, ativo] of Object.entries(updates || {})) {
        if (getEvent(chave)) valid[chave] = !!ativo;
    }
    if (!Object.keys(valid).length) return { alterados: 0 };

    if (!dbMode()) {
        const map = fileRead();
        Object.assign(map, valid);
        fileWrite(map);
        invalidateCache();
        return { alterados: Object.keys(valid).length };
    }

    const pool = appPool();
    for (const [chave, ativo] of Object.entries(valid)) {
        await pool.query(
            `INSERT INTO logc_configuracao_log(logc_codigo, logc_ativo, logc_usua_codigo)
             VALUES ($1,$2,$3)
             ON CONFLICT (logc_codigo) DO UPDATE SET
                logc_ativo = EXCLUDED.logc_ativo,
                logc_usua_codigo = EXCLUDED.logc_usua_codigo,
                logc_data_alteracao = now()`,
            [chave, ativo, userId]
        );
    }
    invalidateCache();
    return { alterados: Object.keys(valid).length };
}

module.exports = { isEnabled, isEnabledSync, primeCache, listConfig, saveConfig, invalidateCache };
