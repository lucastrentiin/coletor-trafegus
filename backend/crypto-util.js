const crypto = require('crypto');
const cfg = require('./config');

function hashPassword(password) {
    const salt = crypto.randomBytes(16);
    const hash = crypto.scryptSync(String(password), salt, 64);
    return `scrypt:${salt.toString('hex')}:${hash.toString('hex')}`;
}

function verifyPassword(password, stored) {
    const parts = String(stored || '').split(':');
    if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
    const salt = Buffer.from(parts[1], 'hex');
    const hash = Buffer.from(parts[2], 'hex');
    if (!salt.length || !hash.length) return false;
    const test = crypto.scryptSync(String(password), salt, hash.length);
    return hash.length === test.length && crypto.timingSafeEqual(hash, test);
}

function encryptionKeyBuffer() {
    const key = String(cfg.encryptionKey || '');
    if (!/^[0-9a-f]{64}$/i.test(key)) {
        throw new Error('APP_ENCRYPTION_KEY ausente ou invalida em config/credentials.env (precisa ter 64 caracteres hexadecimais).');
    }
    return Buffer.from(key, 'hex');
}

// Retorna null para valores vazios (mantem a coluna BYTEA como NULL em
// vez de criptografar uma string vazia).
function encryptSecret(plainText) {
    if (plainText === null || plainText === undefined || plainText === '') return null;
    const key = encryptionKeyBuffer();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(String(plainText), 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, encrypted]);
}

function decryptSecret(buffer) {
    if (!buffer || !buffer.length) return '';
    const key = encryptionKeyBuffer();
    const iv = buffer.subarray(0, 12);
    const tag = buffer.subarray(12, 28);
    const encrypted = buffer.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

function randomToken(bytes = 32) {
    return crypto.randomBytes(bytes).toString('base64url');
}

function sha256(value) {
    return crypto.createHash('sha256').update(String(value)).digest('hex');
}

// Senha temporaria legivel (sem caracteres ambiguos) para o primeiro
// acesso de um usuario recem-criado.
function randomTempPassword() {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    let out = '';
    const bytes = crypto.randomBytes(14);
    for (let i = 0; i < bytes.length; i++) out += alphabet[bytes[i] % alphabet.length];
    return out;
}

module.exports = {
    hashPassword,
    verifyPassword,
    encryptSecret,
    decryptSecret,
    randomToken,
    sha256,
    randomTempPassword
};
