// Divide os arquivos de eventos da base TrafegusGR em uma nota por evento, agrupada pelo tipo oficial.
// Uso: node scripts/kb-dividir-eventos.mjs <dir conhecimento atual> <dir saida vazio> <relatorio.json>
// Nao altera a origem. Aborta (exit 1) se qualquer verificacao falhar:
//  1) cada arquivo fonte = preambulo (so o titulo) + secoes, byte a byte;
//  2) todo evento tem tipo da tabela oficial (declarado no texto ou pelo arquivo de origem);
//  3) o indice deterministico (knowledge-index) gera as mesmas regras antes e depois
//     (titulo, sha256, artigo, PGR, sistema, tamanho); ids ART e documentos nao-evento inalterados.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createKnowledgeIndex } from '../mcp/lib/knowledge-index.mjs';
import { nomeArquivoSeguro } from '../mcp/lib/vault-organizar.mjs';

const [origem, saida, relatorio] = process.argv.slice(2);
if (!origem || !saida || !relatorio) {
  console.error('uso: node scripts/kb-dividir-eventos.mjs <origem> <saida> <relatorio.json>');
  process.exit(2);
}

const PREFIXO_VAULT = 'trafegus/conhecimento/eventos';
const TIPOS_OFICIAIS = ['Controle da Viagem', 'Controle de Carga', 'Controle de Comboios', 'Controle de Deslocamento',
  'Controle de Desvio de Rota', 'Controle de Periféricos', 'Controle de Pernoite', 'Controle de Rota Reversa',
  'Controle de Tempos', 'Controle de Viagem', 'Controle de Áreas de Risco', 'Pesquisa de Consulta'];
const FONTES = [
  ['eventos-controle-da-viagem-1.md', 'Controle da Viagem'],
  ['eventos-controle-da-viagem-2.md', 'Controle da Viagem'],
  ['eventos-controle-de-perifericos-1.md', 'Controle de Periféricos'],
  ['eventos-controle-de-perifericos-2.md', 'Controle de Periféricos'],
  ['eventos-outros-tipos.md', null]
];
const ehFonte = nome => FONTES.some(([f]) => f === nome);

function falhar(msg) {
  console.error('FALHA: ' + msg);
  process.exit(1);
}

