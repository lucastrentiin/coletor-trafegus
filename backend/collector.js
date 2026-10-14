const fs = require('fs');
const path = require('path');
const { Client, Pool } = require('pg');
const { openClient } = require('./db');
const { q } = require('./sqlmap');
const cfg = require('./config');
const { formatError } = require('./errors');

const PERIODS = { DIARIO: 'DIARIO', MENSAL: 'MENSAL' };
const ATT_SQL_FILE = path.join(__dirname, '..', 'sql', 'atendimentos.sql');

function loadAttendanceQueries() {
    const text = fs.existsSync(ATT_SQL_FILE) ? fs.readFileSync(ATT_SQL_FILE, 'utf8') : '';
    const blocks = {};
    let current = null;
    for (const line of text.split(/\r?\n/)) {
        if (line.startsWith('-- QUERY: ')) {
            current = line.slice(10).trim();
            blocks[current] = [];
            continue;
        }
        if (line.startsWith('-- ENDQUERY')) {
            current = null;
            continue;
        }
        if (current) blocks[current].push(line);
    }
    return blocks;
}

const ATT_QUERIES = loadAttendanceQueries();
function qAtendimento(name) {
    const sql = (ATT_QUERIES[name] || []).join('\n').trim();
    if (!sql) throw new Error(`QUERY de atendimento ausente: ${name}`);
    return sql;
}

