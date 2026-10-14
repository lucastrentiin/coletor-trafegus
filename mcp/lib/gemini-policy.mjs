import { validateCollectorPayload } from './gemini-validator.mjs';

export function shouldUseGemini(source, options = {}) {
  const collector = validateCollectorPayload(source);
  const chars = JSON.stringify(source ?? null).length;
  if (!collector.ok) return { use: false, reason: 'collector_failed', metrics: { rows: collector.rowCount, chars } };
  const minRows = options.minRows ?? Number(process.env.GEMINI_MIN_ROWS || 100);
  const minChars = options.minChars ?? Number(process.env.GEMINI_MIN_CHARS || 40000);
  const use = collector.rowCount >= minRows || chars >= minChars;
  return { use, reason: use ? 'large_material' : 'small_material', metrics: { rows: collector.rowCount, chars } };
}

export class QuotaGate {
  constructor(options = {}) {
    this.rpm = options.rpm ?? 15;
    this.tpm = options.tpm ?? 250000;
    this.rpd = options.rpd ?? 500;
    this.now = options.now ?? Date.now;
    this.minute = [];
    this.day = [];
  }

  async reserve(estimatedTokens) {
    const now = this.now();
    this.minute = this.minute.filter(item => now - item.at < 60000);
    this.day = this.day.filter(item => now - item.at < 86400000);
    if (this.minute.length >= this.rpm) return { ok: false, reason: 'rpm_exceeded' };
    if (this.minute.reduce((sum, item) => sum + item.tokens, 0) + estimatedTokens > this.tpm) return { ok: false, reason: 'tpm_exceeded' };
    if (this.day.length >= this.rpd) return { ok: false, reason: 'rpd_exceeded' };
    const entry = { at: now, tokens: estimatedTokens };
    this.minute.push(entry);
    this.day.push(entry);
    return { ok: true, reason: 'reserved' };
  }
}
