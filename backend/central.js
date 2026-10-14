const fs = require('fs'),
    path = require('path');
const SQL = fs.readFileSync(path.join(__dirname, '..', 'sql', 'central.sql'), 'utf8');
async function ensure(pool) {
    if (pool) await pool.query(SQL);
}
async function recoverStale(pool, currentDate) {
    if (!pool) return;
    await pool.query(`UPDATE coleta_execucao SET status='ABANDONADA',fim=NOW(),erro=COALESCE(erro,'Processo interrompido antes da conclusao') WHERE data_referencia=$1 AND status='EXECUTANDO'`, [currentDate]);
}
async function start(pool, c, date, period, attempt) {
    if (!pool) return null;
    const q = await pool.query(`INSERT INTO coleta_execucao(data_referencia,periodicidade,cliente_id,cliente_nome,tentativa,status) VALUES($1,$2,$3,$4,$5,'EXECUTANDO') ON CONFLICT(data_referencia,periodicidade,cliente_id,tentativa) DO UPDATE SET status='EXECUTANDO',inicio=NOW(),fim=NULL,erro=NULL RETURNING id`, [date, period, c.id, c.nome, attempt]);
    return q.rows[0].id;
}
async function finish(pool, id, status, error = null) {
    if (!pool || !id) return;
    await pool.query(`UPDATE coleta_execucao SET status=$2,fim=NOW(),erro=$3 WHERE id=$1`, [id, status, error]);
}
async function log(pool, date, period, c, attempt, etapa, status, msg) {
    if (!pool) return;
    await pool.query(`INSERT INTO coleta_execucao_log(data_referencia,periodicidade,cliente_id,cliente_nome,tentativa,etapa,status,mensagem) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, [date, period, c?.id || null, c?.nome || null, attempt, etapa, status, msg || null]);
}
async function save(pool, date, period, c, rows) {
    if (!pool) return;
    for (const r of rows) {
        await pool.query(`INSERT INTO coleta_indicadores(data_referencia,periodicidade,cliente_id,cliente_nome,categoria,indicador,escopo,evento,quantidade,status,erro) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT(data_referencia,periodicidade,cliente_id,categoria,indicador,evento) DO UPDATE SET escopo=EXCLUDED.escopo,quantidade=EXCLUDED.quantidade,status=EXCLUDED.status,erro=EXCLUDED.erro,data_coleta=NOW()`, [date, period, c.id, c.nome, r.categoria, r.indicador, r.escopo || 'PERIODO', r.evento || '', r.quantidade || 0, r.status || 'OK', r.erro || null]);
    }
}
module.exports = {
    ensure,
    recoverStale,
    start,
    finish,
    log,
    save
};