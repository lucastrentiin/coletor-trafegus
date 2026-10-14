// Copia a configuracao que hoje vive em arquivo (config/clients.json,
// config/credential-groups.json, os segredos DB_*/SSH_* de
// config/credentials.env e config/custom-queries.json) para o banco de
// aplicacao (APP_DB_*), criptografando senhas e chaves SSH no caminho.
// So funciona com APP_DB_* ja configurado - e o mesmo banco que
// server.js passa a usar depois de rodar isto.
require('dotenv').config({ path: require('path').join(__dirname, '..', 'config', 'credentials.env') });
const fs = require('fs');
const path = require('path');
const { appDbConfigured } = require('./appdb');
const configStore = require('./config-store');

const CONFIG_DIR = path.join(__dirname, '..', 'config');

function readJson(file, fallback) {
    const full = path.join(CONFIG_DIR, file);
    if (!fs.existsSync(full)) return fallback;
    return JSON.parse(fs.readFileSync(full, 'utf8'));
}
function readEnv() {
    const file = path.join(CONFIG_DIR, 'credentials.env');
    const out = {};
    if (!fs.existsSync(file)) return out;
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
        if (!line.trim() || line.trim().startsWith('#') || !line.includes('=')) continue;
        const i = line.indexOf('=');
        out[line.slice(0, i).trim()] = line.slice(i + 1);
    }
    return out;
}

async function main() {
    if (!appDbConfigured()) {
        console.error('APP_DB_* nao configurado em config/credentials.env. Configure antes de migrar.');
        process.exitCode = 1;
        return;
    }
    if (!configStore.dbMode()) {
        console.error('config-store nao detectou modo banco - confira APP_DB_*.');
        process.exitCode = 1;
        return;
    }

    const env = readEnv();
    const groupIds = new Set();
    const clientsFile = readJson('clients.json', { clients: [] }).clients || [];
    const groupsFile = readJson('credential-groups.json', { groups: [] }).groups || [];
    for (const g of groupsFile) groupIds.add(String(g.id).toUpperCase());
    for (const c of clientsFile) {
        if (c.db?.credentialGroup) groupIds.add(String(c.db.credentialGroup).toUpperCase());
        if (c.ssh?.credentialGroup) groupIds.add(String(c.ssh.credentialGroup).toUpperCase());
    }

    console.log(`Migrando ${groupIds.size} grupo(s) de credenciais...`);
    for (const id of groupIds) {
        const known = groupsFile.find(g => String(g.id).toUpperCase() === id);
        await configStore.upsertGroup({
            id,
            name: known?.name || id,
            user: env[`DB_${id}_USER`] || '',
            password: env[`DB_${id}_PASSWORD`] || undefined,
            sshUser: env[`SSH_${id}_USER`] || '',
            sshPassword: env[`SSH_${id}_PASSWORD`] || undefined,
            sshKey: env[`SSH_${id}_PRIVATE_KEY`] || undefined
        });
    }

    console.log(`Migrando ${clientsFile.length} cliente(s)...`);
    const incomplete = [];
    for (const c of clientsFile) {
        if (!c.db?.host || !c.db?.port || !c.db?.database) {
            incomplete.push(c.name);
            continue;
        }
        await configStore.upsertClient({
            id: c.id,
            name: c.name,
            enabled: !!c.enabled,
            attendanceName: c.attendanceName || c.name,
            db: c.db,
            ssh: c.ssh
        });
    }
    if (incomplete.length) {
        console.log(`Pulados (cadastro incompleto - host/porta/banco faltando): ${incomplete.join(', ')}`);
        console.log('Complete esses clientes depois, direto na tela Configuração do sistema.');
    }

    const customFile = readJson('custom-queries.json', { queries: [] }).queries || [];
    console.log(`Migrando ${customFile.length} busca(s) personalizada(s)...`);
    for (const q of customFile) {
        await configStore.addCustomQuery({
            name: q.name, category: q.category, description: q.description,
            sql: q.sql, usesPeriod: q.usesPeriod, source: q.source
        });
    }

    console.log('Migração concluída.');
    process.exit(0);
}

main().catch(error => {
    console.error('Falha na migração:', error.message);
    process.exitCode = 1;
});
