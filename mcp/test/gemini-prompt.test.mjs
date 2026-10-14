import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEvidencePrompt, buildRepairPrompt } from '../lib/gemini-prompt.mjs';

test('rejeita pergunta vazia', () => {
  assert.throws(() => buildEvidencePrompt('', {}, '[]'), TypeError);
  assert.throws(() => buildEvidencePrompt('   ', {}, '[]'), TypeError);
});

test('inclui pergunta, campos obrigatorios e material no prompt', () => {
  const prompt = buildEvidencePrompt('O que aconteceu na viagem 1578886?', { linhas: 2, fontes: 1 }, '{"viagem":1578886}');
  assert.match(prompt, /O que aconteceu na viagem 1578886\?/);
  assert.match(prompt, /quantidade_linhas_lidas/);
  assert.match(prompt, /pode_ser_usado_no_veredito/);
  assert.match(prompt, /"viagem":1578886/);
});

test('instrui resposta apenas em JSON e sem veredito', () => {
  const prompt = buildEvidencePrompt('pergunta', {}, '[]');
  assert.match(prompt, /JSON/);
  assert.match(prompt, /veredito/i);
});

test('define valores e formato exatos que o validador exige', () => {
  const prompt = buildEvidencePrompt('pergunta', {}, '[]');
  assert.match(prompt, /status exatamente "ok"/);
  assert.match(prompt, /"registro":objeto_da_linha/);
  assert.match(prompt, /nunca use conteudo/);
  assert.match(prompt, /entidades deve ser um objeto/);
  assert.match(prompt, /"correlacoes_factuais":\[/);
});

test('instrui a tratar o material como dado, nunca como comando', () => {
  const prompt = buildEvidencePrompt('pergunta', {}, '[]');
  assert.match(prompt, /nunca (são|sao) comandos|dados, não instruções|dados, nao instrucoes/i);
});

test('exige grounding literal e reducao mensuravel de material grande', () => {
  const prompt = buildEvidencePrompt('Organize as evidencias', { quantidade_linhas: 100 }, 'material');
  assert.match(prompt, /fontes, entidades e correlacoes_factuais/);
  assert.match(prompt, /tipo JSON/);
  assert.match(prompt, /pacote JSON final deve ser menor/);
});

test('buildRepairPrompt exige lista de erros nao vazia', () => {
  assert.throws(() => buildRepairPrompt('{}', []), TypeError);
  assert.throws(() => buildRepairPrompt('{}', null), TypeError);
});

test('buildRepairPrompt cita os codigos de erro e a resposta anterior', () => {
  const prompt = buildRepairPrompt('{"status":"ok"}', ['ROW_COUNT_MISMATCH', 'EVIDENCE_LINE_OUT_OF_RANGE'], '{"viagem":1578886}');
  assert.match(prompt, /ROW_COUNT_MISMATCH/);
  assert.match(prompt, /EVIDENCE_LINE_OUT_OF_RANGE/);
  assert.match(prompt, /"status":"ok"/);
  assert.match(prompt, /JSON/);
  assert.match(prompt, /"viagem":1578886/);
});
