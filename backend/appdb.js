const { Pool } = require('pg');
const cfg = require('./config');

let pool = null;

function appDbConfigured() {
    return Boolean(cfg.appDb.host && cfg.appDb.database && cfg.appDb.user && cfg.appDb.password);
}

// Um unico pool para toda a aplicacao. Funciona tanto para o Supabase
// de teste quanto para o PostgreSQL de producao: so muda o que esta em
// APP_DB_* no config/credentials.env, o codigo e o mesmo.
function appPool() {
    if (!appDbConfigured()) return null;
    if (!pool) {
        pool = new Pool({
            host: cfg.appDb.host,
            port: cfg.appDb.port,
            database: cfg.appDb.database,
            user: cfg.appDb.user,
            password: cfg.appDb.password,
            ssl: cfg.appDb.ssl ? { rejectUnauthorized: false } : false,
            max: 10,
            connectionTimeoutMillis: cfg.connectionTimeout
        });
    }
    return pool;
}

module.exports = { appPool, appDbConfigured };
