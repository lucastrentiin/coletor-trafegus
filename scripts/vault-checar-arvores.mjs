// Confere que cada link [[...]] aponta para a mesma arvore (pasta da raiz) da nota onde esta.
// Notas soltas na raiz (ex.: COMO-USAR.md) nao podem ter links. Uso: node scripts/vault-checar-arvores.mjs [/srv/vault]
import fs from 'node:fs';
import path from 'node:path';

const raiz = process.argv[2] || '/srv/vault';
const cruzados = [];
const arvoreDe = rel => (rel.includes('/') ? rel.split('/')[0] : null);

(function andar(dir, rel) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue;
    const r = rel ? rel + '/' + e.name : e.name;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { andar(p, r); continue; }
    if (!e.name.endsWith('.md')) continue;
    const texto = fs.readFileSync(p, 'utf8');
    for (const m of texto.matchAll(/\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/g)) {
      const alvo = m[1].trim();
      if (arvoreDe(r) !== arvoreDe(alvo)) cruzados.push(r + ' -> ' + alvo);
    }
  }
})(raiz, '');

if (cruzados.length) {
  console.log('LINKS_ENTRE_ARVORES=' + cruzados.length);
  console.log(cruzados.slice(0, 30).join('\n'));
  process.exit(1);
}
console.log('ARVORES_OK');
