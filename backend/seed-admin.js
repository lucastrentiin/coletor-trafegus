// Cria o primeiro usuario administrador (perfil GESTOR) quando o banco
// de aplicacao ainda nao tem nenhum usuario. Nao faz nada se ja existir
// pelo menos um usuario, entao e seguro rodar mais de uma vez.
require('dotenv').config({ path: require('path').join(__dirname, '..', 'config', 'credentials.env') });
const { appPool, appDbConfigured } = require('./appdb');
const { hashPassword, randomTempPassword } = require('./crypto-util');

async function main() {
    if (!appDbConfigured()) {
        console.error('APP_DB_* nao configurado em config/credentials.env.');
        process.exitCode = 1;
        return;
    }
    const pool = appPool();
    const { rows } = await pool.query('SELECT count(*)::int AS total FROM usua_usuario');
    if (rows[0].total > 0) {
        console.log('Ja existem usuarios cadastrados neste banco. Nenhum usuario novo foi criado.');
        await pool.end();
        return;
    }
    const login = process.env.SEED_ADMIN_LOGIN || 'admin';
    const email = process.env.SEED_ADMIN_EMAIL || '';
    const displayName = process.env.SEED_ADMIN_NAME || 'Administrador';
    const tempPassword = randomTempPassword();

    const { rows: created } = await pool.query(
        `INSERT INTO usua_usuario(usua_login, usua_nome, usua_email, usua_senha_hash, usua_trocar_senha)
         VALUES ($1,$2,$3,$4,true) RETURNING usua_codigo`,
        [login, displayName, email || null, hashPassword(tempPassword)]
    );
    await pool.query(
        `INSERT INTO usup_usuario_perfil(usup_usua_codigo, usup_perf_codigo)
         SELECT $1, perf_codigo FROM perf_perfil WHERE perf_sigla = 'GESTOR'`,
        [created[0].usua_codigo]
    );

    console.log('Usuário administrador criado com sucesso.');
    console.log(`Login: ${login}`);
    console.log(`Senha temporária (anote agora, só aparece aqui): ${tempPassword}`);
    console.log('Essa senha precisa ser trocada no primeiro acesso.');
    await pool.end();
}

main().catch(error => {
    console.error('Falha ao criar usuário administrador:', error.message);
    process.exitCode = 1;
});
