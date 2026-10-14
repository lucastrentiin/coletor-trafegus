import { validateCollectorPayload, validateEvidencePackage } from './gemini-validator.mjs';
import { buildEvidencePrompt, buildRepairPrompt } from './gemini-prompt.mjs';

const MAX_ATTEMPTS = 2;
const MAX_OUTPUT_TOKENS = 8192;

function blockedPackage(status, rowCount, motivos) {
  return {
    status,
    resumo: '',
    quantidade_linhas_lidas: rowCount,
    fontes: [],
    entidades: {},
    periodo: {},
    marcos: [],
    correlacoes_factuais: [],
    anomalias: [],
    contradicoes: [],
    incertezas: [],
    campos_preservados: [],
    evidencias_selecionadas: [],
    hipoteses_para_validacao: [],
    pode_ser_usado_no_veredito: false,
    motivos_bloqueio: motivos
  };
}

function estimateTokens(text) {
  return Math.ceil(String(text ?? '').length / 4);
}

function parseJson(raw) {
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch {
    return { ok: false, value: null };
  }
}

function safeApiErrorCode(error) {
  const status = String(error?.message || '').match(/^gemini_http_(\d{3})$/)?.[1];
  return status ? `GEMINI_HTTP_${status}` : 'GEMINI_API_ERROR';
}

async function callModel(fetchImpl, { apiKey, model, prompt, timeoutMs }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetchImpl(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: MAX_OUTPUT_TOKENS, responseMimeType: 'application/json' }
      })
      }
    );
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) {
    throw new Error(`gemini_http_${response.status}`);
  }
  const payload = await response.json();
  const text = payload?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== 'string') throw new Error('gemini_empty_response');
  return text;
}

/**
 * Cria um analisador Gemini limitado: valida o payload do coletor antes de
 * chamar a API, valida a resposta contra a fonte, faz no maximo uma
 * tentativa de reparo e nunca autoriza veredito quando ha erro/contradicao.
 *
 * @param {{fetchImpl: Function, apiKey: string, model: string, quotaGate: {reserve: Function}}} deps
 */
export function createGeminiAnalyzer({ fetchImpl, apiKey, model, quotaGate, timeoutMs = 30000 }) {
  if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl e obrigatorio');
  if (!quotaGate || typeof quotaGate.reserve !== 'function') throw new TypeError('quotaGate e obrigatorio');

  return {
    async analyze({ question, source }) {
      const collector = validateCollectorPayload(source);
      const rawAttempts = [];

      if (!collector.ok) {
        return {
          status: 'consulta_falhou',
          evidence: blockedPackage('consulta_falhou', collector.rowCount, collector.errors),
          validation: { ok: false, errors: collector.errors },
          usage: { calls: 0 },
          rawAttempts,
          routing: { use: false, reason: 'collector_failed' }
        };
      }

      if (typeof apiKey !== 'string' || !apiKey.trim()) {
        return {
          status: 'inconclusivo',
          evidence: blockedPackage('inconclusivo', collector.rowCount, ['GEMINI_NOT_CONFIGURED']),
          validation: { ok: false, errors: ['GEMINI_NOT_CONFIGURED'] },
          usage: { calls: 0 }, rawAttempts,
          routing: { use: false, reason: 'not_configured' }
        };
      }

      const material = JSON.stringify(source);
      const materialMetadata = { linhas: collector.rowCount, fontes: collector.sources.length };
      let prompt = buildEvidencePrompt(question, materialMetadata, material);
      let lastErrors = ['NO_VALID_RESPONSE'];

      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
        const quota = await quotaGate.reserve(estimateTokens(prompt) + MAX_OUTPUT_TOKENS);
        if (!quota.ok) {
          return {
            status: 'inconclusivo',
            evidence: blockedPackage('inconclusivo', collector.rowCount, [`quota_${quota.reason}`]),
            validation: { ok: false, errors: [quota.reason] },
            usage: { calls: rawAttempts.length },
            rawAttempts,
            routing: { use: true, reason: 'quota_rejected' }
          };
        }
        let raw;
        try {
          raw = await callModel(fetchImpl, { apiKey, model, prompt, timeoutMs });
        } catch (error) {
          const errorCode = safeApiErrorCode(error);
          rawAttempts.push({ attempt, error: errorCode });
          return {
            status: 'inconclusivo',
            evidence: blockedPackage('inconclusivo', collector.rowCount, [errorCode]),
            validation: { ok: false, errors: [errorCode] },
            usage: { calls: attempt },
            rawAttempts,
            routing: { use: true, reason: 'api_error' }
          };
        }

        rawAttempts.push({ attempt, raw });
        const parsed = parseJson(raw);
        if (!parsed.ok) {
          lastErrors = ['JSON_PARSE_ERROR'];
        } else {
          const validation = validateEvidencePackage(parsed.value, source);
          if (validation.ok) {
            return {
              status: 'ok',
              evidence: validation.normalized,
              validation,
              usage: { calls: attempt },
              rawAttempts,
              routing: { use: true, reason: 'validated' }
            };
          }
          lastErrors = validation.errors;
        }

        if (attempt < MAX_ATTEMPTS) {
          prompt = buildRepairPrompt(raw, lastErrors, material);
        }
      }

      return {
        status: 'bloqueado',
        evidence: blockedPackage('bloqueado', collector.rowCount, lastErrors),
        validation: { ok: false, errors: lastErrors },
        usage: { calls: MAX_ATTEMPTS },
        rawAttempts,
        routing: { use: true, reason: 'validation_failed_twice' }
      };
    }
  };
}

