const { hashPassword, verifyPassword, randomToken, sha256 } = require('./crypto-util');

const SESSION_HOURS = 12;
const COOKIE_NAME = 'trafegus_session';
// Troca de senha e exigida quando o usuario e criado/resetado
// (usua_trocar_senha) OU quando a senha atual ja passou desse prazo -
// nunca a cada login.
const PASSWORD_MAX_AGE_DAYS = 30;

async function findUserByLogin(pool, login) {
    const { rows } = await pool.query(
        'SELECT * FROM usua_usuario WHERE lower(usua_login) = lower($1) OR lower(usua_email) = lower($1) LIMIT 1',
        [login]
    );
    return rows[0] || null;
}

async function permissionsForUser(pool, userId) {
    const { rows } = await pool.query(
        'SELECT DISTINCT perm_sigla FROM vw_permissoes_usuario WHERE usua_codigo = $1',
        [userId]
    );
    return rows.map(r => r.perm_sigla);
}

async function profilesForUser(pool, userId) {
    const { rows } = await pool.query(
        `SELECT p.perf_codigo AS id, p.perf_sigla AS code, p.perf_nome AS name FROM usup_usuario_perfil up
         JOIN perf_perfil p ON p.perf_codigo = up.usup_perf_codigo
         WHERE up.usup_usua_codigo = $1`,
        [userId]
    );
    return rows;
}

async function login(pool, loginOrEmail, password, meta = {}) {
    const user = await findUserByLogin(pool, loginOrEmail);
    if (!user || !user.usua_ativo) throw new Error('Usuário ou senha inválidos.');
    if (!verifyPassword(password, user.usua_senha_hash)) throw new Error('Usuário ou senha inválidos.');

    const token = randomToken();
    const tokenHash = sha256(token);
    const expiresAt = new Date(Date.now() + SESSION_HOURS * 3600 * 1000);
    await pool.query(
        `INSERT INTO sess_sessao(sess_usua_codigo, sess_token_hash, sess_data_expiracao, sess_ip, sess_navegador)
         VALUES ($1,$2,$3,$4,$5)`,
        [user.usua_codigo, tokenHash, expiresAt, meta.ip || null, meta.userAgent || null]
    );
    await pool.query('UPDATE usua_usuario SET usua_ultimo_acesso = now() WHERE usua_codigo = $1', [user.usua_codigo]);

    const permissions = await permissionsForUser(pool, user.usua_codigo);
    const profiles = await profilesForUser(pool, user.usua_codigo);
    return {
        token,
        expiresAt,
        user: userDto(user),
        profiles,
        permissions
    };
}

async function logout(pool, token) {
    if (!token) return;
    await pool.query('UPDATE sess_sessao SET sess_data_revogacao = now() WHERE sess_token_hash = $1 AND sess_data_revogacao IS NULL', [sha256(token)]);
}

async function sessionFromToken(pool, token) {
    if (!token) return null;
    const { rows } = await pool.query(
        `SELECT s.*, u.usua_codigo AS u_codigo, u.usua_login, u.usua_nome, u.usua_email, u.usua_ativo, u.usua_trocar_senha, u.usua_senha_alterada_em
         FROM sess_sessao s
         JOIN usua_usuario u ON u.usua_codigo = s.sess_usua_codigo
         WHERE s.sess_token_hash = $1 AND s.sess_data_revogacao IS NULL AND s.sess_data_expiracao > now()`,
        [sha256(token)]
    );
    const row = rows[0];
    if (!row || !row.usua_ativo) return null;
    const user = {
        usua_codigo: row.u_codigo,
        usua_login: row.usua_login,
        usua_nome: row.usua_nome,
        usua_email: row.usua_email,
        usua_trocar_senha: row.usua_trocar_senha,
        usua_senha_alterada_em: row.usua_senha_alterada_em
    };
    const permissions = await permissionsForUser(pool, user.usua_codigo);
    const profiles = await profilesForUser(pool, user.usua_codigo);
    return { user: userDto(user), permissions, profiles };
}

async function changePassword(pool, userId, newPassword) {
    await pool.query(
        'UPDATE usua_usuario SET usua_senha_hash = $2, usua_trocar_senha = false, usua_senha_alterada_em = now() WHERE usua_codigo = $1',
        [userId, hashPassword(newPassword)]
    );
}

function passwordExpired(u) {
    if (!u.usua_senha_alterada_em) return false;
    const ageDays = (Date.now() - new Date(u.usua_senha_alterada_em).getTime()) / 86400000;
    return ageDays >= PASSWORD_MAX_AGE_DAYS;
}

function userDto(u) {
    return {
        id: u.usua_codigo,
        login: u.usua_login,
        displayName: u.usua_nome,
        email: u.usua_email || '',
        mustChangePassword: !!u.usua_trocar_senha || passwordExpired(u)
    };
}

// Grava uma linha na tabela audi_log_auditoria. Nunca deve derrubar a
// requisicao que a chamou - se o log falhar, so registra no console.
async function recordAudit(pool, { userId = null, action, resource, resourceId = null, status = 'OK', ip = null, details = {}, event = null }) {
    if (!pool) return;
    // `event` e a chave do catalogo (backend/log-events.js). Se o gestor
    // desligou esse evento na tela Logs -> Configurar, nao grava a linha.
    if (event && !require('./log-config').isEnabledSync(event)) return;
    try {
        await pool.query(
            `INSERT INTO audi_log_auditoria(audi_usua_codigo, audi_acao, audi_recurso, audi_recurso_codigo, audi_status, audi_ip, audi_detalhes)
             VALUES ($1,$2,$3,$4,$5,$6,$7)`,
            [userId, action, resource, resourceId ? String(resourceId) : null, status, ip, JSON.stringify(details || {})]
        );
    } catch (error) {
        console.error('Falha ao gravar log de auditoria:', error.message);
    }
}

function hasPermission(session, code) {
    return !!session && Array.isArray(session.permissions) && session.permissions.includes(code);
}

function parseCookies(req) {
    const header = req.headers.cookie || '';
    const out = {};
    header.split(';').forEach(part => {
        const i = part.indexOf('=');
        if (i < 0) return;
        out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
    });
    return out;
}

function sessionCookieHeader(token, maxAgeSeconds) {
    const attrs = [`${COOKIE_NAME}=${encodeURIComponent(token)}`, 'HttpOnly', 'Path=/', 'SameSite=Lax'];
    if (maxAgeSeconds != null) attrs.push(`Max-Age=${maxAgeSeconds}`);
    if (String(process.env.COOKIE_SECURE || '').toLowerCase() === 'true') attrs.push('Secure');
    return attrs.join('; ');
}

function clearCookieHeader() {
    return `${COOKIE_NAME}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`;
}

module.exports = {
    COOKIE_NAME,
    SESSION_HOURS,
    login,
    logout,
    sessionFromToken,
    changePassword,
    hasPermission,
    parseCookies,
    sessionCookieHeader,
    clearCookieHeader,
    findUserByLogin,
    permissionsForUser,
    profilesForUser,
    recordAudit
};
