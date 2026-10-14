// Depois de renomear o galho coletor/ -> trafegus/ no vault: corrige a linha "Tipo: [[coletor/conhecimento/eventos/..."
// das notas de evento (fica antes da secao da regra) e confere que o indice de regras continua identico.
// Uso: node scripts/vault-trafegus-links.mjs /srv/vault/trafegus/conhecimento
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createKnowledgeIndex } from '../mcp/lib/knowledge-index.mjs';

const dir = process.argv[2];
if (!dir) { console.error('uso: node scripts/vault-trafegus-links.mjs <dir conhecimento>'); process.exit(2); }
const ANTIGO = 'Tipo: [[coletor/conhecimento/eventos/';
const NOVO = 'Tipo: [[trafegus/conhecimento/eventos/';

function falhar(msg) {
  console.error('FALHA: ' + msg);
  process.exit(1);
}

function indexar(arquivo) {
  createKnowledgeIndex({ rootDir: dir, indexPath: arquivo }).stats();
  return JSON.parse(fs.readFileSync(arquivo, 'utf8')).entries.map(e => [e.regra_id, e.documento, e.sha256, e.caracteres].join('|')).sort();
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-links-'));
const antes = indexar(path.join(tmp, 'antes.json'));
const pendentes = [];
(function andar(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) { andar(p); continue; }
    if (!e.name.endsWith('.md')) continue;
    const t = fs.readFileSync(p, 'utf8');
    const i = t.indexOf(ANTIGO);
    if (i < 0) continue;
    const h2 = t.indexOf('\n## ');
    if (h2 < 0 || i > h2) falhar('link antigo fora do cabecalho: ' + p);
    if (t.split(ANTIGO).length !== 2) falhar('mais de um link antigo: ' + p);
    const novo = t.slice(0, i) + NOVO + t.slice(i + ANTIGO.length);
    if (novo.slice(novo.indexOf('\n## ')) !== t.slice(h2)) falhar('secao da regra seria alterada: ' + p);
    pendentes.push([p, novo]);
  }
})(path.join(dir, 'eventos'));
for (const [p, novo] of pendentes) fs.writeFileSync(p, novo, 'utf8');
const depois = indexar(path.join(tmp, 'depois.json'));
if (antes.length !== depois.length || antes.some((x, k) => x !== depois[k])) falhar('indice de regras mudou');
console.log('LINKS_OK alterados=' + pendentes.length + ' regras=' + depois.length);
