import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

export function persistGeminiArtifacts({ dir, index, source, analysis }) {
  if (typeof dir !== 'string' || !dir) throw new TypeError('dir e obrigatorio');
  const safeIndex = String(index);
  if (!/^\d{1,6}$/.test(safeIndex)) throw new TypeError('index invalido');
  fs.mkdirSync(dir, { recursive: true });
  const files = {
    source: path.join(dir, `gemini-fonte-${safeIndex}.json.gz`),
    raw: path.join(dir, `gemini-raw-${safeIndex}.json`),
    validation: path.join(dir, `gemini-validacao-${safeIndex}.json`),
    evidence: path.join(dir, `gemini-evidencias-${safeIndex}.json`)
  };
  fs.writeFileSync(files.source, zlib.gzipSync(Buffer.from(JSON.stringify(source), 'utf8')));
  fs.writeFileSync(files.raw, JSON.stringify(analysis?.rawAttempts || [], null, 2), 'utf8');
  fs.writeFileSync(files.validation, JSON.stringify(analysis?.validation || {}, null, 2), 'utf8');
  fs.writeFileSync(files.evidence, JSON.stringify(analysis?.evidence ?? null, null, 2), 'utf8');
  return files;
}
