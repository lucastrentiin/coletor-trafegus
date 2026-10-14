const {
    Pool,
    Client
} = require('pg');
const fs = require('fs');
const path = require('path');
const {
    createTunnel
} = require('./ssh');
const cfg = require('./config');
const configStore = require('./config-store');

const ENV_FILE = path.join(__dirname, '..', 'config', 'credentials.env');

function loadCredentialEnv() {
    const out = {};
    if (!fs.existsSync(ENV_FILE)) return out;
    for (const raw of fs.readFileSync(ENV_FILE, 'utf8').split(/\r?\n/)) {
        const line = raw.trim();
        if (!line || line.startsWith('#') || !line.includes('=')) continue;
        const i = line.indexOf('=');
        out[line.slice(0, i).trim()] = line.slice(i + 1);
    }
    return out;
}

// Le a credencial do banco (arquivo ou banco de aplicacao, conforme
// APP_DB_* estiver configurado - ver backend/config-store.js).
async function cred(group) {
    const secrets = await configStore.getGroupSecrets(group);
    return { user: secrets.dbUser, password: secrets.dbPassword };
}

// Em modo arquivo, SSH_<GRUPO>_PRIVATE_KEY guarda um CAMINHO para a
// chave. Em modo banco, o conteudo da chave fica criptografado na
// tabela credential_groups e e devolvido aqui ja decifrado - por isso
// os dois vem em campos diferentes (privateKeyPath vs privateKey).
async function sshCred(group) {
    const secrets = await configStore.getGroupSecrets(group);
    if (configStore.dbMode()) {
        return { user: secrets.sshUser, password: secrets.sshPassword, privateKey: secrets.sshKey || undefined };
    }
    return { user: secrets.sshUser, password: secrets.sshPassword, privateKeyPath: secrets.sshKey || undefined };
}

// Resolve a credencial de banco/SSH para ABRIR a conexao de UM
// cliente. Grupo de credencial agora e opcional, entao a ordem de
// prioridade e: (1) valor ja vindo pronto no proprio objeto do cliente
// (usado pelo formulario de teste, com o que a pessoa acabou de
// digitar, mesmo antes de salvar); (2) credencial propria salva no
// cadastro do cliente (busca por id, ja que listClients() nunca traz
// senha em texto puro); (3) grupo de credencial compartilhado.
async function resolveDbCredential(c) {
    if (c.db.user && c.db.password) return { user: c.db.user, password: c.db.password };
    if (c.id && configStore.dbMode()) {
        const stored = await configStore.getClientCredentials(c.id);
        if (stored.db.user && stored.db.password) return stored.db;
    }
    return cred(c.db.credentialGroup);
}

async function resolveSshCredential(c) {
    if (c.ssh.user && (c.ssh.password || c.ssh.key)) {
        return configStore.dbMode()
            ? { user: c.ssh.user, password: c.ssh.password, privateKey: c.ssh.key || undefined }
            : { user: c.ssh.user, password: c.ssh.password, privateKeyPath: c.ssh.key || undefined };
    }
    if (c.id && configStore.dbMode()) {
        const stored = await configStore.getClientCredentials(c.id);
        if (stored.ssh.user && (stored.ssh.password || stored.ssh.key)) {
            return { user: stored.ssh.user, password: stored.ssh.password, privateKey: stored.ssh.key || undefined };
        }
    }
    return sshCred(c.ssh.credentialGroup);
}

async function openClient(clientCfg) {
    const c = clientCfg;
    const dbCred = await resolveDbCredential(c);
    if (!dbCred.user || !dbCred.password) {
        throw new Error(`${c.name}: credencial DB nao configurada. Verifique o cadastro do cliente ou o grupo de credenciais.`);
    }

    if (c.ssh?.enabled) {
        const sCred = await resolveSshCredential(c);
        if (!sCred.user || (!sCred.password && !sCred.privateKeyPath && !sCred.privateKey)) {
            throw new Error(`${c.name}: credencial SSH nao configurada. Verifique o cadastro do cliente ou o grupo de credenciais.`);
        }
        const tunnel = await createTunnel({
            host: c.ssh.host,
            port: c.ssh.port || 22,
            user: sCred.user,
            password: sCred.password,
            privateKeyPath: sCred.privateKeyPath,
            privateKey: sCred.privateKey,
            dbHost: c.ssh.dbHost || c.db.host,
            dbPort: c.ssh.dbPort || c.db.port
        });
        const client = new Client({
            host: '127.0.0.1',
            port: tunnel.localPort,
            database: c.db.database,
            user: dbCred.user,
            password: dbCred.password,
            connectionTimeoutMillis: cfg.connectionTimeout,
            query_timeout: cfg.queryTimeout
        });
        await client.connect();
        return {
            client,
            tunnel
        };
    }

    const client = new Client({
        host: c.db.host,
        port: c.db.port,
        database: c.db.database,
        user: dbCred.user,
        password: dbCred.password,
        connectionTimeoutMillis: cfg.connectionTimeout,
        query_timeout: cfg.queryTimeout
    });
    await client.connect();
    return {
        client,
        tunnel: null
    };
}

function centralPool() {
    if (cfg.htmlOnly || !cfg.central.host) return null;
    return new Pool({
        ...cfg.central,
        max: 5
    });
}

module.exports = {
    openClient,
    centralPool,
    cred,
    sshCred,
    loadCredentialEnv
};