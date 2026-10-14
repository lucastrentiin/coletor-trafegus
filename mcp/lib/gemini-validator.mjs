import { isDeepStrictEqual } from 'node:util';

const REQUIRED_ARRAYS = [
  'fontes', 'marcos', 'correlacoes_factuais', 'anomalias', 'contradicoes',
  'incertezas', 'campos_preservados', 'evidencias_selecionadas',
  'hipoteses_para_validacao', 'motivos_bloqueio'
];

function unique(values) {
  return [...new Set(values)];
}

export function validateCollectorPayload(source) {
  const errors = [];
  if (!source || typeof source !== 'object') errors.push('COLLECTOR_PAYLOAD_INVALID');
  if (source?.failed === true) errors.push('COLLECTOR_FAILED');
  if (source?.ok === false) errors.push('COLLECTOR_NOT_OK');
  if (source?.partial === true || source?.truncated === true) errors.push('COLLECTOR_PARTIAL');
  if (Array.isArray(source?.errors) && source.errors.length) errors.push('COLLECTOR_ERRORS_PRESENT');
  if (!Array.isArray(source?.results)) errors.push('COLLECTOR_RESULTS_MISSING');
  const results = Array.isArray(source?.results) ? source.results : [];
  if (results.some(result => result?.ok === false)) errors.push('COLLECTOR_RESULT_FAILED');
  if (results.some(result => result?.partial === true || result?.truncated === true)) errors.push('COLLECTOR_RESULT_PARTIAL');
  if (results.some(result => !Array.isArray(result?.rows))) errors.push('COLLECTOR_ROWS_INVALID');
  const rowCount = results.reduce((sum, result) => sum + (Array.isArray(result?.rows) ? result.rows.length : 0), 0);
  return { ok: errors.length === 0, errors: unique(errors), rowCount, sources: results };
}

function validateShape(candidate, errors) {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    errors.push('EVIDENCE_PACKAGE_INVALID');
    return;
  }
  if (!['ok', 'consulta_falhou', 'bloqueado', 'inconclusivo'].includes(candidate.status)) errors.push('STATUS_INVALID');
  else if (candidate.status !== 'ok') errors.push('STATUS_NOT_OK');
  if (typeof candidate.resumo !== 'string') errors.push('SUMMARY_INVALID');
  if (!Number.isInteger(candidate.quantidade_linhas_lidas) || candidate.quantidade_linhas_lidas < 0) errors.push('ROW_COUNT_INVALID');
  if (!candidate.entidades || typeof candidate.entidades !== 'object' || Array.isArray(candidate.entidades)) errors.push('ENTITIES_INVALID');
  if (!candidate.periodo || typeof candidate.periodo !== 'object' || Array.isArray(candidate.periodo)) errors.push('PERIOD_INVALID');
  for (const field of REQUIRED_ARRAYS) if (!Array.isArray(candidate[field])) errors.push(`FIELD_${field.toUpperCase()}_INVALID`);
  if (typeof candidate.pode_ser_usado_no_veredito !== 'boolean') errors.push('VERDICT_FLAG_INVALID');
  if (Array.isArray(candidate.fontes) && candidate.fontes.some(item => !item || typeof item !== 'object' || Array.isArray(item))) errors.push('SOURCES_SHAPE_INVALID');
  if (Array.isArray(candidate.marcos) && candidate.marcos.some(item => !item || typeof item !== 'object' || Array.isArray(item))) errors.push('MILESTONES_SHAPE_INVALID');
  if (Array.isArray(candidate.evidencias_selecionadas) && candidate.evidencias_selecionadas.some(item => !item || typeof item !== 'object' || Array.isArray(item) || !item.registro || typeof item.registro !== 'object' || Array.isArray(item.registro))) errors.push('EVIDENCE_SHAPE_INVALID');
  if (Array.isArray(candidate.correlacoes_factuais) && candidate.correlacoes_factuais.some(item => !item || typeof item !== 'object' || Array.isArray(item) || typeof item.tipo !== 'string')) errors.push('CORRELATIONS_SHAPE_INVALID');
}

