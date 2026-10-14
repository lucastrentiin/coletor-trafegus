import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { separarFrontmatter, lerFrontmatter, resumoDeTexto, encurtar } from './vault.mjs';

// Organizador das arvores do vault (uma por pasta da raiz): gera notas-hub (uma por pasta, com o mesmo nome da pasta),
// a ficha de cada caso, uma nota por cliente e os links entre elas. So reescreve o bloco
// entre os marcadores auto:inicio/auto:fim e as chaves proprias do frontmatter; o resto da nota e preservado.

export const CAMINHOS = Object.freeze({
  casos: 'trafegus/casos',
  clientes: 'trafegus/clientes',
  eventos: 'trafegus/conhecimento/eventos',
  sistema: 'trafegus/sistema'
});
const PASTAS_SEM_HUB = new Set(['templates']);
// Chave = prefixo do ID do caso ou nome do cliente sem espacos/acentos/simbolos, em minusculas.
// Valor = nome do cliente igual ao cadastro do MCP (listar_clientes).
export const ALIASES_CLIENTE = Object.freeze({
  '3cor': '3 Corações', '3coracoes': '3 Corações', trescoracoes: '3 Corações',
  anjun: 'Anjun', cci: 'CCI',
  elite: 'Elite GR', elitegr: 'Elite GR', zeni: 'Elite GR',
  gaga2: 'HH2 Risk', hh2: 'HH2 Risk', hh2risk: 'HH2 Risk',
  grparc: 'GR Parceria', grparceria: 'GR Parceria',
  gruposc: 'Grupo SC', jbs: 'JBS', komando: 'Komando', overhaul: 'Overhaul',
  rotele: 'GR Global', grglobal: 'GR Global', stratum: 'Stratum', tecnorisk: 'Tecnorisk',
  total: 'Total Express', totalexpress: 'Total Express'
});
export const CLIENTES_INTERNOS = Object.freeze(['sintetico', 'sistema', 'interno', 'gemini', 'knowledge']);
export const MARCA_INICIO = '<!-- auto:inicio (gerado automaticamente; escreva abaixo de auto:fim) -->';
export const MARCA_FIM = '<!-- auto:fim -->';
const RE_BLOCO = /<!-- auto:inicio[^>]*-->[\s\S]*?<!-- auto:fim -->/;

