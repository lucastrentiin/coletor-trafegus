// "Esqueci minha senha", na pratica: o sistema nao tem servidor de
// e-mail configurado, entao a recuperacao e feita por quem tem acesso
// ao servidor (ou por um Gestor, pela tela Usuarios). Uso:
//   node backend/reset-password.js <login>
require('dotenv').config({ path: require('path').join(__dirname, '..', 'config', 'credentials.env') });
const { appPool, appDbConfigured } = require('./appdb');
const { hashPassword, randomTempPassword } = require('./crypto-util');

async function main() {
    const login = process.argv[2];
    if (!login) {
        console.error('Uso: node backend/reset-password.js <login>');
        process.exitCode = 1;
        return;
    }
    if (!appDbConfigured()) {
        console.error('APP_DB_* nao configurado em config/credentials.env.');
        process.exitCode = 1;
        return;
    }
    const pool = appPool();
    const { rows } = await pool.query('SELECT usua_codigo, usua_login FROM usua_usuario WHERE lower(usua_login) = lower($1) OR lower(usua_email) = lower($1)', [login]);
    if (!rows.length) {
        console.error(`Nenhum usuário encontrado para "${login}".`);
        process.exitCode = 1;
        await pool.end();
        return;
    }
    const tempPassword = randomTempPassword();
    await pool.query('UPDATE usua_usuario SET usua_senha_hash=$2, usua_trocar_senha=true WHERE usua_codigo=$1', [rows[0].usua_codigo, hashPassword(tempPassword)]);
    console.log(`Senha de "${rows[0].usua_login}" resetada.`);
    console.log(`Senha temporária (anote agora): ${tempPassword}`);
    await pool.end();
}

main().catch(error => {
    console.error('Falha ao resetar senha:', error.message);
    process.exitCode = 1;
});
