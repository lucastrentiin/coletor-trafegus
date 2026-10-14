require('dotenv').config({
    path: require('path').join(__dirname, '..', 'config', 'credentials.env')
});
const cfg = require('./config');
const {
    runAll
} = require('./collector');
const {
    centralPool
} = require('./db');
const central = require('./central');
const configStore = require('./config-store');
const report = require('./report');
const {
    log
} = require('./logger');

function dateRef() {
    return cfg.targetDate || new Date(Date.now() - 86400000).toISOString().slice(0, 10)
}
async function main() {
    const clients = (await configStore.listClients()).filter(x => x.enabled);
    if (process.argv.includes('--validate-config')) {
        if (!clients.length) throw Error('Nenhum cliente habilitado.');
        for (const c of clients)
            if (!c.db?.host || !c.db?.database || !c.db?.credentialGroup) throw Error(`${c.name}: configuracao DB incompleta`);
        console.log('OK - clientes habilitados:', clients.length);
        return
    }
    const date = dateRef(),
        period = process.env.PERIODICIDADE || 'DIARIO';
    log(`Inicio data=${date} periodicidade=${period} clientes=${clients.length}`, 'INFO', 'COLETA.INICIO');
    const pool = centralPool();
    if (pool) {
        await central.ensure(pool);
        await central.recoverStale(pool, date)
    }
    const results = await runAll(clients, date, period, async (c, a) => central.start(pool, c, date, period, a), async (id, s, e) => central.finish(pool, id, s, e), m => log(m, 'INFO', 'COLETA.PROGRESSO'));
    if (pool) {
        for (const r of results)
            if (r.ok) await central.save(pool, date, period, r.client, r.rows)
    }
    const file = report.save(date, results);
    log(`Relatorio: ${file}`, 'INFO', 'COLETA.RELATORIO');
    if (pool) await pool.end();
    if (results.some(r => !r.ok)) process.exitCode = 2
}
main().catch(e => {
    log(e.stack || e.message, 'FATAL');
    process.exitCode = 1
});