import test from 'node:test';
import assert from 'node:assert/strict';
import { createGeminiAnalyzer } from '../lib/gemini-client.mjs';

const source = {
  failed: false,
  errors: [],
  results: [{
    ok: true,
    clientId: 58,
    clientName: 'GAGA2',
    rows: [
      { viagem: 1578886, vloc_codigo: 3141343, tipo: 'saida', data: '2026-08-29 15:52:44' },
      { viagem: 1578886, vloc_codigo: 3141343, tipo: 'chegada', data: '2026-08-31 09:45:30' }
    ]
  }]
};

const validPackage = {
  status: 'ok',
  resumo: 'Saída e chegada são registros da viagem 1578886 e do local 3141343.',
  quantidade_linhas_lidas: 2,
  fontes: [{ indice: 1, cliente: 'GAGA2', quantidade_linhas: 2 }],
  entidades: { clientes: ['GAGA2'], placas: [], viagens: [1578886], locais_viagem: [3141343], referencias: [], eventos: [] },
  periodo: { inicio: '2026-08-29 15:52:44', fim: '2026-08-31 09:45:30', fuso_confirmado: false, fuso: null },
  marcos: [
    { tipo: 'saida', data: '2026-08-29 15:52:44', origem: 'resultado-1', linha: 1 },
    { tipo: 'chegada', data: '2026-08-31 09:45:30', origem: 'resultado-1', linha: 2 }
  ],
  correlacoes_factuais: [{ tipo: 'mesma_viagem', valores: [1578886] }, { tipo: 'mesmo_vloc', valores: [3141343] }],
  anomalias: [],
  contradicoes: [],
  incertezas: [],
  campos_preservados: ['viagem', 'vloc_codigo', 'tipo', 'data'],
  evidencias_selecionadas: [
    { origem: 'resultado-1', linha: 1, registro: source.results[0].rows[0] },
    { origem: 'resultado-1', linha: 2, registro: source.results[0].rows[1] }
  ],
  hipoteses_para_validacao: [],
  pode_ser_usado_no_veredito: true,
  motivos_bloqueio: []
};

function geminiResponse(text) {
  return {
    ok: true,
    status: 200,
    async json() {
      return { candidates: [{ content: { parts: [{ text }] } }] };
    },
    async text() {
      return text;
    }
  };
}

function allowAllQuota() {
  return { reserve: async () => ({ ok: true, reason: 'reserved' }) };
}

test('aceita evidencia valida na primeira resposta e nao pede reparo', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls += 1; return geminiResponse(JSON.stringify(validPackage)); };
  const analyzer = createGeminiAnalyzer({ fetchImpl, apiKey: 'k', model: 'gemini-3.5-flash-lite', quotaGate: allowAllQuota() });

  const result = await analyzer.analyze({ question: 'O que aconteceu na viagem 1578886?', source });

  assert.equal(result.status, 'ok');
  assert.equal(result.evidence.pode_ser_usado_no_veredito, true);
  assert.equal(calls, 1);
  assert.equal(result.usage.calls, 1);
  assert.equal(result.rawAttempts.length, 1);
});

test('repara apos primeira resposta invalida e aceita a segunda', async () => {
  const invalido = { ...validPackage, quantidade_linhas_lidas: 999 };
  let call = 0;
  const fetchImpl = async () => {
    call += 1;
    return geminiResponse(JSON.stringify(call === 1 ? invalido : validPackage));
  };
  const analyzer = createGeminiAnalyzer({ fetchImpl, apiKey: 'k', model: 'gemini-3.5-flash-lite', quotaGate: allowAllQuota() });

  const result = await analyzer.analyze({ question: 'pergunta', source });

  assert.equal(result.status, 'ok');
  assert.equal(call, 2);
  assert.equal(result.rawAttempts.length, 2);
});

test('bloqueia depois de duas respostas invalidas', async () => {
  const fetchImpl = async () => geminiResponse('isto nao e json');
  const analyzer = createGeminiAnalyzer({ fetchImpl, apiKey: 'k', model: 'gemini-3.5-flash-lite', quotaGate: allowAllQuota() });

  const result = await analyzer.analyze({ question: 'pergunta', source });

  assert.equal(result.status, 'bloqueado');
  assert.equal(result.evidence.pode_ser_usado_no_veredito, false);
  assert.equal(result.rawAttempts.length, 2);
});

