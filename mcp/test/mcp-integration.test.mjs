import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../../mcp-http.mjs', import.meta.url), 'utf8');

test('servidor integra o gravador de quatro artefatos Gemini', () => {
  assert.match(source, /import \{ persistGeminiArtifacts \} from '\.\/mcp\/lib\/gemini-artifacts\.mjs';/);
  assert.match(source, /persistGeminiArtifacts\(\{ dir: path\.join\(CASOS_DIR, casoId\), index: indiceStr, source, analysis \}\)/);
  assert.match(source, /salvarArtefatosGemini\(caso_id, salvo\.indiceStr, data, analysis\)/);
  assert.match(source, /salvarArtefatosGemini\(caso_id, salvo\.indiceStr, source, analysis\)/);
});

test('servidor usa por padrao o modelo Gemini validado em regressao real', () => {
  assert.match(source, /process\.env\.GEMINI_MODEL \|\| 'gemini-3\.1-flash-lite'/);
});

test('servidor publica ferramentas compactas do indice deterministico', () => {
  assert.match(source, /createKnowledgeIndex/);
  assert.match(source, /server\.tool\('localizar_regra'/);
  assert.match(source, /server\.tool\('ler_trecho_regra'/);
});