function nextDay(date) {
    const d = new Date(`${date}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
}
function nextMonth(date) {
    const d = new Date(`${date}T00:00:00Z`);
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() + 1);
    return d.toISOString().slice(0, 10);
}
function range(date, period, override) {
    if (override?.startDate && override?.endDate) return [override.startDate, override.endDate];
    return period === PERIODS.MENSAL ? [date, nextMonth(date)] : [date, nextDay(date)];
}

async function runQuery(db, name, params) {
    const sql = q(name);
    const noParams = new Set([
        'VIAGENS_TOTAL_SISTEMA', 'VIAGENS_SEM_CANCELADAS_SISTEMA',
        'TERMINAIS_ATIVOS_SISTEMA', 'TERMINAIS_ATIVOS_GR_WS_SISTEMA', 'TERMINAIS_CADASTRADOS_SISTEMA',
        'MENSAL_USUARIOS_TOTAL', 'MENSAL_USUARIOS_CONECTADOS_SISTEMA', 'MENSAL_QUANTIDADE_ACESSOS_SISTEMA',
        'ACESSO_POR_USUARIO_SISTEMA',
        'EVENTOS_TOTAL_SISTEMA', 'EVENTOS_AUTO_SISTEMA', 'EVENTOS_MANUAL_SISTEMA'
    ]);
    // As duas usam so o FIM do periodo como referencia: SM_EM_VIAGEM_NO_FIM_DO_DIA
    // pergunta o que estava em andamento no fechamento; MENSAL_TERMINAIS_FATURAMENTO
    // espera o 1o dia do mes SEGUINTE ao da competencia (ela subtrai 1 mes por
    // dentro), e o fim do periodo pedido (p[1]) ja e exatamente esse dia.
    const oneParam = new Set(['SM_EM_VIAGEM_NO_FIM_DO_DIA', 'MENSAL_TERMINAIS_FATURAMENTO']);
    let values;
    if (noParams.has(name)) values = [];
    else if (oneParam.has(name)) values = [params[1]];
    else values = params;
    return (await db.query(sql, values)).rows;
}

function add(rows, categoria, indicador, evento, quantidade, info = '', escopo = 'PERIODO') {
    rows.push({
        categoria,
        indicador,
        evento: evento || '',
        quantidade: quantidade == null ? 0 : Number(quantidade),
        info,
        escopo
    });
}

// Registra a falha de UM indicador sem interromper a coleta dos demais.
// Sem isso, uma unica consulta com problema (ex.: tabela sem permissao)
// descartava TODOS os indicadores ja coletados do cliente.
function addError(rows, categoria, indicador, message, escopo = 'PERIODO') {
    rows.push({
        categoria,
        indicador,
        evento: 'ERRO_CONSULTA',
        quantidade: null,
        info: formatError(message),
        escopo
    });
}

const INFO = {
    'VIAGENS:TOTAL': 'SISTEMA: total de viagens cadastradas atualmente em viag_viagem, sem filtro de data.',
    'VIAGENS:TOTAL_NAO_CANCELADAS': 'SISTEMA: total de viagens cadastradas no banco que não possuem registro de cancelamento (vest_estatus = 2).',
    'VIAGENS:TOTAL_PERIODO': 'PERÍODO: todas as viagens cuja viag_data_cadastro ocorreu dentro do intervalo escolhido. Início/fim da viagem não interferem nessa contagem.',
    'VIAGENS:SEM_CANCELADAS_PERIODO': 'PERÍODO: viagens cadastradas dentro do intervalo, excluindo as que possuem vest_estatus = 2 para a mesma viagem.',
    'VIAGENS:CADASTRADAS': 'PERÍODO: viagens/SM cadastradas no intervalo pela viag_data_cadastro.',
    'VIAGENS:NAO_CANCELADAS': 'PERÍODO: viagens cadastradas no intervalo que não possuem cancelamento (vest_estatus = 2).',
    'SM:CRIADAS': 'PERÍODO: mesma base de VIAGENS cadastradas; a entidade da SM/viagem é viag_viagem.',
    'SM:INICIADAS': 'PERÍODO: viagens cuja viag_data_inicio aconteceu dentro do intervalo. A viagem pode continuar aberta depois.',
    'SM:CANCELADAS': 'PERÍODO: viagens que receberam vest_estatus = 2 dentro do intervalo; cada viagem é contada uma vez.',
    'SM:EM_VIAGEM_NO_FIM_DO_DIA': 'PERÍODO: viagens já iniciadas e ainda em andamento no instante final do intervalo.',
    'SM:FINALIZADAS_NO_DIA': 'PERÍODO: viagens com viag_data_fim dentro do intervalo.',
    'TERMINAIS:ATIVOS_SISTEMA': 'SISTEMA: conta somente term_terminal com term_ativo = S. Não depende do período escolhido.',
    'TERMINAIS:ATIVOS_GR_WS_SISTEMA': 'SISTEMA: indicador adicional que considera term_ativo = S OU term_ativo_ws = S.',
    'TERMINAIS:ATIVOS_PERIODO': 'PERÍODO: conta terminais que estiveram ativos em algum momento do intervalo, usando os intervalos HETE GR/WS e DISTINCT pelo código.',
    'TERMINAIS:TOTAL_SISTEMA': 'SISTEMA: todos os registros atualmente existentes em term_terminal, independentemente da data de cadastro.',
    'TERMINAIS:CADASTRADOS': 'PERÍODO: terminais cuja term_data_cadastro ocorreu dentro do intervalo.',
    'TERMINAIS:CADASTRADOS_PERIODO': 'PERÍODO: terminais cuja term_data_cadastro ocorreu dentro do intervalo.',
    'TERMINAIS:CADASTRADOS_ATIVOS_PERIODO': 'PERÍODO: terminais cadastrados no intervalo que atualmente estão com term_ativo = S ou term_ativo_ws = S.',
    'TERMINAIS:ATIVADOS_NO_PERIODO': 'PERÍODO: terminais distintos com ativação HETE no intervalo, considerando GR/WS e hete_ativo_inativo = S.',
    'TERMINAIS:INATIVADOS_NO_PERIODO': 'PERÍODO: terminais distintos com encerramento/inativação HETE no intervalo, considerando GR/WS.',
    'TERMINAIS:FATURAMENTO': 'PERÍODO: quantidade de terminais faturados na competência do período pedido (ex.: pedindo julho, calcula julho).',
    'USUARIOS:TOTAL': 'SISTEMA: todos os usuários atualmente existentes em usua_usuario, independentemente do período.',
    'USUARIOS:CADASTRADOS_PERIODO': 'PERÍODO: usuários cuja usua_data_cadastro ocorreu dentro do intervalo.',
    'USUARIOS:CONECTADOS_SISTEMA': 'SISTEMA: usuários distintos que possuem acesso do tipo 1 em todo o histórico disponível de rasi_registro_acesso_sistema.',
    'USUARIOS:CONECTADOS_PERIODO': 'PERÍODO: usuários distintos que tiveram acesso do tipo 1 dentro do intervalo.',
    'USUARIOS:QUANTIDADE_ACESSOS_SISTEMA': 'SISTEMA: total de registros de acesso do tipo 1 em todo o histórico disponível.',
    'USUARIOS:QUANTIDADE_ACESSOS': 'PERÍODO: total de registros de acesso do tipo 1 dentro do intervalo.',
    'ACESSOS:POR_USUARIO_SISTEMA': 'SISTEMA: detalhamento de todos os acessos do tipo 1 por login em todo o histórico disponível.',
    'ACESSOS:POR_USUARIO': 'PERÍODO: detalhamento dos acessos do tipo 1 por login dentro do intervalo.',
    'EVENTOS:TOTAL_SISTEMA': 'SISTEMA: total bruto de registros em esis_evento_sistema_completa. Não depende do período.',
    'EVENTOS:AUTO_SISTEMA': 'SISTEMA: total de eventos completos com esis_usu_codigo_leitura <= 2.',
    'EVENTOS:MANUAL_SISTEMA': 'SISTEMA: total de eventos completos com esis_usu_codigo_leitura > 2.',
    'EVENTOS:TOTAL_PERIODO': 'PERÍODO: total bruto de eventos em esis_evento_sistema_completa dentro do intervalo.',
    'EVENTOS:AUTO_PERIODO': 'PERÍODO: eventos completos do intervalo com esis_usu_codigo_leitura <= 2.',
    'EVENTOS:MANUAL_PERIODO': 'PERÍODO: eventos completos do intervalo com esis_usu_codigo_leitura > 2.',
    'CHAMADOS:BACKLOG_ENTRADA': 'PERÍODO: chamados já existentes e ainda abertos no início do intervalo. Reabertura posterior ao período não interfere neste ponto inicial.',
    'CHAMADOS:ABERTOS_PERIODO': 'PERÍODO: chamados cuja data_criacao está dentro do intervalo.',
    'CHAMADOS:FECHADOS_PERIODO': 'PERÍODO: chamados cuja data_resolvido está dentro do intervalo. Se reabertos depois, a resolução continua contando neste período.',
    'CHAMADOS:BACKLOG_SAIDA': 'PERÍODO: chamados que ainda estavam abertos no final do intervalo. Se foram resolvidos no período e reabertos depois, entram no backlog do período seguinte.'
};

function addAccessRows(rows, result, escopo) {
    for (const r of result) {
        add(rows, 'ACESSOS', escopo === 'SISTEMA' ? 'POR_USUARIO_SISTEMA' : 'POR_USUARIO', r.usuario || '(SEM LOGIN)', r.acessos, INFO[`ACESSOS:${escopo === 'SISTEMA' ? 'POR_USUARIO_SISTEMA' : 'POR_USUARIO'}`], escopo);
    }
}

function attendanceConfigFromEnv() {
    return {
        enabled: String(process.env.ATENDIMENTOS_DB_ENABLED || '').toLowerCase() === 'true',
        host: process.env.ATENDIMENTOS_DB_HOST || '',
        port: Number(process.env.ATENDIMENTOS_DB_PORT || 5432),
        database: process.env.ATENDIMENTOS_DB_NAME || '',
        user: process.env.ATENDIMENTOS_DB_USER || '',
        password: process.env.ATENDIMENTOS_DB_PASSWORD || '',
        ssl: ['true','1','s','sim','yes'].includes(String(process.env.ATENDIMENTOS_DB_SSL || '').toLowerCase())
    };
}

function attendanceConfigured() {
    const a = attendanceConfigFromEnv();
    return Boolean(a.enabled && a.host && a.database && a.user && a.password);
}

function normalizeAttendanceClientName(name) {
    return String(name || '').trim();
}

function attendanceNameKey(name) {
    return normalizeAttendanceClientName(name)
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toUpperCase().replace(/[^A-Z0-9]+/g, '');
}

let attendanceNamesPromise = null;
async function resolveAttendanceClientNames(db, requestedName, aliases = []) {
    const requested = [requestedName, ...aliases].map(normalizeAttendanceClientName).filter(Boolean);
    if (!requested.length) throw new Error('Nome do cliente de atendimentos não informado.');
    if (!attendanceNamesPromise) {
        attendanceNamesPromise = db.query('SELECT cliente FROM estatistica.chamados_bi WHERE cliente IS NOT NULL GROUP BY cliente')
            .then(result => result.rows.map(row => normalizeAttendanceClientName(row.cliente)))
            .catch(error => {
                attendanceNamesPromise = null;
                throw error;
            });
    }
    const names = await attendanceNamesPromise;
    const resolved = new Set();
    // Antes, uma correspondencia EXATA parava a busca ali - se essa grafia
    // exata tivesse pouquissimos chamados e a grafia com o volume real
    // fosse so diferente em maiusculas/pontuacao, o real ficava ignorado
    // (foi o caso da White Martins: "White Martins" com 1 chamado parava
    // a busca antes de achar "WHITE MARTINS" com o volume de verdade).
    // Agora soma TODAS as grafias (exata + por nome normalizado) juntas.
    for (const candidate of requested) {
        const candidateKey = attendanceNameKey(candidate);
        const matches = names.filter(name => name === candidate || attendanceNameKey(name) === candidateKey);
        for (const match of matches) resolved.add(match);
    }
    if (!resolved.size) throw new Error(`Cliente não encontrado no banco de atendimentos: ${requested[0]}`);
    return [...resolved];
}

async function collectAtendimentos(clienteNome, start, end, step = () => {}, aliases = []) {
    if (!attendanceConfigured()) return [];
    const a = attendanceConfigFromEnv();
    const db = new Client({
        host: a.host,
        port: a.port,
        database: a.database,
        user: a.user,
        password: a.password,
        ssl: a.ssl,
        connectionTimeoutMillis: cfg.connectionTimeout,
        query_timeout: cfg.queryTimeout
    });
    const rows = [];
    try {
        await db.connect();
        const clientNames = await resolveAttendanceClientNames(db, clienteNome, aliases);
        for (const [indicator, queryName] of [
            ['BACKLOG_ENTRADA', 'ATENDIMENTOS_BACKLOG_ENTRADA'],
            ['ABERTOS_PERIODO', 'ATENDIMENTOS_ABERTOS_PERIODO'],
            ['FECHADOS_PERIODO', 'ATENDIMENTOS_FECHADOS_PERIODO'],
            ['BACKLOG_SAIDA', 'ATENDIMENTOS_BACKLOG_SAIDA']
        ]) {
            let quantity = 0;
            for (const clientName of clientNames) {
                const result = await db.query(qAtendimento(queryName), [start, end, clientName]);
                quantity += Number(result.rows[0]?.quantidade ?? 0);
            }
            add(rows, 'CHAMADOS', indicator, '', quantity, INFO[`CHAMADOS:${indicator}`], 'PERIODO');
            step(`${indicator} [PERIODO]`);
        }
        return rows;
    } finally {
        await db.end().catch(() => {});
    }
}

async function collectClient(c, date, period = PERIODS.DIARIO, step = () => {}, override = null) {
    const h = await openClient(c);
    const db = h.client;
    const p = range(date, period, override);
    const rows = [];
    try {
        const systemMetrics = [
            ['VIAGENS', 'TOTAL', 'VIAGENS_TOTAL_SISTEMA'],
            ['VIAGENS', 'TOTAL_NAO_CANCELADAS', 'VIAGENS_SEM_CANCELADAS_SISTEMA'],
            ['TERMINAIS', 'ATIVOS_SISTEMA', 'TERMINAIS_ATIVOS_SISTEMA'],
            ['TERMINAIS', 'ATIVOS_GR_WS_SISTEMA', 'TERMINAIS_ATIVOS_GR_WS_SISTEMA'],
            ['TERMINAIS', 'TOTAL_SISTEMA', 'TERMINAIS_CADASTRADOS_SISTEMA'],
            ['USUARIOS', 'TOTAL', 'MENSAL_USUARIOS_TOTAL'],
            ['USUARIOS', 'CONECTADOS_SISTEMA', 'MENSAL_USUARIOS_CONECTADOS_SISTEMA'],
            ['USUARIOS', 'QUANTIDADE_ACESSOS_SISTEMA', 'MENSAL_QUANTIDADE_ACESSOS_SISTEMA'],
            ['EVENTOS', 'TOTAL_SISTEMA', 'EVENTOS_TOTAL_SISTEMA'],
            ['EVENTOS', 'AUTO_SISTEMA', 'EVENTOS_AUTO_SISTEMA'],
            ['EVENTOS', 'MANUAL_SISTEMA', 'EVENTOS_MANUAL_SISTEMA']
        ];
        for (const [cat, ind, name] of systemMetrics) {
            try {
                const result = await runQuery(db, name, p);
                add(rows, cat, ind, '', result[0]?.quantidade ?? 0, INFO[`${cat}:${ind}`], 'SISTEMA');
            } catch (error) {
                addError(rows, cat, ind, error.message, 'SISTEMA');
            }
            step(`${ind} [SISTEMA]`);
        }

        try {
            addAccessRows(rows, await runQuery(db, 'ACESSO_POR_USUARIO_SISTEMA', p), 'SISTEMA');
        } catch (error) {
            addError(rows, 'ACESSOS', 'POR_USUARIO_SISTEMA', error.message, 'SISTEMA');
        }
        step('POR_USUARIO_SISTEMA [SISTEMA]');

        const periodMetrics = [
            ['VIAGENS', 'TOTAL_PERIODO', 'VIAGENS_TOTAL_PERIODO'],
            ['VIAGENS', 'SEM_CANCELADAS_PERIODO', 'VIAGENS_SEM_CANCELADAS_PERIODO'],
            ['VIAGENS', 'CADASTRADAS', 'VIAGENS_CADASTRADAS'],
            ['VIAGENS', 'NAO_CANCELADAS', 'VIAGENS_NAO_CANCELADAS'],
            ['SM', 'CRIADAS', 'SM_CRIADAS'],
            ['SM', 'INICIADAS', 'SM_INICIADAS'],
            ['SM', 'CANCELADAS', 'SM_CANCELADAS'],
            ['SM', 'EM_VIAGEM_NO_FIM_DO_DIA', 'SM_EM_VIAGEM_NO_FIM_DO_DIA'],
            ['SM', 'FINALIZADAS_NO_DIA', 'SM_FINALIZADAS_NO_DIA'],
            ['TERMINAIS', 'ATIVOS_PERIODO', 'TERMINAIS_ATIVOS_PERIODO'],
            ['TERMINAIS', 'CADASTRADOS', 'TERMINAIS_CADASTRADOS_PERIODO'],
            ['TERMINAIS', 'CADASTRADOS_ATIVOS', 'TERMINAIS_CADASTRADOS_ATIVOS_PERIODO'],
            ['TERMINAIS', 'ATIVADOS_NO_PERIODO', 'TERMINAIS_ATIVADOS_NO_DIA'],
            ['TERMINAIS', 'INATIVADOS_NO_PERIODO', 'TERMINAIS_INATIVADOS_NO_DIA'],
            ['USUARIOS', 'CADASTRADOS_PERIODO', 'MENSAL_USUARIOS_CADASTRADOS'],
            ['USUARIOS', 'CONECTADOS_PERIODO', 'MENSAL_USUARIOS_CONECTADOS'],
            ['USUARIOS', 'QUANTIDADE_ACESSOS', 'MENSAL_QUANTIDADE_ACESSOS'],
            ['EVENTOS', 'TOTAL_PERIODO', 'EVENTOS_TOTAL_PERIODO'],
            ['EVENTOS', 'AUTO_PERIODO', 'EVENTOS_AUTO_PERIODO'],
            ['EVENTOS', 'MANUAL_PERIODO', 'EVENTOS_MANUAL_PERIODO']
        ];
        for (const [cat, ind, name] of periodMetrics) {
            try {
                const result = await runQuery(db, name, p);
                add(rows, cat, ind, '', result[0]?.quantidade ?? 0, INFO[`${cat}:${ind}`], 'PERIODO');
            } catch (error) {
                addError(rows, cat, ind, error.message, 'PERIODO');
            }
            step(`${ind} [PERIODO]`);
        }

        try {
            const accessesPeriod = await runQuery(db, 'MENSAL_ACESSO_POR_USUARIO', p);
            addAccessRows(rows, accessesPeriod, 'PERIODO');
        } catch (error) {
            addError(rows, 'ACESSOS', 'POR_USUARIO', error.message, 'PERIODO');
        }
        step('POR_USUARIO [PERIODO]');

        try {
            const groupedEvents = await runQuery(db, 'ESIS_PGR_AGRUPADO', p);
            for (const r of groupedEvents) {
                add(rows, 'ESIS', 'GERADOS', r.evento || '(SEM DESCRICAO)', r.quantidade, 'PERÍODO: detalhamento dos eventos agrupados pela descrição PGR. O total geral permanece separado e usa a esis_evento_sistema_completa.', 'PERIODO');
            }
        } catch (error) {
            addError(rows, 'ESIS', 'GERADOS', error.message, 'PERIODO');
        }
        step('ESIS_PGR_AGRUPADO [PERIODO]');

        // Faturamento e uma regra mensal: a query espera o 1o dia do mes
        // SEGUINTE ao da competencia desejada (ela subtrai 1 mes por
        // dentro). runQuery() ja manda p[1] (fim do periodo pedido, que e
        // exatamente o 1o dia do mes seguinte) - corrigido apos confirmar
        // com numero real que a versao antiga (usando o inicio do proprio
        // periodo) calculava o mes ANTERIOR ao pedido por engano.
        try {
            const faturamento = await runQuery(db, 'MENSAL_TERMINAIS_FATURAMENTO', p);
            add(rows, 'TERMINAIS', 'FATURAMENTO', '', faturamento[0]?.quantidade ?? 0, INFO['TERMINAIS:FATURAMENTO'], 'PERIODO');
        } catch (error) {
            addError(rows, 'TERMINAIS', 'FATURAMENTO', error.message, 'PERIODO');
        }
        step('FATURAMENTO [PERIODO]');

        return rows;
    } finally {
        await db.end().catch(() => {});
        if (h.tunnel) await h.tunnel.close().catch(() => {});
    }
}

async function runAll(clients, date, period, onAttemptStart, onAttemptFinish, onLog) {
    let pending = clients.slice();
    const final = new Map();
    for (let attempt = 1; attempt <= cfg.maxRetries && pending.length; attempt++) {
        const batch = pending;
        pending = [];
        onLog?.(`RODADA ${attempt}: ${batch.length} cliente(s)`);
        const collectOne = async c => {
            let executionId = null;
            try {
                executionId = await onAttemptStart?.(c, attempt);
                onLog?.(`${c.name}: tentativa ${attempt} iniciada`);
                // Banco do cliente e banco de atendimentos sao servidores
                // diferentes: as duas coletas rodam juntas em vez de uma
                // esperar a outra. A ordem das linhas continua a mesma.
                const rowsPromise = collectClient(c, date, period, step => onLog?.(`${c.name}: ${step}`));
                let attendancePromise = null;
                if (attendanceConfigured()) {
                    const automaticRange = range(date, period);
                    attendancePromise = collectAtendimentos(c.attendanceName || c.name, automaticRange[0], automaticRange[1], step => onLog?.(`${c.name}: ${step}`), c.attendanceAliases || []);
                    attendancePromise.catch(() => {});
                }
                const rows = await rowsPromise;
                if (attendancePromise) rows.push(...await attendancePromise);
                await onAttemptFinish?.(executionId, 'OK');
                onLog?.(`${c.name}: OK`);
                return { ok: true, client: c, rows, attempt };
            } catch (error) {
                await onAttemptFinish?.(executionId, 'ERRO', error.message);
                onLog?.(`${c.name}: ${error.message}`);
                return { ok: false, client: c, error: error.message, attempt };
            }
        };
        // Fila deslizante com teto por servidor (mesma regra do web/server.js).
        // Em lotes fechados, cada lote so comecava quando o cliente mais lento
        // do anterior terminava, e essa espera ociosa chegava a dobrar o tempo
        // total. E como varios clientes moram no MESMO servidor (ha IPs com
        // mais de 10 bases), limitamos quantos rodam por servidor para nao
        // sobrecarregar a maquina do cliente.
        const hostKeyOf = c => (c?.ssh?.enabled && c.ssh.host)
            ? `ssh:${c.ssh.host}`
            : `db:${c?.db?.host || c?.host || 'desconhecido'}`;
        const perHost = Math.max(1, Number(cfg.concurrencyPerHost) || 4);
        const rs = new Array(batch.length);
        const pendentes = batch.map((item, index) => ({ item, index }));
        const emUso = new Map();
        const runner = async () => {
            while (true) {
                let escolhido = -1;
                let restam = false;
                for (let k = 0; k < pendentes.length; k++) {
                    if (!pendentes[k]) continue;
                    restam = true;
                    if ((emUso.get(hostKeyOf(pendentes[k].item)) || 0) < perHost) { escolhido = k; break; }
                }
                if (escolhido === -1) {
                    if (!restam) return;
                    await new Promise(r => setTimeout(r, 25));
                    continue;
                }
                const { item, index } = pendentes[escolhido];
                pendentes[escolhido] = null;
                const chave = hostKeyOf(item);
                emUso.set(chave, (emUso.get(chave) || 0) + 1);
                try {
                    rs[index] = await collectOne(item);
                } finally {
                    emUso.set(chave, (emUso.get(chave) || 1) - 1);
                }
            }
        };
        await Promise.all(Array.from({ length: Math.min(Math.max(1, cfg.concurrency), batch.length) }, runner));
        for (const result of rs) {
            if (result.ok) final.set(result.client.id, result);
            else if (attempt < cfg.maxRetries) pending.push(result.client);
            else final.set(result.client.id, result);
        }
    }
    return [...final.values()];
}

module.exports = { collectClient, collectAtendimentos, attendanceConfigured, runAll, PERIODS, INFO };