test('retorna inconclusivo quando a chamada a API falha', async () => {
  const fetchImpl = async () => { throw new Error('network down'); };
  const analyzer = createGeminiAnalyzer({ fetchImpl, apiKey: 'k', model: 'gemini-3.5-flash-lite', quotaGate: allowAllQuota() });

  const result = await analyzer.analyze({ question: 'pergunta', source });

  assert.equal(result.status, 'inconclusivo');
  assert.equal(result.evidence.pode_ser_usado_no_veredito, false);
});

test('nao chama a API quando o coletor falhou', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls += 1; return geminiResponse('{}'); };
  const analyzer = createGeminiAnalyzer({ fetchImpl, apiKey: 'k', model: 'gemini-3.5-flash-lite', quotaGate: allowAllQuota() });

  const failedSource = { failed: true, errors: [{ error: 'timeout' }], results: [] };
  const result = await analyzer.analyze({ question: 'pergunta', source: failedSource });

  assert.equal(calls, 0);
  assert.equal(result.status, 'consulta_falhou');
});

test('nao chama a API quando a cota esta esgotada', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls += 1; return geminiResponse(JSON.stringify(validPackage)); };
  const deniedQuota = { reserve: async () => ({ ok: false, reason: 'rpm_exceeded' }) };
  const analyzer = createGeminiAnalyzer({ fetchImpl, apiKey: 'k', model: 'gemini-3.5-flash-lite', quotaGate: deniedQuota });

  const result = await analyzer.analyze({ question: 'pergunta', source });

  assert.equal(calls, 0);
  assert.equal(result.status, 'inconclusivo');
});

test('reserva cota novamente antes da tentativa de reparo', async () => {
  let apiCalls = 0;
  let reservations = 0;
  const fetchImpl = async () => {
    apiCalls += 1;
    return geminiResponse('isto nao e json');
  };
  const quotaGate = {
    async reserve() {
      reservations += 1;
      return reservations === 1
        ? { ok: true, reason: 'reserved' }
        : { ok: false, reason: 'rpm_exceeded' };
    }
  };
  const analyzer = createGeminiAnalyzer({ fetchImpl, apiKey: 'k', model: 'gemini-3.5-flash-lite', quotaGate });

  const result = await analyzer.analyze({ question: 'pergunta', source });

  assert.equal(reservations, 2);
  assert.equal(apiCalls, 1);
  assert.equal(result.status, 'inconclusivo');
  assert.deepEqual(result.validation.errors, ['rpm_exceeded']);
});

test('nao chama API sem chave Gemini configurada', async () => {
  let calls = 0;
  const analyzer = createGeminiAnalyzer({
    fetchImpl: async () => { calls += 1; return geminiResponse('{}'); },
    apiKey: '', model: 'gemini-3.5-flash-lite', quotaGate: allowAllQuota()
  });
  const result = await analyzer.analyze({ question: 'pergunta', source });
  assert.equal(calls, 0);
  assert.equal(result.status, 'inconclusivo');
  assert.deepEqual(result.validation.errors, ['GEMINI_NOT_CONFIGURED']);
});

test('envia chave em header e exige resposta JSON do Gemini', async () => {
  let captured;
  const analyzer = createGeminiAnalyzer({
    fetchImpl: async (url, options) => {
      captured = { url, options };
      return geminiResponse(JSON.stringify(validPackage));
    },
    apiKey: 'segredo', model: 'gemini-3.5-flash-lite', quotaGate: allowAllQuota()
  });
  await analyzer.analyze({ question: 'pergunta', source });
  const requestBody = JSON.parse(captured.options.body);
  assert.doesNotMatch(captured.url, /segredo/);
  assert.equal(captured.options.headers['x-goog-api-key'], 'segredo');
  assert.equal(requestBody.generationConfig.responseMimeType, 'application/json');
});
