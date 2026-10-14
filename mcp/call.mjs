// Cliente stdio que fala com o servidor MCP coletor-trafegus (server.mjs).
// Uso:
//   node call.mjs clientes
//   node call.mjs query <clientId> <arquivo.sql> [nome]
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const [, , cmd, a1, a2, a3] = process.argv;

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [path.join(__dirname, 'server.mjs')]
});
const client = new Client({ name: 'call-cli', version: '1.0.0' }, { capabilities: {} });
await client.connect(transport);

let res;
if (cmd === 'clientes') {
  res = await client.callTool({ name: 'listar_clientes', arguments: {} });
} else if (cmd === 'query') {
  const sql = fs.readFileSync(a2, 'utf8').trim().replace(/;+\s*$/, '');
  res = await client.callTool({
    name: 'consulta_personalizada',
    arguments: { sql, clientIds: a1.split(','), nome: a3 || 'Caso RIW1D67' }
  });
} else {
  console.error('uso: clientes | query <clientId> <arquivo.sql> [nome]');
  process.exit(2);
}
console.log(res.content.map(c => c.text).join('\n'));
await client.close();
