// Mantem as cores do grafico do Obsidian por arvore/ramo. Rodado pelo cron depois do organizador.
// Uso: node scripts/vault-cores-grafico.mjs [/srv/vault]
import { atualizarCoresGrafico } from '../mcp/lib/vault-cores.mjs';

const raiz = process.argv[2] || '/srv/vault';
try {
  if (atualizarCoresGrafico({ rootDir: raiz })) console.log(new Date().toISOString() + ' cores do grafico atualizadas');
} catch (e) {
  console.log(new Date().toISOString() + ' cores do grafico: erro ' + e.message);
}
