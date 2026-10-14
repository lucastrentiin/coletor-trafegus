import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createGeminiAnalyzer } from '../mcp/lib/gemini-client.mjs';
import { QuotaGate } from '../mcp/lib/gemini-policy.mjs';
import { persistGeminiArtifacts } from '../mcp/lib/gemini-artifacts.mjs';

const rows = Array.from({ length: 120 }, (_, i) => ({
  id: i + 1,
  viagem: 1578886,
  placa: 'SINT0T01',
  data: `2026-09-06T12:${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}.000Z`,
  estado: i < 60 ? 'fora' : 'dentro'
}));
const source = { failed: false, errors: [], results: [{ ok: true, clientId: 'SYNTH', clientName: 'Sintetico', rows }] };
const analyzer = createGeminiAnalyzer({
  fetchImpl: fetch,
  apiKey: process.env.GEMINI_API_KEY,
  model: process.env.GEMINI_MODEL || 'gemini-flash-lite-latest',
  quotaGate: new QuotaGate({ rpm: 15, tpm: 250000, rpd: 500 })
});
const analysis = await analyzer.analyze({ question: 'Organize as evidencias da transicao de fora para dentro sem concluir causa.', source });
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gemini-production-check-'));
const files = persistGeminiArtifacts({ dir, index: '01', source, analysis });
const checks = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, fs.existsSync(file) && fs.statSync(file).size > 0]));
console.log(JSON.stringify({ status: analysis.status, calls: analysis.usage?.calls, errors: analysis.validation?.errors || [], evidenceCount: analysis.evidence?.evidencias_selecionadas?.length || 0, artifacts: checks }));
