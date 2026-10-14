import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// Pastas que as tools nao podem alterar (o Lucas edita pelo Obsidian; o organizador gera os hubs).
export const PASTAS_PROTEGIDAS = Object.freeze(['templates', 'trafegus/conhecimento']);
// Subarvores resumidas no indice por contagem, uma linha por subpasta.
export const PASTAS_RESUMIDAS = Object.freeze(['trafegus/conhecimento/eventos']);
export const MAX_LEITURA = 8000;
export const MAX_ESCRITA_BYTES = 100 * 1024;
const MAX_LISTAGEM = 200;
const MAX_INDICE = 8000;
const MAX_NOTAS_POR_PASTA = 12;
const MAX_CASOS_NO_INDICE = 15;
const TRECHO = 200;

// chave=valor com nome de segredo; valor so com maiusculas e _ e nome de variavel (ex: CEREBRO_TOKEN), nao segredo.
const RE_CHAVE_VALOR = /(password|passwd|senha|secret|api[_-]?key|token)\w*\s*[:=]\s*["']?([^\s"'<]{6,})/gi;
const PADROES_SEGREDO = [
  /\b[a-z][a-z0-9+.-]{0,20}:\/\/[^\s:@\/]{1,200}:[^\s@\/]{1,200}@/i,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /(sk-[A-Za-z0-9_-]{16,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{30,})/
];

export function pareceSegredo(texto) {
  const t = String(texto);
  for (const m of t.matchAll(RE_CHAVE_VALOR)) if (!/^[A-Z][A-Z0-9_]*$/.test(m[2])) return true;
  return PADROES_SEGREDO.some(re => re.test(t));
}

export function normalizarBusca(texto) {
  return String(texto).normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

function erro(msg) { return new Error(msg); }

// Separa o frontmatter YAML (linhas brutas) do corpo. Sem frontmatter valido: linhas = null.
export function separarFrontmatter(texto) {
  const t = String(texto ?? '');
  if (!/^---\r?\n/.test(t)) return { linhas: null, corpo: t };
  const inicioLinhas = t.indexOf('\n') + 1;
  let i = inicioLinhas;
  while (i <= t.length) {
    let fimLinha = t.indexOf('\n', i);
    if (fimLinha < 0) fimLinha = t.length;
    const linha = t.slice(i, fimLinha).replace(/\r$/, '');
    if (linha.trim() === '---') {
      const bruto = t.slice(inicioLinhas, i).replace(/\r/g, '');
      const linhas = bruto ? bruto.replace(/\n$/, '').split('\n') : [];
      return { linhas, corpo: t.slice(Math.min(t.length, fimLinha + 1)) };
    }
    if (fimLinha >= t.length) break;
    i = fimLinha + 1;
  }
  return { linhas: null, corpo: t };
}

function valorFrontmatter(bruto) {
  const v = bruto.trim();
  if (v.startsWith('"')) { try { return String(JSON.parse(v)); } catch { /* segue */ } }
  return v.replace(/^["']|["']$/g, '');
}

export function lerFrontmatter(texto) {
  const dados = {};
  const { linhas } = separarFrontmatter(texto);
  for (const linha of linhas || []) {
    const m = linha.match(/^([A-Za-z_][\w-]*)\s*:\s*(.*)$/);
    if (m) dados[m[1].toLowerCase()] = valorFrontmatter(m[2]);
  }
  return dados;
}

export function ehHub(texto) {
  return lerFrontmatter(texto).tipo === 'hub';
}

function limparMarkdown(texto) {
  return String(texto)
    .replace(/\[\[([^\]|]*\|)?([^\]]*)\]\]/g, '$2')
    .replace(/\*\*|__|\x60/g, '')
    .replace(/(^|\s)[*_]+(?=\S)/g, '$1')
    .replace(/(\S)[*_]+(?=\s|$|[.,;:!?)])/g, '$1')
    .replace(/^[-+>]\s+/, '')
    .trim();
}

// Resumo de uma nota em uma linha: frontmatter resumo/tarefa, linha "Resumo:", secao Resumo/Conclusao,
// ou a primeira linha de texto que nao seja titulo, comentario ou metadado.
export function resumoDeTexto(texto) {
  const fm = lerFrontmatter(texto);
  if (fm.resumo) return fm.resumo;
  if (fm.tarefa) return fm.tarefa;
  const linhas = separarFrontmatter(texto).corpo.split(/\r?\n/);
  for (const l of linhas) {
    const m = l.match(/^\s*[*_]*\s*resumo\s*[*_]*\s*:\s*[*_]*\s*(\S.*)$/i);
    if (m) return limparMarkdown(m[1]);
  }
  for (let i = 0; i < linhas.length; i++) {
    if (!/^#{1,6}\s*(resumo|conclus[aã]o)\b/i.test(linhas[i])) continue;
    for (let j = i + 1; j < linhas.length; j++) {
      const t = linhas[j].trim();
      if (!t) continue;
      if (/^#{1,6}\s/.test(t)) break;
      return limparMarkdown(t);
    }
  }
  let dentroDeCodigo = false;
  for (const l of linhas) {
    const t = l.trim();
    if (/^(\x60{3}|~{3})/.test(t)) { dentroDeCodigo = !dentroDeCodigo; continue; }
    if (dentroDeCodigo || !t || t.startsWith('<!--') || /^#{1,6}\s/.test(t)) continue;
    if (/^[*_]*(autor|caso|cliente|an[aá]lise|acima|tipo)\b/i.test(t)) continue;
    return limparMarkdown(t);
  }
  for (const l of linhas) {
    const m = l.match(/^#{1,6}\s+(.+)/);
    if (m) return limparMarkdown(m[1]);
  }
  return '';
}

export function encurtar(texto, max = 120) {
  const t = String(texto || '').replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max - 1) + '…' : t;
}

function lerInicio(abs, bytes = 4096) {
  let fd;
  try {
    fd = fs.openSync(abs, 'r');
    const buf = Buffer.alloc(bytes);
    const n = fs.readSync(fd, buf, 0, bytes, 0);
    return buf.subarray(0, n).toString('utf8');
  } catch { return ''; } finally { if (fd !== undefined) fs.closeSync(fd); }
}

const porNome = (a, b) => a.name.localeCompare(b.name, 'pt-BR');

export function createVault({ rootDir, logPath = null, agora = () => new Date() }) {
  const raiz = fs.realpathSync(rootDir);

  function segmentos(relativo, { permitirRaiz = false } = {}) {
    const bruto = relativo === undefined || relativo === null ? '' : String(relativo);
    if (bruto.includes('\0') || bruto.includes('\\')) throw erro('Caminho nao permitido.');
    if (bruto.startsWith('/') || /^[A-Za-z]:/.test(bruto)) throw erro('Caminho nao permitido: use caminho relativo ao vault.');
    const segs = bruto.split('/').filter(s => s !== '' && s !== '.');
    if (segs.some(s => s === '..')) throw erro('Caminho nao permitido.');
    if (segs.some(s => s.startsWith('.'))) throw erro('Pastas e arquivos ocultos nao sao acessiveis.');
    if (!segs.length && !permitirRaiz) throw erro('Informe um caminho.');
    return segs;
  }

  function dentroDaRaiz(real) {
    return real === raiz || real.startsWith(raiz + path.sep);
  }

  function resolver(relativo, opcoes) {
    const segs = segmentos(relativo, opcoes);
    const alvo = path.join(raiz, ...segs);
    let existente = alvo;
    while (!fs.existsSync(existente)) existente = path.dirname(existente);
    const real = fs.realpathSync(existente);
    if (!dentroDaRaiz(real)) throw erro('Caminho nao permitido: sai do vault.');
    return { segs, alvo, relativo: segs.join('/') };
  }

  function exigirArquivo(alvo) {
    if (!fs.existsSync(alvo)) throw erro('Nota nao encontrada.');
    if (!fs.statSync(alvo).isFile()) throw erro('O caminho nao e um arquivo.');
  }

  function validarEscrita(segs) {
    if (segs.length < 2) throw erro('Escrita na raiz do vault nao e permitida: use um galho (ex: trafegus/tarefas/, empresa/, inbox/).');
    const rel = segs.join('/').toLowerCase();
    for (const p of PASTAS_PROTEGIDAS) {
      if (rel === p || rel.startsWith(p + '/')) throw erro('Pasta somente leitura para as tools: ' + p + '/.');
    }
    if (!segs[segs.length - 1].toLowerCase().endsWith('.md')) throw erro('Escrita permitida somente em arquivos .md.');
  }

  function validarConteudo(conteudo) {
    if (Buffer.byteLength(conteudo, 'utf8') > MAX_ESCRITA_BYTES) throw erro('Nota excede o limite de 100 KB.');
    if (pareceSegredo(conteudo)) throw erro('Conteudo parece conter segredo (senha, token, chave ou string de conexao). Segredos nao vao para o vault.');
  }

  function gravarAtomico(alvo, conteudo) {
    fs.mkdirSync(path.dirname(alvo), { recursive: true });
    const tmp = path.join(path.dirname(alvo), '.' + path.basename(alvo) + '.' + crypto.randomBytes(4).toString('hex') + '.tmp');
    fs.writeFileSync(tmp, conteudo, 'utf8');
    fs.renameSync(tmp, alvo);
  }

  function registrar(acao, relativo, bytes) {
    if (!logPath) return;
    try {
      fs.appendFileSync(logPath, JSON.stringify({ timestamp: agora().toISOString(), acao, caminho: relativo, bytes }) + '\n', 'utf8');
    } catch (e) { console.error('Falha ao registrar escrita no vault:', e.message); }
  }

  function* percorrer(dir, rel = '') {
    let entradas;
    try { entradas = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    entradas.sort(porNome);
    for (const e of entradas) {
      if (e.name.startsWith('.')) continue;
      const r = rel ? rel + '/' + e.name : e.name;
      if (e.isDirectory()) { yield { tipo: 'pasta', rel: r, abs: path.join(dir, e.name) }; yield* percorrer(path.join(dir, e.name), r); }
      else if (e.isFile()) yield { tipo: 'arquivo', rel: r, abs: path.join(dir, e.name) };
    }
  }

  function listar({ pasta, recursivo = false } = {}) {
    const { alvo, relativo } = resolver(pasta, { permitirRaiz: true });
    if (!fs.existsSync(alvo) || !fs.statSync(alvo).isDirectory()) throw erro('Pasta nao encontrada.');
    const itens = [];
    let truncado = false;
    const fonte = recursivo ? percorrer(alvo, relativo) : (function* () {
      const entradas = fs.readdirSync(alvo, { withFileTypes: true }).filter(e => !e.name.startsWith('.')).sort(porNome);
      for (const e of entradas) yield { tipo: e.isDirectory() ? 'pasta' : 'arquivo', rel: relativo ? relativo + '/' + e.name : e.name, abs: path.join(alvo, e.name) };
    })();
    for (const item of fonte) {
      if (itens.length >= MAX_LISTAGEM) { truncado = true; break; }
      const st = fs.statSync(item.abs);
      itens.push({ caminho: item.rel + (item.tipo === 'pasta' ? '/' : ''), tamanho: item.tipo === 'pasta' ? null : st.size, modificado: st.mtime.toISOString() });
    }
    return { pasta: relativo || '.', itens, truncado };
  }

  function ler({ caminho, inicio = 0, limite = MAX_LEITURA }) {
    const { alvo, relativo } = resolver(caminho);
    exigirArquivo(alvo);
    const texto = fs.readFileSync(alvo, 'utf8');
    const ini = Math.max(0, Math.trunc(inicio));
    const lim = Math.min(MAX_LEITURA, Math.max(1, Math.trunc(limite)));
    const fim = Math.min(texto.length, ini + lim);
    return { caminho: relativo, total_caracteres: texto.length, inicio: ini, fim, ha_mais: fim < texto.length, proximo_inicio: fim < texto.length ? fim : null, conteudo: texto.slice(ini, fim) };
  }

  function buscar({ termo, pasta, limite = 10 }) {
    const agulha = normalizarBusca(String(termo || '').trim());
    if (agulha.length < 2) throw erro('Termo precisa ter ao menos 2 caracteres.');
    const max = Math.min(30, Math.max(1, Math.trunc(limite)));
    const { alvo, relativo } = resolver(pasta, { permitirRaiz: true });
    if (!fs.existsSync(alvo) || !fs.statSync(alvo).isDirectory()) throw erro('Pasta nao encontrada.');
    const resultados = [];
    let truncado = false;
    for (const item of percorrer(alvo, relativo)) {
      if (item.tipo !== 'arquivo' || !item.rel.toLowerCase().endsWith('.md')) continue;
      if (normalizarBusca(item.rel).includes(agulha)) {
        if (resultados.length >= max) { truncado = true; break; }
        resultados.push({ caminho: item.rel, linha: 0, trecho: '(nome do arquivo)' });
      }
      const linhas = fs.readFileSync(item.abs, 'utf8').split(/\r?\n/);
      for (let i = 0; i < linhas.length; i++) {
        const pos = normalizarBusca(linhas[i]).indexOf(agulha);
        if (pos < 0) continue;
        if (resultados.length >= max) { truncado = true; break; }
        const ini = Math.max(0, pos - Math.floor(TRECHO / 2));
        resultados.push({ caminho: item.rel, linha: i + 1, trecho: linhas[i].slice(ini, ini + TRECHO).trim() });
      }
      if (truncado) break;
    }
    return { termo, resultados, truncado };
  }

  function escrever({ caminho, conteudo, modo }) {
    if (!['criar', 'substituir', 'anexar'].includes(modo)) throw erro('Modo invalido: use criar, substituir ou anexar.');
    const { segs, alvo, relativo } = resolver(caminho);
    validarEscrita(segs);
    const texto = String(conteudo ?? '');
    const existe = fs.existsSync(alvo);
    if (existe && !fs.statSync(alvo).isFile()) throw erro('O caminho nao e um arquivo.');
    if (modo === 'criar' && existe) throw erro('A nota ja existe. Use modo substituir, anexar ou vault_editar.');
    if (modo === 'anexar' && !existe) throw erro('A nota nao existe. Use modo criar.');
    let final = texto;
    if (modo === 'anexar') {
      const atual = fs.readFileSync(alvo, 'utf8');
      final = atual + (atual.endsWith('\n') || !atual ? '' : '\n') + texto;
    }
    validarConteudo(texto);
    validarConteudo(final);
    gravarAtomico(alvo, final);
    const bytes = Buffer.byteLength(final, 'utf8');
    registrar('escrever:' + modo, relativo, bytes);
    return { ok: true, caminho: relativo, modo, bytes };
  }

  function editar({ caminho, trecho_antigo, trecho_novo }) {
    const { segs, alvo, relativo } = resolver(caminho);
    validarEscrita(segs);
    exigirArquivo(alvo);
    const antigo = String(trecho_antigo ?? '');
    if (!antigo) throw erro('trecho_antigo nao pode ser vazio.');
    const atual = fs.readFileSync(alvo, 'utf8');
    const ocorrencias = atual.split(antigo).length - 1;
    if (ocorrencias === 0) throw erro('trecho_antigo nao encontrado na nota.');
    if (ocorrencias > 1) throw erro('trecho_antigo aparece ' + ocorrencias + ' vezes; inclua mais contexto para ficar unico.');
    const novo = String(trecho_novo ?? '');
    validarConteudo(novo);
    const final = atual.replace(antigo, () => novo);
    validarConteudo(final);
    gravarAtomico(alvo, final);
    const bytes = Buffer.byteLength(final, 'utf8');
    registrar('editar', relativo, bytes);
    return { ok: true, caminho: relativo, bytes };
  }

  // ---------- indice ----------

  function lerJson(abs) {
    try { return JSON.parse(fs.readFileSync(abs, 'utf8')); } catch { return null; }
  }

  function infoCaso(dirAbs, nome) {
    const ficha = path.join(dirAbs, nome + '.md');
    const fm = fs.existsSync(ficha) ? lerFrontmatter(lerInicio(ficha)) : {};
    const entrada = lerJson(path.join(dirAbs, 'entrada.json')) || {};
    const veredito = path.join(dirAbs, 'veredito.md');
    const temVeredito = fs.existsSync(veredito);
    const resumo = fm.resumo || (temVeredito ? resumoDeTexto(lerInicio(veredito)) : (entrada.descricao || ''));
    const cliente = fm.cliente || '';
    return {
      aberto: fm.aberto || String(entrada.criado_em || '').slice(0, 10),
      status: fm.status || (temVeredito ? 'veredito' : 'sem veredito'),
      resumo: (cliente && cliente !== 'interno' ? cliente + ': ' : '') + resumo
    };
  }

  function linhasCasos(abs, rel) {
    let dirs;
    try { dirs = fs.readdirSync(abs, { withFileTypes: true }).filter(d => d.isDirectory() && !d.name.startsWith('.')); } catch { return []; }
    const casos = dirs.map(d => ({ nome: d.name, ...infoCaso(path.join(abs, d.name), d.name) }))
      .sort((a, b) => (b.aberto || '').localeCompare(a.aberto || '') || b.nome.localeCompare(a.nome));
    const saida = ['- ' + rel + '/: ' + casos.length + ' casos (mais recentes primeiro)'];
    for (const c of casos.slice(0, MAX_CASOS_NO_INDICE)) {
      saida.push('  - ' + rel + '/' + c.nome + '/ [' + c.status + (c.aberto ? ' ' + c.aberto : '') + '] ' + encurtar(c.resumo, 110));
    }
    if (casos.length > MAX_CASOS_NO_INDICE) saida.push('  - (+' + (casos.length - MAX_CASOS_NO_INDICE) + ' mais antigos: vault_listar ' + rel + ')');
    return saida;
  }

  function contarNotas(abs) {
    let n = 0;
    for (const item of percorrer(abs)) if (item.tipo === 'arquivo' && item.rel.toLowerCase().endsWith('.md') && !ehHub(lerInicio(item.abs, 512))) n++;
    return n;
  }

  function descrever(abs, rel, saida) {
    const nome = path.basename(rel);
    if (nome === 'tarefas') return;
    if (nome === 'casos') { saida.push(...linhasCasos(abs, rel)); return; }
    let entradas;
    try { entradas = fs.readdirSync(abs, { withFileTypes: true }).filter(e => !e.name.startsWith('.')).sort(porNome); } catch { return; }
    if (PASTAS_RESUMIDAS.includes(rel)) {
      for (const d of entradas.filter(e => e.isDirectory())) saida.push('- ' + rel + '/' + d.name + '/: ' + contarNotas(path.join(abs, d.name)) + ' notas');
      return;
    }
    const notas = entradas
      .filter(e => e.isFile() && e.name.toLowerCase().endsWith('.md'))
      .map(e => ({ rel: rel + '/' + e.name, texto: lerInicio(path.join(abs, e.name)) }))
      .filter(n => !ehHub(n.texto));
    if (notas.length > MAX_NOTAS_POR_PASTA) {
      saida.push('- ' + rel + '/: ' + notas.length + ' notas (vault_listar ou vault_buscar)');
    } else {
      for (const n of notas) {
        const fm = lerFrontmatter(n.texto);
        saida.push('- ' + n.rel + (fm.status ? ' [' + fm.status + ']' : '') + ' - ' + encurtar(resumoDeTexto(n.texto)));
      }
    }
    for (const d of entradas.filter(e => e.isDirectory())) descrever(path.join(abs, d.name), rel + '/' + d.name, saida);
  }

  function indice() {
    const tarefas = [];
    for (const item of percorrer(raiz)) {
      if (item.tipo !== 'arquivo' || !item.rel.toLowerCase().endsWith('.md')) continue;
      const segs = item.rel.split('/');
      if (segs[0] === 'templates' || !segs.slice(0, -1).includes('tarefas')) continue;
      const texto = lerInicio(item.abs);
      if (ehHub(texto)) continue;
      tarefas.push({ rel: item.rel, status: lerFrontmatter(texto).status || '', resumo: resumoDeTexto(texto) });
    }
    const abertas = tarefas.filter(t => !/conclu/i.test(t.status));
    const concluidas = tarefas.length - abertas.length;
    const secoes = ['## Tarefas em andamento\n' +
      (abertas.map(t => '- ' + t.rel + (t.status ? ' [' + t.status + ']' : '') + ' - ' + encurtar(t.resumo)).join('\n') || '(nenhuma)') +
      (concluidas ? '\n(' + concluidas + ' concluida(s) ficam fora desta lista)' : '')];

    const galhos = fs.readdirSync(raiz, { withFileTypes: true })
      .filter(d => d.isDirectory() && !d.name.startsWith('.') && d.name !== 'templates')
      .sort(porNome);
    for (const g of galhos) {
      const linhas = [];
      descrever(path.join(raiz, g.name), g.name, linhas);
      secoes.push('## ' + g.name + '\n' + (linhas.join('\n') || '(vazio)'));
    }

    let texto = '# Indice do cerebro (gerado automaticamente)\n' +
      'Arvore: cada pasta e um galho com nota-hub de mesmo nome. Protocolo: COMO-USAR.md. Detalhe: vault_buscar -> vault_ler.\n\n' +
      secoes.join('\n\n') + '\n';
    let truncado = false;
    if (texto.length > MAX_INDICE) {
      texto = texto.slice(0, MAX_INDICE - 80).replace(/\n[^\n]*$/, '') + '\n\n(indice truncado: use vault_listar ou vault_buscar)\n';
      truncado = true;
    }
    return { conteudo: texto, truncado };
  }

  return { raiz, listar, ler, buscar, escrever, editar, indice };
}