function sourceFromLabel(label, results) {
  const match = String(label || '').match(/^resultado-(\d+)$/);
  if (!match) return null;
  return results[Number(match[1]) - 1] || null;
}

function hasContradictoryRelationships(items) {
  const types = new Set((Array.isArray(items) ? items : []).map(item => item?.tipo));
  return (types.has('mesma_viagem') && types.has('viagens_diferentes')) ||
    (types.has('mesmo_vloc') && types.has('vlocs_diferentes')) ||
    (types.has('mesma_referencia') && types.has('referencias_diferentes'));
}

function summaryContradictsRelationships(summary, items) {
  const text = String(summary || '').toLocaleLowerCase('pt-BR');
  const types = new Set((Array.isArray(items) ? items : []).map(item => item?.tipo));
  return (types.has('mesma_viagem') && /viagens?\s+(?:s(?:a|\u00e3)o\s+)?diferentes?/u.test(text)) ||
    (types.has('viagens_diferentes') && /mesma\s+viagem/.test(text)) ||
    (types.has('mesmo_vloc') && /vlocs?\s+(?:s(?:a|\u00e3)o\s+)?diferentes?/u.test(text)) ||
    (types.has('vlocs_diferentes') && /mesmo\s+vloc/.test(text));
}

function containsGeneratedInstruction(text) {
  return /(ignore|desconsidere)\s+(todas?\s+)?(as\s+)?(instru(?:c|\u00e7)(?:o|\u00f5)es|regras)|autorize\s+(o\s+)?veredito|system\s+prompt/iu.test(String(text || ''));
}

function scalarValues(value, output = []) {
  if (value == null || ['string', 'number', 'boolean'].includes(typeof value)) output.push(value);
  else if (Array.isArray(value)) for (const item of value) scalarValues(item, output);
  else if (typeof value === 'object') for (const item of Object.values(value)) scalarValues(item, output);
  return output;
}

function allGrounded(values, sourceValues) {
  return values.every(value => sourceValues.some(sourceValue => isDeepStrictEqual(sourceValue, value)));
}