// Mesma deteccao de titulos de knowledge-index.mjs (ignora titulos dentro de blocos de codigo).
function titulos(texto) {
  const rows = texto.match(/[^\n]*\n|[^\n]+$/g) || [];
  let pos = 0;
  let fence = null;
  const hs = [];
  for (const row of rows) {
    const f = row.match(/^\s{0,3}(\x60{3,}|~{3,})/);
    if (f) {
      if (!fence) fence = f[1];
      else if (f[1][0] === fence[0] && f[1].length >= fence.length) fence = null;
    } else if (!fence) {
      const h = row.match(/^(#{1,6})\s+(.+?)\s*\r?\n?$/);
      if (h) hs.push({ level: h[1].length, titulo: h[2], pos });
    }
    pos += row.length;
  }
  return hs;
}

function tipoDeclarado(secao) {
  const i = secao.search(/Classifica[çc][ãa]o/i);
  if (i < 0) return null;
  const trecho = secao.slice(i, i + 300);
  const m = trecho.match(/Tipo de Evento:\s*([^\n.;]+)/i) || trecho.match(/^Classifica[çc][ãa]o:\s*([^\n.;]+)/i);
  return m ? m[1].trim() : null;
}

function nomeBase(titulo) {
  let t = titulo.replace(/\s*\(art\..*$/i, '').replace(/\s+[—–-]\s+PGR.*$/i, '').trim();
  t = t.replace(/^Eventos?\s+(de|do|da|dos|das)\s+/i, '').replace(/^Eventos?\s+/i, '');
  return nomeArquivoSeguro(t.charAt(0).toUpperCase() + t.slice(1));
}

function indexar(dir, arquivoIndice) {
  createKnowledgeIndex({ rootDir: dir, indexPath: arquivoIndice }).stats();
  return JSON.parse(fs.readFileSync(arquivoIndice, 'utf8'));
}

// 1) Leitura e divisao das fontes.
const eventos = [];
const fontes = [];
for (const [arquivo, tipoPadrao] of FONTES) {
  const texto = fs.readFileSync(path.join(origem, arquivo), 'utf8');
  const hs = titulos(texto);
  const h2 = hs.filter(h => h.level === 2);
  if (!h2.length) falhar(arquivo + ' sem secoes nivel 2');
  if (hs.some(h => h.level === 1 && h.pos > h2[0].pos)) falhar(arquivo + ' tem titulo nivel 1 depois da primeira secao');
  const preambulo = texto.slice(0, h2[0].pos);
  if (!/^# [^\n]*\n\s*$/.test(preambulo)) falhar(arquivo + ' tem preambulo alem do titulo: ' + JSON.stringify(preambulo.slice(0, 200)));
  const partes = h2.map((h, i) => texto.slice(h.pos, i + 1 < h2.length ? h2[i + 1].pos : texto.length));
  if (preambulo + partes.join('') !== texto) falhar(arquivo + ' nao reconstroi byte a byte');
  fontes.push({ arquivo, titulo: preambulo.trim(), secoes: partes.length, bytes: Buffer.byteLength(texto, 'utf8') });
  h2.forEach((h, i) => {
    const declarado = tipoDeclarado(partes[i]);
    const tipo = declarado || tipoPadrao;
    if (!tipo) falhar('evento sem tipo declarado: ' + arquivo + ' | ' + h.titulo);
    if (!TIPOS_OFICIAIS.includes(tipo)) falhar('tipo fora da tabela oficial: "' + tipo + '" | ' + arquivo + ' | ' + h.titulo);
    eventos.push({
      arquivo, titulo: h.titulo, secao: partes[i], tipo, tipoDeclarado: !!declarado,
      artigo: (h.titulo.match(/art\.\s*(\d+)/i) || [])[1] || null,
      pgr: (h.titulo.match(/PGR\s*(\d+)/i) || [])[1] || null,
      sistema: (h.titulo.match(/Sistema\s*(\d+)/i) || [])[1] || null,
      base: nomeBase(h.titulo)
    });
  });
}

// 2) Nomes de arquivo unicos (sem diferenciar maiusculas), sem colidir com as notas-hub dos tipos.
const reservados = new Set(TIPOS_OFICIAIS.map(t => t.toLowerCase()).concat(['eventos', 'conhecimento']));
const contagem = new Map();
for (const e of eventos) contagem.set(e.base.toLowerCase(), (contagem.get(e.base.toLowerCase()) || 0) + 1);
const usados = new Set();
const renomeados = [];
for (const e of eventos) {
  let nome = e.base;
  if ((contagem.get(nome.toLowerCase()) > 1 || reservados.has(nome.toLowerCase())) && e.artigo) nome = e.base + ' (art ' + e.artigo + ')';
  let final = nome;
  let n = 2;
  while (usados.has(final.toLowerCase()) || reservados.has(final.toLowerCase())) final = nome + ' (' + n++ + ')';
  usados.add(final.toLowerCase());
  if (final !== e.base) renomeados.push({ titulo: e.titulo, nome: final });
  e.nome = final;
}

// 3) Gravacao na saida (vazia): documentos nao-evento copiados sem alteracao; uma nota por evento.
fs.mkdirSync(saida, { recursive: true });
if (fs.readdirSync(saida).length) falhar('diretorio de saida nao esta vazio: ' + saida);
for (const doc of fs.readdirSync(origem)) {
  if (!doc.endsWith('.md') || ehFonte(doc)) continue;
  fs.copyFileSync(path.join(origem, doc), path.join(saida, doc));
}
for (const e of eventos) {
  const dir = path.join(saida, 'eventos', e.tipo);
  fs.mkdirSync(dir, { recursive: true });
  const fm = ['---', 'tipo: evento', 'tipo_evento: ' + JSON.stringify(e.tipo)];
  if (e.artigo) fm.push('artigo: "' + e.artigo + '"');
  if (e.pgr) fm.push('codigo_pgr: "' + e.pgr + '"');
  if (e.sistema) fm.push('codigo_sistema: "' + e.sistema + '"');
  fm.push('fonte_original: ' + e.arquivo, '---');
  const cabecalho = fm.join('\n') + '\nTipo: [[' + PREFIXO_VAULT + '/' + e.tipo + '/' + e.tipo + '|' + e.tipo + ']]\n\n';
  const alvo = path.join(dir, e.nome + '.md');
  if (fs.existsSync(alvo)) falhar('colisao de arquivo: ' + alvo);
  fs.writeFileSync(alvo, cabecalho + e.secao, 'utf8');
  e.documento = 'eventos/' + e.tipo + '/' + e.nome + '.md';
}

// 4) Verificacao pelo indice deterministico.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-verificacao-'));
const antes = indexar(origem, path.join(tmp, 'antes.json'));
const depois = indexar(saida, path.join(tmp, 'depois.json'));
if (antes.regras !== depois.regras) falhar('numero de regras mudou: ' + antes.regras + ' -> ' + depois.regras);
const deFontes = antes.entries.filter(e => ehFonte(e.documento)).length;
if (deFontes !== eventos.length) falhar('secoes (' + eventos.length + ') diferente de regras indexadas nas fontes (' + deFontes + ')');
const chave = e => [e.titulo, e.sha256, e.artigo, e.codigo_pgr, e.codigo_sistema, e.caracteres].join('|');
const pendentes = new Map();
for (const e of antes.entries) pendentes.set(chave(e), (pendentes.get(chave(e)) || []).concat([e]));
const mapeamentoSec = [];
for (const d of depois.entries) {
  const lista = pendentes.get(chave(d));
  if (!lista || !lista.length) falhar('regra sem correspondente: ' + d.regra_id + ' | ' + d.titulo);
  const a = lista.shift();
  if (!ehFonte(a.documento) && (a.documento !== d.documento || a.regra_id !== d.regra_id)) falhar('documento nao-evento mudou: ' + a.documento);
  if (a.regra_id.startsWith('REGRA-ART-') && a.regra_id !== d.regra_id) falhar('id ART mudou: ' + a.regra_id + ' -> ' + d.regra_id);
  if (a.regra_id !== d.regra_id) mapeamentoSec.push({ antes: a.regra_id, depois: d.regra_id, titulo: d.titulo, documento: d.documento });
}
if ([...pendentes.values()].some(l => l.length)) falhar('regras antigas sem correspondente');
for (const e of eventos) {
  const n = depois.entries.filter(d => d.documento === e.documento).length;
  if (n !== 1) falhar('nota ' + e.documento + ' gerou ' + n + ' regras (esperado 1)');
}

const porTipo = {};
for (const e of eventos) porTipo[e.tipo] = (porTipo[e.tipo] || 0) + 1;
const rel = {
  gerado_em: new Date().toISOString(),
  origem, saida,
  fontes,
  total_eventos: eventos.length,
  por_tipo: porTipo,
  tipo_declarado_no_texto: eventos.filter(e => e.tipoDeclarado).length,
  tipo_pelo_arquivo_de_origem: eventos.filter(e => !e.tipoDeclarado).length,
  regras_antes: antes.regras,
  regras_depois: depois.regras,
  renomeados_por_duplicidade: renomeados,
  ids_sec_alterados: mapeamentoSec,
  eventos: eventos.map(e => ({ documento: e.documento, artigo: e.artigo, fonte: e.arquivo }))
};
fs.mkdirSync(path.dirname(relatorio), { recursive: true });
fs.writeFileSync(relatorio, JSON.stringify(rel, null, 2) + '\n', 'utf8');
fs.writeFileSync(path.join(saida, '.verificado'), rel.gerado_em + '\n', 'utf8');
console.log('DIVISAO_OK eventos=' + eventos.length + ' regras=' + depois.regras + ' tipos=' + Object.keys(porTipo).length +
  ' renomeados=' + renomeados.length + ' ids_sec_alterados=' + mapeamentoSec.length);
console.log(JSON.stringify(porTipo));
