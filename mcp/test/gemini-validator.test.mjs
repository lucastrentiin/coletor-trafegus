import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCollectorPayload, validateEvidencePackage } from '../lib/gemini-validator.mjs';

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

const valid = {
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

test('bloqueia consulta falha antes de chamar Gemini', () => {
  const result = validateCollectorPayload({ failed: true, errors: [{ error: 'timeout' }], results: [] });
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes('COLLECTOR_FAILED'));
});

test('aceita pacote GAGA2 factual e fundamentado', () => {
  const result = validateEvidencePackage(valid, source);
  assert.equal(result.ok, true);
  assert.equal(result.normalized.pode_ser_usado_no_veredito, true);
});

test('rejeita quantidade de linhas inventada', () => {
  const result = validateEvidencePackage({ ...valid, quantidade_linhas_lidas: 3 }, source);
  assert.ok(result.errors.includes('ROW_COUNT_MISMATCH'));
});

test('rejeita linha de evidência inexistente', () => {
  const candidate = structuredClone(valid);
  candidate.evidencias_selecionadas[0].linha = 99;
  const result = validateEvidencePackage(candidate, source);
  assert.ok(result.errors.includes('EVIDENCE_LINE_OUT_OF_RANGE'));
});

test('rejeita registro de evidência diferente da fonte', () => {
  const candidate = structuredClone(valid);
  candidate.evidencias_selecionadas[0].registro.viagem = 1578329;
  const result = validateEvidencePackage(candidate, source);
  assert.ok(result.errors.includes('EVIDENCE_ROW_MISMATCH'));
});

test('rejeita contradição explícita sobre viagem no GAGA2', () => {
  const candidate = structuredClone(valid);
  candidate.correlacoes_factuais.push({ tipo: 'viagens_diferentes', valores: ['1578329', '1578886'] });
  const result = validateEvidencePackage(candidate, source);
  assert.ok(result.errors.includes('CONTRADICTORY_RELATIONSHIPS'));
});

test('rejeita autorização de veredito quando há contradições', () => {
  const candidate = structuredClone(valid);
  candidate.contradicoes = ['O resumo diverge dos marcos'];
  const result = validateEvidencePackage(candidate, source);
  assert.ok(result.errors.includes('VERDICT_ALLOWED_WITH_BLOCKERS'));
});

test('rejeita entidades como lista em vez de objeto', () => {
  const result = validateEvidencePackage({ ...valid, entidades: [] }, source);
  assert.ok(result.errors.includes('ENTITIES_INVALID'));
});
