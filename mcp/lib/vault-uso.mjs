// Relatorio de uso do cerebro: le os registros de uso das tools vault_* (dos dois MCPs) e os casos
// do Trafegus, e gera a nota servidor/uso-do-cerebro.md. So grava quando o conteudo muda.
import fs from 'node:fs';
import path from 'node:path';

export const NOTA_USO = 'servidor/uso-do-cerebro.md';
const RE_SCHEMA = /information_schema|pg_catalog|pg_tables|pg_attribute/i;

export function lerRegistros(arquivos) {
  const saida = [];
  for (const arq of arquivos) {
    if (!arq || !fs.existsSync(arq)) continue;
    for (const linha of fs.readFileSync(arq, 'utf8').split('\n')) {
      if (!linha.trim()) continue;
      try { const r = JSON.parse(linha); if (r && r.ts && r.tool) saida.push(r); } catch { /* linha cortada */ }
    }
  }
  return saida.sort((a, b) => a.ts.localeCompare(b.ts));
}

export function resumoDosCasos(rootDir) {
  const dir = path.join(rootDir, 'trafegus', 'casos');
  if (!fs.existsSync(dir)) return [];
  const casos = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!e.isDirectory() || e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    const arquivos = fs.readdirSync(p);
    const sqls = arquivos.filter(f => /^consulta-\d+\.sql$/.test(f));
    const schema = sqls.filter(f => RE_SCHEMA.test(fs.readFileSync(path.join(p, f), 'utf8'))).length;
    let data = '', autor = '';
    try { const ent = JSON.parse(fs.readFileSync(path.join(p, 'entrada.json'), 'utf8')); data = String(ent.criado_em || '').slice(0, 10); } catch { /* sem entrada */ }
    try {
      const primeira = fs.readFileSync(path.join(p, 'log.jsonl'), 'utf8').split('\n').find(l => l.trim());
      if (primeira) autor = String(JSON.parse(primeira).autor || '');
      if (autor.includes('@')) autor = 'pessoa'; // nunca expor e-mail na nota
    } catch { /* sem log */ }
    let cerebro = '';
    const ver = path.join(p, 'veredito.md');
    if (fs.existsSync(ver)) {
      const m = fs.readFileSync(ver, 'utf8').match(/^\s*C[ée]rebro:\s*(.+)$/im);
      cerebro = m ? m[1].trim() : 'sem linha';
    } else cerebro = 'sem veredito';
    const doNome = e.name.match(/-(20\d{2})(\d{2})(\d{2})$/);
    if (!data && doNome) data = doNome[1] + '-' + doNome[2] + '-' + doNome[3];
    if (!data) data = fs.statSync(p).mtime.toISOString().slice(0, 10);
    casos.push({ id: e.name, data, autor, consultas: sqls.length, schema, cerebro });
  }
  return casos.sort((a, b) => b.data.localeCompare(a.data) || a.id.localeCompare(b.id));
}

