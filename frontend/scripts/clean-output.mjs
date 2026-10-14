// Remove só o que o build da interface gera dentro de web/.
// web/server.js (backend) nunca é tocado.
import { rmSync } from 'node:fs';
import { resolve } from 'node:path';

const out = resolve(process.env.COLETOR_OUT ?? '../web');
for (const entry of ['assets', 'index.html', 'login.html', 'app.js']) {
  rmSync(resolve(out, entry), { recursive: true, force: true });
}
console.log(`Interface anterior removida de ${out}`);
