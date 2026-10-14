import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { persistGeminiArtifacts } from '../lib/gemini-artifacts.mjs';

test('grava fonte, resposta bruta, validacao e evidencias separadamente', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gemini-artifacts-'));
  try {
    const source = { failed: false, results: [{ ok: true, rows: [{ id: 1 }] }] };
    const analysis = {
      rawAttempts: [{ attempt: 1, raw: '{"status":"ok"}' }],
      validation: { ok: true, errors: [] },
      evidence: { status: 'ok', evidencias_selecionadas: [{ origem: 'resultado-1', linha: 1, registro: { id: 1 } }] }
    };
    const files = persistGeminiArtifacts({ dir, index: '07', source, analysis });
    assert.deepEqual(Object.keys(files).sort(), ['evidence', 'raw', 'source', 'validation']);
    for (const file of Object.values(files)) assert.equal(fs.existsSync(file), true);
    assert.deepEqual(JSON.parse(zlib.gunzipSync(fs.readFileSync(files.source))), source);
    assert.deepEqual(JSON.parse(fs.readFileSync(files.raw, 'utf8')), analysis.rawAttempts);
    assert.deepEqual(JSON.parse(fs.readFileSync(files.validation, 'utf8')), analysis.validation);
    assert.deepEqual(JSON.parse(fs.readFileSync(files.evidence, 'utf8')), analysis.evidence);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