const contar = (lista, chave) => {
  const m = new Map();
  for (const x of lista) { const k = chave(x); if (k) m.set(k, (m.get(k) || 0) + 1); }
  return [...m.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
};
const tabela = (cab, linhas) => linhas.length
  ? `| ${cab.join(' | ')} |\n|${cab.map(() => '---').join('|')}|\n` + linhas.map(l => `| ${l.map(c => String(c).replace(/\|/g, '/')).join(' | ')} |`).join('\n') + '\n'
  : '_Nada registrado ainda._\n';

export function montarRelatorio({ registros, casos, hoje }) {
  const d7 = new Date(new Date(hoje + 'T00:00:00Z').getTime() - 6 * 864e5).toISOString().slice(0, 10);
  const semana = registros.filter(r => r.ts.slice(0, 10) >= d7);
  const leituras = registros.filter(r => r.tool === 'vault_ler' && r.ok !== false);
  const porDia = contar(registros.filter(r => r.ts.slice(0, 10) >= d7), r => r.ts.slice(0, 10)).sort((a, b) => b[0].localeCompare(a[0]));
  const comMedicao = casos.filter(c => !/^sem /.test(c.cerebro));
  const media = l => l.length ? (l.reduce((s, c) => s + c.consultas, 0) / l.length).toFixed(1) : '-';
  const mediaSchema = l => l.length ? (l.reduce((s, c) => s + c.schema, 0) / l.length).toFixed(1) : '-';
  const inicioRegistro = registros.length ? registros[0].ts.slice(0, 10) : null;
  const antes = inicioRegistro ? casos.filter(c => c.data < inicioRegistro) : casos;
  const depois = inicioRegistro ? casos.filter(c => c.data >= inicioRegistro) : [];

  return `---
resumo: Uso do cerebro pelas IAs e efeito nas analises do Trafegus (gerado automaticamente)
---
# Uso do cérebro

Gerado sozinho pelo servidor a partir do registro das tools vault_* (MCP do Trafegus e MCP do cérebro) e das pastas de casos. Não edite: é reescrito. Dados de ${hoje}.

## Resumo
- Chamadas ao cérebro registradas: **${registros.length}** no total, **${semana.length}** nos últimos 7 dias${inicioRegistro ? ` (registro desde ${inicioRegistro})` : ''}.
- Notas lidas (vault_ler): **${leituras.length}**. Falhas: **${registros.filter(r => r.ok === false).length}**.
- Casos do Trafegus: **${casos.length}**; média de consultas ao banco por caso: **${media(casos)}**; média de consultas só para descobrir tabelas (schema): **${mediaSchema(casos)}**.
- Antes do registro de uso: ${antes.length} casos, ${media(antes)} consultas e ${mediaSchema(antes)} de schema por caso. Depois: ${depois.length} casos, ${media(depois)} consultas e ${mediaSchema(depois)} de schema por caso.

## Por IA (últimos 7 dias)
${tabela(['IA', 'Chamadas'], contar(semana, r => r.ia || 'desconhecida'))}
## Por MCP e ferramenta (últimos 7 dias)
${tabela(['MCP', 'Ferramenta', 'Chamadas'], contar(semana, r => (r.mcp || '?') + '\u0000' + r.tool).map(([k, n]) => [...k.split('\u0000'), n]))}
## Por dia (últimos 7 dias)
${tabela(['Dia', 'Chamadas'], porDia)}
## Notas mais lidas
${tabela(['Nota', 'Leituras'], contar(leituras, r => r.caminho).slice(0, 15))}
## Buscas mais feitas
${tabela(['Termo', 'Pasta', 'Vezes'], contar(registros.filter(r => r.tool === 'vault_buscar'), r => (r.termo || '') + '\u0000' + (r.caminho || '')).slice(0, 10).map(([k, n]) => [...k.split('\u0000'), n]))}
## Casos (mais recentes primeiro)
Consultas de schema = SQL que só procura nomes de tabela/coluna (information_schema, pg_catalog). Quanto menor, mais a IA aproveitou o mapa de schema e o conhecimento do cérebro. A coluna Cérebro é a linha que a IA escreve no fim do veredito.
${tabela(['Caso', 'Data', 'Autor', 'Consultas', 'Schema', 'Cérebro'], casos.slice(0, 30).map(c => [c.id, c.data, c.autor || '-', c.consultas, c.schema, c.cerebro]))}
Casos com a linha "Cérebro:" no veredito: ${comMedicao.length} de ${casos.length}.
`;
}

export function gerarRelatorioUso({ rootDir, arquivosLog, hoje = new Date().toISOString().slice(0, 10) }) {
  const texto = montarRelatorio({ registros: lerRegistros(arquivosLog), casos: resumoDosCasos(rootDir), hoje });
  const arq = path.join(rootDir, NOTA_USO);
  if (fs.existsSync(arq) && fs.readFileSync(arq, 'utf8') === texto) return false;
  fs.mkdirSync(path.dirname(arq), { recursive: true });
  const tmp = arq + '.tmp-' + process.pid;
  fs.writeFileSync(tmp, texto);
  fs.renameSync(tmp, arq);
  return true;
}
