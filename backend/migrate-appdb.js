// Aplica sql/supabase_schema.sql no banco de aplicacao configurado em
// APP_DB_* (config/credentials.env). Funciona tanto para o Supabase de
// teste quanto para o PostgreSQL de producao — e o mesmo schema, so a
// connection string muda.
require('dotenv').config({ path: require('path').join(__dirname, '..', 'config', 'credentials.env') });
const fs = require('fs');
const path = require('path');
const { appPool, appDbConfigured } = require('./appdb');

async function main() {
    if (!appDbConfigured()) {
        console.error('APP_DB_* nao configurado em config/credentials.env. Preencha host/porta/banco/usuario/senha antes de migrar.');
        process.exitCode = 1;
        return;
    }
    const pool = appPool();
    const sql = fs.readFileSync(path.join(__dirname, '..', 'sql', 'supabase_schema.sql'), 'utf8');
    console.log(`Conectando em ${process.env.APP_DB_HOST}:${process.env.APP_DB_PORT}/${process.env.APP_DB_NAME}...`);
    const client = await pool.connect();
    try {
        await client.query(sql);
        console.log('Schema aplicado com sucesso.');
        const { rows } = await client.query('SELECT count(*)::int AS total FROM usua_usuario');
        console.log(`Usuarios existentes no banco: ${rows[0].total}`);
    } finally {
        client.release();
        await pool.end();
    }
}

main().catch(error => {
    console.error('Falha ao aplicar schema:', error.message);
    process.exitCode = 1;
});
