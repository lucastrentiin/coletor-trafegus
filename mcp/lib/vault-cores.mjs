// Mantem as cores do grafico do Obsidian (.obsidian/graph.json -> colorGroups) e da barra lateral (CSS):
// cada arvore (pasta da raiz) tem uma cor principal; cada subpasta, em qualquer nivel, ganha um tom dessa cor,
// mais claro quanto mais fundo, com uma pequena variacao entre irmas. Pastas mais fundas vem primeiro na lista
// (o primeiro grupo que casa vence no Obsidian). Grupos do usuario com outro tipo de consulta (tag:, file:...)
// ficam no topo, intactos. Se o usuario trocar a cor de um grupo gerado, a cor dele e mantida
// (o ultimo valor gerado fica em .obsidian/cores-auto.json para saber o que foi trocado a mao).
import fs from 'node:fs';
import path from 'node:path';

const SEM_COR = new Set(['templates']);
export const MATIZ_ARVORE = Object.freeze({ trafegus: 4, projetos: 140, servidor: 210 });

const pastas = dir => fs.readdirSync(dir, { withFileTypes: true })
  .filter(e => e.isDirectory() && !e.name.startsWith('.')).map(e => e.name).sort((a, b) => a.localeCompare(b));

export const consultaDe = pasta => `path:"${pasta}/"`;
// "path:trafegus/casos", 'path:"trafegus/casos/"' -> "trafegus/casos"; outras consultas -> null
export function pastaDaConsulta(q) {
  const m = String(q || '').trim().match(/^path:\s*(?:"([^"]+)"|(\S+))$/);
  return m ? (m[1] || m[2]).replace(/\/+$/, '') : null;
}

export function hslParaRgb(h, s, l) {
  s /= 100; l /= 100;
  const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = n => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))));
  return (f(0) << 16) | (f(8) << 8) | f(4);
}

// Todas as pastas (qualquer profundidade) com a cor automatica de cada uma.
export function coresAutomaticas(rootDir) {
  const raizes = pastas(rootDir).filter(a => !SEM_COR.has(a));
  const livres = [280, 45, 320, 175, 250, 75, 300, 100, 190, 20];
  let n = 0;
  const matizDe = a => MATIZ_ARVORE[a] ?? livres[n++ % livres.length];
  const saida = [];
  const andar = (rel, matiz, prof) => {
    const l = Math.min(42 + prof * 10, 82), s = Math.max(78 - prof * 8, 38);
    saida.push({ pasta: rel, prof, rgb: hslParaRgb(((matiz % 360) + 360) % 360, s, l) });
    const filhas = pastas(path.join(rootDir, rel));
    const passo = filhas.length > 1 ? Math.min(10, 36 / (filhas.length - 1)) : 0;
    filhas.forEach((f, i) => andar(rel + '/' + f, matiz + (i - (filhas.length - 1) / 2) * passo, prof + 1));
  };
  for (const a of raizes) andar(a, matizDe(a), 0);
  return saida.sort((x, y) => y.prof - x.prof || x.pasta.localeCompare(y.pasta));
}

export function gruposDeCor(rootDir, gruposAtuais = [], autoAnterior = {}) {
  const doUsuario = [], corAtual = new Map();
  for (const g of Array.isArray(gruposAtuais) ? gruposAtuais : []) {
    const p = pastaDaConsulta(g && g.query);
    if (p == null) doUsuario.push(g);
    else if (g.color && Number.isInteger(g.color.rgb) && !corAtual.has(p)) corAtual.set(p, g.color.rgb);
  }
  const auto = {};
  const gerados = coresAutomaticas(rootDir).map(({ pasta, rgb }) => {
    auto[pasta] = rgb;
    const atual = corAtual.get(pasta);
    const trocadaMao = atual != null && autoAnterior[pasta] != null && atual !== autoAnterior[pasta];
    return { query: consultaDe(pasta), color: { a: 1, rgb: trocadaMao ? atual : rgb } };
  });
  return { grupos: [...doUsuario, ...gerados], auto };
}

// CSS da barra lateral com as mesmas cores do grafico. Pastas rasas primeiro e fundas depois,
// para a mais especifica vencer (mesma especificidade, a ultima regra vale).
export const NOME_SNIPPET = 'cores-pastas';
export function cssDasPastas(grupos) {
  const hex = n => '#' + n.toString(16).padStart(6, '0');
  const esc = p => p.replace(/["\\]/g, '\\$&');
  const porPasta = grupos.map(g => [pastaDaConsulta(g.query), g.color && g.color.rgb])
    .filter(([p, c]) => p && Number.isInteger(c))
    .sort((a, b) => a[0].split('/').length - b[0].split('/').length || a[0].localeCompare(b[0]));
  const regras = porPasta.map(([p, c]) => {
    const q = esc(p);
    return `.nav-folder-title[data-path="${q}"], .nav-file-title[data-path^="${q}/"] { color: ${hex(c)}; }\n` +
      `.nav-folder-title[data-path="${q}"] + .nav-folder-children { border-left: 2px solid ${hex(c)}; }`;
  });
  return '/* Gerado automaticamente pelo servidor (vault-cores). Mesmas cores do grafico. Nao edite. */\n' + regras.join('\n') + '\n';
}

function lerJson(arq) {
  if (!fs.existsSync(arq)) return {};
  return JSON.parse(fs.readFileSync(arq, 'utf8')); // erro sobe: quem chama decide
}
function gravarSeMudou(arq, texto) {
  if (fs.existsSync(arq) && fs.readFileSync(arq, 'utf8') === texto) return false;
  fs.mkdirSync(path.dirname(arq), { recursive: true });
  const tmp = arq + '.tmp-' + process.pid;
  fs.writeFileSync(tmp, texto);
  fs.renameSync(tmp, arq);
  return true;
}

// Grava so quando muda. Retorna true se gravou algo.
// graph.json (cores), snippets/cores-pastas.css (barra lateral), appearance.json (liga o snippet), cores-auto.json.
export function atualizarCoresGrafico({ rootDir }) {
  const dir = path.join(rootDir, '.obsidian');
  const arqGrafico = path.join(dir, 'graph.json'), arqAparencia = path.join(dir, 'appearance.json'), arqAuto = path.join(dir, 'cores-auto.json');
  let grafico, aparencia, autoAnterior;
  try { grafico = lerJson(arqGrafico); aparencia = lerJson(arqAparencia); autoAnterior = lerJson(arqAuto); } catch { return false; } // em escrita/corrompido: tenta na proxima
  let mudou = false;
  const { grupos, auto } = gruposDeCor(rootDir, grafico.colorGroups, autoAnterior);
  if (JSON.stringify(grupos) !== JSON.stringify(grafico.colorGroups || []))
    mudou = gravarSeMudou(arqGrafico, JSON.stringify({ ...grafico, colorGroups: grupos }, null, 2)) || mudou;
  mudou = gravarSeMudou(arqAuto, JSON.stringify(auto, null, 2)) || mudou;
  mudou = gravarSeMudou(path.join(dir, 'snippets', NOME_SNIPPET + '.css'), cssDasPastas(grupos)) || mudou;
  const ligados = Array.isArray(aparencia.enabledCssSnippets) ? aparencia.enabledCssSnippets : [];
  if (!ligados.includes(NOME_SNIPPET))
    mudou = gravarSeMudou(arqAparencia, JSON.stringify({ ...aparencia, enabledCssSnippets: [...ligados, NOME_SNIPPET] }, null, 2)) || mudou;
  return mudou;
}