export function nomeArquivoSeguro(nome, max = 90) {
  let t = String(nome || '').normalize('NFC')
    .replace(/[\\/:*?"<>|#^\[\]\x00-\x1f]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/-{2,}/g, '-')
    .trim();
  if (t.length > max) t = t.slice(0, max);
  t = t.replace(/[. -]+$/, '').replace(/^[. -]+/, '');
  return t || 'sem-nome';
}

export function link(relSemExtensao, rotulo) {
  const r = String(rotulo || path.posix.basename(relSemExtensao)).replace(/[|\[\]]/g, '-');
  return '[[' + relSemExtensao + '|' + r + ']]';
}

// Texto -> chave de comparacao: sem acentos, sem espacos/simbolos, minusculo ("3 Corações" -> "3coracoes").
const chaveDe = s => String(s || '').normalize('NFD').replace(/\p{M}/gu, '')
  .replace(/[^\p{L}\p{N}]/gu, '').toLowerCase();

// Ordem: 1) prefixo do ID do caso; 2) nome inteiro do cliente (antes de ; , ( /); 3) primeira palavra (regra antiga).
export function nomeCliente(textoCliente, casoId) {
  const prefixo = chaveDe(String(casoId || '').split('-')[0]);
  if (CLIENTES_INTERNOS.includes(prefixo)) return null;
  if (ALIASES_CLIENTE[prefixo]) return ALIASES_CLIENTE[prefixo];
  const bruto = String(textoCliente || '').trim() || prefixo;
  const inteiro = chaveDe(bruto.split(/[;,(\/]/)[0]);
  if (ALIASES_CLIENTE[inteiro]) return ALIASES_CLIENTE[inteiro];
  const token = (bruto.split(/[\s,;()\/]+/).find(Boolean) || '').replace(/[^\p{L}\p{N}_-]/gu, '');
  const chave = token.toLowerCase();
  if (!chave || CLIENTES_INTERNOS.includes(chave)) return null;
  if (ALIASES_CLIENTE[chave]) return ALIASES_CLIENTE[chave];
  return token.length <= 4 ? token.toUpperCase() : token.charAt(0).toUpperCase() + token.slice(1);
}

// Artigos (6 digitos) citados explicitamente: "art. 523802", "artigo 523802", "regras 522231 e 523802", "REGRA-ART-523802".
export function artigosCitados(texto) {
  const achados = new Set();
  const re = /(?:\bart(?:igo)?s?\.?|\bregras?)\s*((?:\d{6}(?:\s*(?:,|\be\b|\/)\s*)?)+)/gi;
  for (const m of String(texto).matchAll(re)) for (const n of m[1].match(/\d{6}/g) || []) achados.add(n);
  for (const m of String(texto).matchAll(/REGRA-ART-(\d{6})\b/g)) achados.add(m[1]);
  return [...achados].sort();
}

function formatarValor(v) {
  const s = String(v ?? '').trim();
  if (/^[\p{L}\p{N}][\p{L}\p{N} ._\/-]*$/u.test(s) && !/^(true|false|null|yes|no|on|off)$/i.test(s)) return s;
  return JSON.stringify(s);
}

export function mesclarNota(atual, chaves, bloco) {
  const { linhas, corpo } = atual == null ? { linhas: null, corpo: '' } : separarFrontmatter(atual);
  const fm = linhas ? linhas.slice() : [];
  for (const [chave, valor] of chaves) {
    const nova = chave + ': ' + formatarValor(valor);
    const i = fm.findIndex(l => l.startsWith(chave + ':'));
    if (i >= 0) fm[i] = nova; else fm.push(nova);
  }
  const completo = MARCA_INICIO + '\n' + String(bloco).replace(/\s+$/, '') + '\n' + MARCA_FIM;
  let novoCorpo;
  if (RE_BLOCO.test(corpo)) novoCorpo = corpo.replace(RE_BLOCO, () => completo);
  else novoCorpo = completo + '\n' + (corpo.trim() ? '\n' + corpo.replace(/^\n+/, '') : '');
  if (!novoCorpo.endsWith('\n')) novoCorpo += '\n';
  return '---\n' + fm.join('\n') + '\n---\n' + novoCorpo;
}

function lerTexto(abs) {
  try { return fs.readFileSync(abs, 'utf8'); } catch { return null; }
}

function lerJson(abs) {
  try { return JSON.parse(fs.readFileSync(abs, 'utf8')); } catch { return null; }
}

function entradasOrdenadas(dirAbs) {
  try {
    return fs.readdirSync(dirAbs, { withFileTypes: true })
      .filter(e => !e.name.startsWith('.'))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  } catch { return []; }
}

function* arquivosRecursivos(dirAbs, rel) {
  for (const e of entradasOrdenadas(dirAbs)) {
    const r = rel + '/' + e.name;
    if (e.isDirectory()) yield* arquivosRecursivos(path.join(dirAbs, e.name), r);
    else if (e.isFile()) yield { rel: r, abs: path.join(dirAbs, e.name) };
  }
}

// Conta notas .md da subarvore, sem contar as notas-hub (arquivo com o mesmo nome da pasta).
function contarNotas(dirAbs) {
  let n = 0;
  for (const item of arquivosRecursivos(dirAbs, path.basename(dirAbs))) {
    if (!item.rel.toLowerCase().endsWith('.md')) continue;
    const partes = item.rel.split('/');
    const pasta = partes[partes.length - 2];
    if (path.posix.basename(item.rel, '.md') !== pasta) n++;
  }
  return n;
}

function dataDoId(id) {
  const m = String(id).match(/(\d{4})(\d{2})(\d{2})?$/);
  return m ? m[1] + '-' + m[2] + (m[3] ? '-' + m[3] : '') : '';
}

export function organizarVault({ rootDir }) {
  const raiz = fs.realpathSync(rootDir);
  const escritos = [];
  const avisos = [];
  const abs = rel => (rel ? path.join(raiz, ...rel.split('/')) : raiz);

  function atualizar(rel, chaves, bloco) {
    const alvo = abs(rel);
    const atual = lerTexto(alvo);
    const novo = mesclarNota(atual, chaves, bloco);
    if (novo === atual) return;
    fs.mkdirSync(path.dirname(alvo), { recursive: true });
    const tmp = path.join(path.dirname(alvo), '.' + path.basename(alvo) + '.' + crypto.randomBytes(4).toString('hex') + '.tmp');
    fs.writeFileSync(tmp, novo, 'utf8');
    fs.renameSync(tmp, alvo);
    escritos.push(rel);
  }

  // 1) Eventos por artigo (so os com artigo unico geram link).
  const eventosPorArtigo = new Map();
  if (fs.existsSync(abs(CAMINHOS.eventos))) {
    for (const item of arquivosRecursivos(abs(CAMINHOS.eventos), CAMINHOS.eventos)) {
      if (!item.rel.endsWith('.md')) continue;
      const fm = lerFrontmatter(lerTexto(item.abs) || '');
      if (fm.tipo !== 'evento' || !fm.artigo) continue;
      const lista = eventosPorArtigo.get(fm.artigo) || [];
      lista.push({ rel: item.rel.slice(0, -3), nome: path.posix.basename(item.rel, '.md') });
      eventosPorArtigo.set(fm.artigo, lista);
    }
  }

  // 2) Ficha de cada caso (a nota-hub da pasta do caso).
  const casosPorCliente = new Map();
  if (fs.existsSync(abs(CAMINHOS.casos))) {
    for (const d of entradasOrdenadas(abs(CAMINHOS.casos)).filter(e => e.isDirectory())) {
      const casoId = d.name;
      const relCaso = CAMINHOS.casos + '/' + casoId;
      const dirAbs = abs(relCaso);
      const arquivos = entradasOrdenadas(dirAbs).filter(e => e.isFile()).map(e => e.name);
      const entrada = lerJson(path.join(dirAbs, 'entrada.json')) || {};
      const notas = arquivos.filter(n => n.toLowerCase().endsWith('.md') && n !== casoId + '.md');
      const textos = notas.map(n => lerTexto(path.join(dirAbs, n)) || '');
      const veredito = notas.includes('veredito.md') ? textos[notas.indexOf('veredito.md')] : null;
      const cliente = nomeCliente(entrada.cliente, casoId);
      const resumo = encurtar(veredito ? resumoDeTexto(veredito) : (entrada.descricao || ''), 200);
      const aberto = String(entrada.criado_em || '').slice(0, 10) || dataDoId(casoId);
      const placa = String(entrada.placa || '').trim();
      const status = veredito ? 'veredito' : 'sem veredito';
      const eventos = [];
      for (const artigo of [...new Set(textos.flatMap(artigosCitados))].sort()) {
        const lista = eventosPorArtigo.get(artigo);
        if (!lista) continue;
        if (lista.length > 1) { avisos.push('artigo ' + artigo + ' ambiguo (' + lista.length + ' notas) no caso ' + casoId); continue; }
        eventos.push({ ...lista[0], artigo });
      }
      const nSql = arquivos.filter(n => n.endsWith('.sql')).length;
      const nRes = arquivos.filter(n => /^resultado-\d+\.json\.gz$/.test(n)).length;
      const relCliente = cliente ? CAMINHOS.clientes + '/' + nomeArquivoSeguro(cliente) : null;
      const cabecalho = [
        'Acima: ' + link(CAMINHOS.casos + '/casos', 'casos'),
        'Cliente: ' + (relCliente ? link(relCliente, cliente) : link(CAMINHOS.sistema + '/sistema', 'interno'))
      ];
      if (placa) cabecalho.push('Placa: ' + placa);
      if (aberto) cabecalho.push('Aberto em: ' + aberto);
      const bloco = [
        '# ' + casoId,
        cabecalho.join(' · '),
        '',
        'Resumo: ' + (resumo || '(sem resumo)'),
        '',
        'Eventos citados: ' + (eventos.length ? eventos.map(e => link(e.rel, e.nome) + ' (art. ' + e.artigo + ')').join(' · ') : '(nenhum identificado no texto do caso)'),
        'Notas do caso: ' + (notas.length ? notas.map(n => link(relCaso + '/' + n.slice(0, -3), n.slice(0, -3))).join(' · ') : '(nenhuma)'),
        'Dados brutos: ' + nSql + ' consulta(s) SQL e ' + nRes + ' resultado(s) salvos (obter_resultado RES-' + casoId + '-NN).'
      ].join('\n');
      atualizar(relCaso + '/' + casoId + '.md',
        [['tipo', 'caso'], ['cliente', cliente || 'interno'], ['placa', placa], ['aberto', aberto], ['status', status], ['resumo', resumo]],
        bloco);
      if (cliente) {
        const lista = casosPorCliente.get(cliente) || [];
        lista.push({ casoId, aberto, resumo });
        casosPorCliente.set(cliente, lista);
      }
    }
  }

  // 3) Uma nota por cliente (clientes sem casos continuam existindo, com a lista vazia).
  const clientes = new Map([...casosPorCliente.entries()]);
  for (const e of entradasOrdenadas(abs(CAMINHOS.clientes)).filter(x => x.isFile() && x.name.endsWith('.md'))) {
    const nome = e.name.slice(0, -3);
    if (nome === path.posix.basename(CAMINHOS.clientes)) continue;
    if (lerFrontmatter(lerTexto(path.join(abs(CAMINHOS.clientes), e.name)) || '').tipo !== 'cliente') continue;
    if (![...clientes.keys()].some(c => nomeArquivoSeguro(c) === nome)) clientes.set(nome, []);
  }
  for (const [cliente, casos] of [...clientes.entries()].sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'))) {
    casos.sort((a, b) => (b.aberto || '').localeCompare(a.aberto || '') || b.casoId.localeCompare(a.casoId));
    const bloco = [
      '# ' + cliente,
      'Acima: ' + link(CAMINHOS.clientes + '/clientes', 'clientes'),
      '',
      '**Casos (' + casos.length + ')**',
      ...(casos.length ? casos.map(c => '- ' + link(CAMINHOS.casos + '/' + c.casoId + '/' + c.casoId, c.casoId) +
        (c.aberto ? ' (' + c.aberto + ')' : '') + (c.resumo ? ' — ' + encurtar(c.resumo, 100) : '')) : ['(nenhum caso)'])
    ].join('\n');
    atualizar(CAMINHOS.clientes + '/' + nomeArquivoSeguro(cliente) + '.md', [['tipo', 'cliente']], bloco);
  }

  // 4) Nota-hub de cada pasta. Cada pasta da raiz e o topo de uma arvore propria (trafegus, projetos, empresa...):
  //    as arvores nao sao ligadas entre si. Pastas de caso usam a ficha como hub.
  const pastas = [];
  (function coletar(rel) {
    for (const e of entradasOrdenadas(abs(rel)).filter(x => x.isDirectory())) {
      if (!rel && PASTAS_SEM_HUB.has(e.name)) continue;
      if (rel === CAMINHOS.casos) continue;
      const r = rel ? rel + '/' + e.name : e.name;
      pastas.push(r);
      coletar(r);
    }
  })('');
  for (const rel of pastas) {
    const nome = path.posix.basename(rel);
    const relNota = rel + '/' + nome + '.md';
    const entradas = entradasOrdenadas(abs(rel));
    const sub = entradas.filter(e => e.isDirectory());
    const notas = entradas.filter(e => e.isFile() && e.name.toLowerCase().endsWith('.md') && e.name !== nome + '.md');
    const linhas = ['# ' + nome];
    const pai = path.posix.dirname(rel);
    if (pai !== '.') linhas.push('Acima: ' + link(pai + '/' + path.posix.basename(pai), path.posix.basename(pai)));
    if (sub.length) {
      linhas.push('', '**Pastas**');
      for (const s of sub) {
        const rs = rel ? rel + '/' + s.name : s.name;
        const n = contarNotas(abs(rs));
        linhas.push('- ' + link(rs + '/' + s.name, s.name) + ' (' + n + (n === 1 ? ' nota)' : ' notas)'));
      }
    }
    if (notas.length) {
      linhas.push('', '**Notas**');
      for (const n of notas) linhas.push('- ' + link((rel ? rel + '/' : '') + n.name.slice(0, -3), n.name.slice(0, -3)));
    }
    if (!sub.length && !notas.length) linhas.push('', '(vazio por enquanto)');
    atualizar(relNota, [['tipo', 'hub']], linhas.join('\n'));
  }

  return { escritos, avisos };
}

