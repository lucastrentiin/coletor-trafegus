import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readAllowedProjectFile } from '../lib/project-files.mjs';

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'project-reader-'));
  fs.mkdirSync(path.join(root, 'agent_sync'), { recursive: true });
  fs.mkdirSync(path.join(root, 'mcp', 'lib'), { recursive: true });
  fs.writeFileSync(path.join(root, 'agent_sync', 'status.md'), 'ok');
  fs.writeFileSync(path.join(root, 'mcp', 'lib', 'module.mjs'), 'export const ok = true;');
  fs.writeFileSync(path.join(root, '.env'), 'SECRET=value');
  return root;
}

test('lê arquivo dentro de pasta permitida', () => {
  assert.equal(readAllowedProjectFile(fixture(), 'agent_sync/status.md'), 'ok');
});

test('lê código permitido em mcp/lib', () => {
  assert.match(readAllowedProjectFile(fixture(), 'mcp/lib/module.mjs'), /ok = true/);
});

test('bloqueia travessia de diretório', () => {
  assert.throws(() => readAllowedProjectFile(fixture(), 'agent_sync/../.env'), /nao permitido/i);
});

test('bloqueia arquivo fora da allowlist', () => {
  assert.throws(() => readAllowedProjectFile(fixture(), '.env'), /nao permitido/i);
});

test('bloqueia nomes sensíveis mesmo em pasta permitida', () => {
  const root = fixture();
  fs.writeFileSync(path.join(root, 'agent_sync', 'credentials.env'), 'SECRET=value');
  assert.throws(() => readAllowedProjectFile(root, 'agent_sync/credentials.env'), /sensivel/i);
});
