import fs from 'node:fs';
import zlib from 'node:zlib';
import { createGeminiAnalyzer } from '../mcp/lib/gemini-client.mjs';
import { QuotaGate } from '../mcp/lib/gemini-policy.mjs';
import { persistGeminiArtifacts } from '../mcp/lib/gemini-artifacts.mjs';

const caseDir = '/casos/GAGA2-REGRESSAO-GEMINI-20260906';
const originalSource = JSON.parse(zlib.gunzipSync(fs.readFileSync(`${caseDir}/resultado-01.json.gz`)).toString('utf8'));
const originalRows = originalSource.results[0].rows;
const flatRows = originalRows.map(row => ({ categoria: row.categoria, instante: row.instante, ...row.registro }));
const special = flatRows.filter(row => row.categoria !== 'posicao');
const positions = flatRows.filter(row => row.categoria === 'posicao');
const transitionIndexes = positions.flatMap((row, index) => index > 0 && row.em_origem !== positions[index - 1].em_origem ? [index - 1, index] : []);
const targetIndex = positions.findIndex(row => String(row.rece_codigo) === '3169680785');
const selectedIndexes = new Set([...transitionIndexes, targetIndex - 1, targetIndex, targetIndex + 1].filter(index => index >= 0 && index < positions.length));
const decisivePositions = positions.filter((_row, index) => selectedIndexes.has(index));
const selectedRaw = [...new Map([...special, ...decisivePositions].map(row => [`${row.categoria}:${row.instante}:${row.rece_codigo || row.vlev_codigo || row.esis_codigo || row.event_id}`, row])).values()]
  .sort((a, b) => String(a.instante).localeCompare(String(b.instante)));
const stringifyScalars = value => value == null ? value : Array.isArray(value) ? value.map(stringifyScalars) : typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, stringifyScalars(item)])) : String(value);
const selected = selectedRaw.map((row, index) => ({ linha_fonte: String(index + 1), ...stringifyScalars(row) }));
const source = { failed: false, errors: [], results: [{ ok: true, clientId: 58, clientName: 'GAGA2', rows: selected }] };
const question = 'Leia integralmente o material e organize somente as evidencias literais sobre: relacao entre as datas do Monitor, identificadores de viagem e local, origem automatica ou manual das alteracoes, ordem entre hora de bordo e hora de cadastro e mudancas do indicador em_origem. Nao determine causa, nao receba um veredito esperado e registre contradicoes ou incertezas.';
const analyzer = createGeminiAnalyzer({ fetchImpl: fetch, apiKey: process.env.GEMINI_API_KEY, model: process.env.GEMINI_MODEL || 'gemini-flash-lite-latest', quotaGate: new QuotaGate({ rpm: 15, tpm: 250000, rpd: 500 }), timeoutMs: 60000 });
const analysis = await analyzer.analyze({ question, source });
persistGeminiArtifacts({ dir: caseDir, index: '05', source, analysis });
const sourceChars = JSON.stringify(source).length;
const evidenceChars = JSON.stringify(analysis.evidence).length;
console.log(JSON.stringify({ status: analysis.status, calls: analysis.usage?.calls, errors: analysis.validation?.errors || [], rows: analysis.evidence?.quantidade_linhas_lidas, sourceChars, evidenceChars, reductionPercent: sourceChars ? Number((100 - evidenceChars * 100 / sourceChars).toFixed(2)) : 0, summary: analysis.evidence?.resumo, correlations: analysis.evidence?.correlacoes_factuais, anomalies: analysis.evidence?.anomalias, contradictions: analysis.evidence?.contradicoes, uncertainties: analysis.evidence?.incertezas, selectedEvidence: analysis.evidence?.evidencias_selecionadas }));
