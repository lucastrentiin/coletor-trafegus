// Gera servidor/uso-do-cerebro.md. Rodado pelo cron depois do organizador.
// Uso: node scripts/vault-uso-relatorio.mjs /srv/vault <log-uso-1.jsonl> [<log-uso-2.jsonl> ...]
import { gerarRelatorioUso } from '../mcp/lib/vault-uso.mjs';

const [raiz = '/srv/vault', ...arquivosLog] = process.argv.slice(2);
try {
  if (gerarRelatorioUso({ rootDir: raiz, arquivosLog })) console.log(new Date().toISOString() + ' uso do cerebro atualizado');
} catch (e) {
  console.log(new Date().toISOString() + ' uso do cerebro: erro ' + e.message);
}