export function validateEvidencePackage(candidate, source, options = {}) {
  const errors = [];
  const collector = validateCollectorPayload(source);
  if (!collector.ok) errors.push(...collector.errors);
  validateShape(candidate, errors);
  if (errors.includes('EVIDENCE_PACKAGE_INVALID')) {
    return { ok: false, errors: unique(errors), normalized: null };
  }

  if (candidate.quantidade_linhas_lidas !== collector.rowCount) errors.push('ROW_COUNT_MISMATCH');
  if (typeof candidate.resumo === 'string' && candidate.resumo.length > (options.maxSummaryChars || 800)) errors.push('SUMMARY_TOO_LONG');
  if ((candidate.marcos || []).length > (options.maxMilestones || 20)) errors.push('TOO_MANY_MILESTONES');
  if ((candidate.evidencias_selecionadas || []).length > (options.maxEvidence || 20)) errors.push('TOO_MANY_EVIDENCE_ROWS');
  if ((candidate.hipoteses_para_validacao || []).length > (options.maxHypotheses || 10)) errors.push('TOO_MANY_HYPOTHESES');

  const evidenceRows = Array.isArray(candidate.evidencias_selecionadas) ? candidate.evidencias_selecionadas : [];
  const milestones = Array.isArray(candidate.marcos) ? candidate.marcos : [];
  const correlations = Array.isArray(candidate.correlacoes_factuais) ? candidate.correlacoes_factuais : [];
  const contradictions = Array.isArray(candidate.contradicoes) ? candidate.contradicoes : [];
  const blockingReasons = Array.isArray(candidate.motivos_bloqueio) ? candidate.motivos_bloqueio : [];
  const period = candidate.periodo && typeof candidate.periodo === 'object' && !Array.isArray(candidate.periodo) ? candidate.periodo : {};
  const sourceValues = collector.sources.flatMap(result => Array.isArray(result?.rows)
    ? result.rows.flatMap(row => row && typeof row === 'object' && !Array.isArray(row) ? Object.values(row) : [])
    : []);
  const allSourceScalars = scalarValues(source);

  for (const item of Array.isArray(candidate.fontes) ? candidate.fontes : []) {
    const explicitIndex = Number.isInteger(item?.indice) ? item.indice : Number(String(item?.origem || '').match(/^resultado-(\d+)$/)?.[1]);
    const result = Number.isInteger(explicitIndex) ? collector.sources[explicitIndex - 1] : null;
    const grounded = result &&
      (item.quantidade_linhas == null || item.quantidade_linhas === result.rows.length) &&
      (item.cliente == null || item.cliente === result.clientName) &&
      (item.clientId == null || item.clientId === result.clientId) &&
      (item.clientName == null || item.clientName === result.clientName);
    if (!grounded) errors.push('SOURCE_METADATA_UNGROUNDED');
  }

  if (!allGrounded(scalarValues(candidate.entidades), allSourceScalars)) errors.push('ENTITY_VALUE_UNGROUNDED');
  for (const correlation of correlations) {
    if (Array.isArray(correlation?.valores) && !allGrounded(scalarValues(correlation.valores), allSourceScalars)) errors.push('CORRELATION_VALUE_UNGROUNDED');
  }

  for (const [field, code] of [['inicio', 'PERIOD_INICIO_UNGROUNDED'], ['fim', 'PERIOD_FIM_UNGROUNDED']]) {
    if (period[field] != null && !sourceValues.some(value => isDeepStrictEqual(value, period[field]))) errors.push(code);
  }

  for (const evidence of evidenceRows) {
    const result = sourceFromLabel(evidence?.origem, collector.sources);
    if (!result) {
      errors.push('EVIDENCE_SOURCE_INVALID');
      continue;
    }
    const line = evidence?.linha;
    if (!Number.isInteger(line) || line < 1 || line > result.rows.length) {
      errors.push('EVIDENCE_LINE_OUT_OF_RANGE');
      continue;
    }
    if (!isDeepStrictEqual(evidence.registro, result.rows[line - 1])) errors.push('EVIDENCE_ROW_MISMATCH');
  }

  for (const milestone of milestones) {
    const result = sourceFromLabel(milestone?.origem, collector.sources);
    const line = milestone?.linha;
    if (!result || !Number.isInteger(line) || line < 1 || line > result.rows.length) {
      errors.push('MILESTONE_REFERENCE_INVALID');
      continue;
    }
    const row = result.rows[line - 1];
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      errors.push('MILESTONE_REFERENCE_INVALID');
      continue;
    }
    const rowValues = Object.values(row);
    if (milestone.data != null && !rowValues.some(value => isDeepStrictEqual(value, milestone.data))) errors.push('MILESTONE_TIMESTAMP_UNGROUNDED');
  }

  if (hasContradictoryRelationships(correlations)) errors.push('CONTRADICTORY_RELATIONSHIPS');
  if (summaryContradictsRelationships(candidate.resumo, correlations)) errors.push('SUMMARY_RELATIONSHIP_CONTRADICTION');
  if (containsGeneratedInstruction(candidate.resumo)) errors.push('GENERATED_INSTRUCTION_CONTENT');
  if (collector.rowCount > 0 && evidenceRows.length === 0) errors.push('EVIDENCE_REQUIRED');
  const sourceChars = JSON.stringify(source).length;
  if ((collector.rowCount >= 100 || sourceChars >= 40000) && JSON.stringify(candidate).length >= sourceChars) errors.push('PACKAGE_NOT_COMPACT');
  const hasBlockers = contradictions.length > 0 || blockingReasons.length > 0;
  if (candidate.pode_ser_usado_no_veredito && (hasBlockers || errors.length)) errors.push('VERDICT_ALLOWED_WITH_BLOCKERS');

  const finalErrors = unique(errors);
  const normalized = {
    ...candidate,
    pode_ser_usado_no_veredito: candidate.pode_ser_usado_no_veredito === true && finalErrors.length === 0,
    validacao: { ok: finalErrors.length === 0, erros: finalErrors }
  };
  return { ok: finalErrors.length === 0, errors: finalErrors, normalized };
}

