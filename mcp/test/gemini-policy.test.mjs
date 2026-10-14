import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldUseGemini, QuotaGate } from '../lib/gemini-policy.mjs';

const payload = rows => ({ failed: false, errors: [], results: [{ ok: true, rows }] });

test('não usa Gemini para resultado pequeno', () => {
  assert.deepEqual(shouldUseGemini(payload([{ id: 1 }]), { minRows: 100, minChars: 40000 }).use, false);
});

test('usa Gemini quando quantidade de linhas é grande', () => {
  const rows = Array.from({ length: 100 }, (_, id) => ({ id }));
  assert.equal(shouldUseGemini(payload(rows), { minRows: 100, minChars: 40000 }).use, true);
});

test('não usa Gemini quando o coletor falhou', () => {
  const failed = { failed: true, errors: [{ error: 'timeout' }], results: [] };
  assert.equal(shouldUseGemini(failed).reason, 'collector_failed');
});

test('bloqueia a sexta requisição numa janela com RPM cinco', async () => {
  let now = 1000;
  const gate = new QuotaGate({ rpm: 5, tpm: 250000, rpd: 20, now: () => now });
  for (let i = 0; i < 5; i++) assert.equal((await gate.reserve(10)).ok, true);
  assert.equal((await gate.reserve(10)).reason, 'rpm_exceeded');
});

test('bloqueia requisição que ultrapassa TPM', async () => {
  const gate = new QuotaGate({ rpm: 15, tpm: 100, rpd: 500, now: () => 1000 });
  assert.equal((await gate.reserve(101)).reason, 'tpm_exceeded');
});

test('bloqueia requisição depois do limite diário', async () => {
  const gate = new QuotaGate({ rpm: 15, tpm: 250000, rpd: 2, now: () => 1000 });
  assert.equal((await gate.reserve(1)).ok, true);
  assert.equal((await gate.reserve(1)).ok, true);
  assert.equal((await gate.reserve(1)).reason, 'rpd_exceeded');
});
