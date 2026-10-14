// Atualiza a arvore do vault (hubs, fichas de caso, notas de cliente). Rodado pelo cron a cada 15 min.
// Uso: node scripts/vault-organizar.mjs [/srv/vault]
import { organizarVault } from '../mcp/lib/vault-organizar.mjs';

const raiz = process.argv[2] || '/srv/vault';
const r = organizarVault({ rootDir: raiz });
if (r.escritos.length || r.avisos.length) {
  console.log(new Date().toISOString() + ' escritos=' + r.escritos.length + ' ' + JSON.stringify(r));
}
