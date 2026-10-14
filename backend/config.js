require('dotenv').config({
    path: require('path').join(__dirname, '..', 'config', 'credentials.env')
});

function bool(v, d = false) {
    if (v === undefined || v === '') return d;
    return ['true', '1', 's', 'sim', 'yes'].includes(String(v).toLowerCase());
}
module.exports = {
    targetDate: process.env.TARGET_DATE || '',
    // Quantos clientes sao coletados ao mesmo tempo. A coleta passa quase todo
    // o tempo esperando resposta dos bancos remotos, entao vale manter varios
    // em voo. Medido com os 44 clientes reais (julho/2026): 5 -> 247s, 12 -> 62s,
    // 20 -> 48s, 28 -> 53s (piora por contencao). 20 e o melhor ponto.
    concurrency: Number(process.env.CONCURRENCY || 20),
    // Teto de coletas simultaneas no MESMO servidor. As portas dos clientes sao
    // diferentes, mas varios compartilham a mesma maquina fisica (ha IPs com
    // mais de 10 bases). Sem esse teto, a concorrencia global inteira poderia
    // cair sobre um unico servidor e derrubar o banco do cliente.
    // Medido com os 44 clientes reais: sem teto 48s, teto 8 -> 48s, teto 6 -> 50s,
    // teto 4 -> 64s. O 6 custa so 4% e corta pela metade o pico num servidor so.
    concurrencyPerHost: Number(process.env.CONCURRENCY_PER_HOST || 6),
    maxRetries: Number(process.env.MAX_RETRIES || 3),
    htmlOnly: bool(process.env.HTML_ONLY, true),
    central: {
        host: process.env.CENTRAL_DB_HOST,
        port: Number(process.env.CENTRAL_DB_PORT || 5432),
        database: process.env.CENTRAL_DB_NAME,
        user: process.env.CENTRAL_DB_USER,
        password: process.env.CENTRAL_DB_PASSWORD,
        ssl: bool(process.env.CENTRAL_DB_SSL)
    },
    atendimentos: {
        host: process.env.ATENDIMENTOS_DB_HOST,
        port: Number(process.env.ATENDIMENTOS_DB_PORT || 5432),
        database: process.env.ATENDIMENTOS_DB_NAME,
        user: process.env.ATENDIMENTOS_DB_USER,
        password: process.env.ATENDIMENTOS_DB_PASSWORD,
        ssl: bool(process.env.ATENDIMENTOS_DB_SSL)
    },
    appDb: {
        host: process.env.APP_DB_HOST || '',
        port: Number(process.env.APP_DB_PORT || 5432),
        database: process.env.APP_DB_NAME || '',
        user: process.env.APP_DB_USER || '',
        password: process.env.APP_DB_PASSWORD || '',
        ssl: bool(process.env.APP_DB_SSL, true)
    },
    encryptionKey: process.env.APP_ENCRYPTION_KEY || '',
    connectionTimeout: Number(process.env.DB_CONNECTION_TIMEOUT || 15000),
    queryTimeout: Number(process.env.DB_QUERY_TIMEOUT || 60000),
    webPort: Number(process.env.WEB_PORT || 3000)
};