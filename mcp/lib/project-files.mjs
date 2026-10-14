import fs from 'node:fs';
import path from 'node:path';

const ALLOWED_PREFIXES = ['agent_sync/', 'docs/superpowers/', 'mcp/lib/', 'mcp/test/'];
const SENSITIVE_NAME = /(^|\/)(\.env(?:\.|$)|credentials?|secrets?|private[_-]?keys?|tokens?|passwords?)(\/|\.|$)/i;

export function readAllowedProjectFile(root, requestedPath, maxBytes = 300000) {
  const raw = String(requestedPath || '').replaceAll('\\', '/');
  const normalized = path.posix.normalize(raw);
  if (!raw || path.posix.isAbsolute(raw) || normalized.startsWith('../') || normalized.includes('/../')) {
    throw new Error('Caminho nao permitido.');
  }
  if (!ALLOWED_PREFIXES.some(prefix => normalized.startsWith(prefix))) throw new Error('Caminho nao permitido.');
  if (SENSITIVE_NAME.test(normalized)) throw new Error('Arquivo sensivel nao permitido.');
  const rootResolved = path.resolve(root);
  const resolved = path.resolve(rootResolved, ...normalized.split('/'));
  if (!resolved.startsWith(rootResolved + path.sep)) throw new Error('Caminho nao permitido.');
  const stat = fs.statSync(resolved);
  if (!stat.isFile()) throw new Error('Arquivo nao encontrado.');
  if (stat.size > maxBytes) throw new Error(`Arquivo excede o limite de ${maxBytes} bytes.`);
  return fs.readFileSync(resolved, 'utf8');
}

export const PROJECT_FILE_ALLOWLIST = Object.freeze([...ALLOWED_PREFIXES]);
