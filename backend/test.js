require('dotenv').config({ path: require('path').join(__dirname, '..', 'config', 'credentials.env') });
const fs = require('fs'),
    path = require('path'),
    assert = require('assert');
const configStore = require('./config-store');

async function main() {
    const clients = await configStore.listClients();
    const sql = fs.readFileSync(path.join(__dirname, '..', 'sql', 'queries.sql'), 'utf8');
    assert.ok(Array.isArray(clients) && clients.length > 0, 'Deve existir pelo menos um cliente configurado');
    for (const c of clients) {
        assert.ok(c.id !== undefined && c.name, 'Cada cliente deve ter id e nome');
        if (c.enabled) assert.ok(c.db && c.db.host && c.db.database && Number(c.db.port) > 0, `Cliente habilitado ${c.name || c.id} com banco incompleto`);
    }
    assert.ok(sql.includes('COUNT(DISTINCT ees.esis_codigo)'), 'ESIS deve evitar duplicacao pelo JOIN');
    assert.ok(sql.includes('FROM esis_evento_sistema_completa ees\nJOIN pite_pg_item'), 'ESIS_PGR_AGRUPADO deve usar a tabela completa');
    assert.ok(sql.includes('SM_EM_VIAGEM_NO_FIM_DO_DIA'), 'SM em viagem');
    assert.ok(sql.includes('TERMINAIS_ATIVOS_GR_WS_SISTEMA'), 'terminais ativos');
    assert.ok(sql.includes('MENSAL_USUARIOS_TOTAL'), 'usuarios');
    assert.ok(sql.includes('EVENTOS_AUTO_PERIODO'), 'eventos automaticos');
    assert.ok(sql.includes('MENSAL_TERMINAIS_FATURAMENTO'), 'faturamento mensal');
    console.log(`Todos os testes estruturais passaram (${clients.length} cliente(s), fonte: ${configStore.dbMode() ? 'banco' : 'arquivo'}).`);

    const child = require('child_process');
    const appJs = path.join(__dirname, '..', 'web', 'app.js');
    const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'web', 'index.html'), 'utf8');
    const appSource = fs.readFileSync(appJs, 'utf8');
    const serverSource = fs.readFileSync(path.join(__dirname, '..', 'web', 'server.js'), 'utf8');
    assert.ok(fs.existsSync(appJs), 'web/app.js deve existir');
    assert.ok(indexHtml.includes('data-view="mcpLogs"'), 'Menu deve possuir aba Logs MCP');
    assert.ok(indexHtml.includes('id="mcpLogs"'), 'Interface deve possuir tela exclusiva de Logs MCP');
    assert.ok(appSource.includes("api('/api/mcp-logs?limit=100')"), 'Aba Logs MCP deve carregar endpoint dedicado');
    assert.ok(serverSource.includes("u.pathname === '/api/mcp-logs'"), 'Backend deve expor endpoint dedicado para Logs MCP');
    assert.ok(serverSource.includes("LOWER(COALESCE(u.usua_login, '')) = 'mcp_claude'"), 'Endpoint deve filtrar exclusivamente o usuario MCP_Claude');
    child.execFileSync(process.execPath, ['--check', appJs], { stdio: 'pipe' });
    child.execFileSync(process.execPath, ['--check', path.join(__dirname, '..', 'web', 'server.js')], { stdio: 'pipe' });
    child.execFileSync(process.execPath, ['--check', path.join(__dirname, 'report.js')], { stdio: 'pipe' });
    console.log('JavaScript da interface e backend: sintaxe OK.');
    if (configStore.dbMode() && require('./appdb').appPool()) await require('./appdb').appPool().end();
}

main().catch(e => { console.error(e.message); process.exitCode = 1; });
