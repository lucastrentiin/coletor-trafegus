import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createVault, pareceSegredo, resumoDeTexto, separarFrontmatter, lerFrontmatter } from '../lib/vault.mjs';

function escrever(root, rel, texto) {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), texto);
}

function fixture() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'vault-test-'));
  const root = path.join(base, 'vault');
  for (const p of ['inbox', 'empresa', '.obsidian', 'trafegus/armadilhas']) fs.mkdirSync(path.join(root, p), { recursive: true });
  escrever(root, 'trafegus/tarefas/anjun.md', '---\ntarefa: Fim de viagem Anjun\nstatus: em andamento\n---\n## Proximo passo\nVerificar a macro de Sao Paulo\n');
  escrever(root, 'trafegus/tarefas/velha.md', '---\nstatus: concluída\n---\n# Velha\n');
  escrever(root, 'trafegus/tarefas/tarefas.md', '---\ntipo: hub\n---\n# tarefas\n');
  escrever(root, 'trafegus/casos/CASO-1/veredito.md', '# Veredito\nAutor: Claude.\n\n**Resumo:** macro 32 sem tmac\n');
  escrever(root, 'trafegus/casos/CASO-1/entrada.json', '{"cliente":"X","criado_em":"2026-09-29T10:00:00Z"}');
  escrever(root, 'trafegus/conhecimento/base.md', '# Base\n' + 'linha de texto\n'.repeat(2000));
  escrever(root, 'trafegus/conhecimento/eventos/Tipo A/Evento 1.md', '---\ntipo: evento\n---\n## Evento 1\n');
  escrever(root, 'trafegus/conhecimento/eventos/Tipo A/Evento 2.md', '---\ntipo: evento\n---\n## Evento 2\n');
  escrever(root, 'trafegus/conhecimento/eventos/Tipo A/Tipo A.md', '---\ntipo: hub\n---\n# Tipo A\n');
  escrever(root, 'trafegus/trafegus.md', '---\ntipo: hub\n---\n# trafegus\n');
  escrever(root, 'empresa/processos.md', '# Processos\nComo a empresa atende chamados.\n');
  escrever(root, 'templates/tarefa.md', '---\nstatus:\n---\n');
  escrever(root, '.obsidian/config.md', 'oculto');
  fs.writeFileSync(path.join(base, 'fora.md'), 'segredo de fora');
  return { base, root, vault: createVault({ rootDir: root, logPath: path.join(base, 'escritas.jsonl') }) };
}

test('le nota existente', () => {
  const { vault } = fixture();
  const r = vault.ler({ caminho: 'trafegus/tarefas/anjun.md' });
  assert.match(r.conteudo, /Proximo passo/);
  assert.equal(r.ha_mais, false);
});

test('pagina leitura por caracteres', () => {
  const { vault } = fixture();
  const p1 = vault.ler({ caminho: 'trafegus/conhecimento/base.md', limite: 100 });
  assert.equal(p1.conteudo.length, 100);
  assert.equal(p1.ha_mais, true);
  assert.equal(p1.proximo_inicio, 100);
  const p2 = vault.ler({ caminho: 'trafegus/conhecimento/base.md', inicio: 100, limite: 50 });
  assert.equal(p2.inicio, 100);
  assert.equal(p2.conteudo.length, 50);
  assert.ok(vault.ler({ caminho: 'trafegus/conhecimento/base.md', limite: 999999 }).conteudo.length <= 8000);
});

test('busca sem acento e maiusculas retorna so trecho curto', () => {
  const { vault } = fixture();
  const r = vault.buscar({ termo: 'SÃO PAULO' });
  assert.equal(r.resultados.length, 1);
  assert.equal(r.resultados[0].caminho, 'trafegus/tarefas/anjun.md');
  assert.equal(r.resultados[0].linha, 6);
  const longa = vault.buscar({ termo: 'linha de texto', limite: 30 });
  assert.equal(longa.resultados.length, 30);
  assert.equal(longa.truncado, true);
  assert.ok(longa.resultados.every(x => x.trecho.length <= 200));
  assert.equal(vault.buscar({ termo: 'processos', pasta: 'trafegus' }).resultados.length, 0);
});

test('busca encontra pelo nome do arquivo e ignora ocultos', () => {
  const { vault } = fixture();
  assert.ok(vault.buscar({ termo: 'anjun' }).resultados.some(x => x.linha === 0));
  assert.equal(vault.buscar({ termo: 'oculto' }).resultados.length, 0);
  assert.throws(() => vault.buscar({ termo: 'a' }), /2 caracteres/);
});

test('bloqueia travessia, caminho absoluto, barra invertida e byte nulo', () => {
  const { vault } = fixture();
  assert.throws(() => vault.ler({ caminho: '../fora.md' }), /nao permitido/);
  assert.throws(() => vault.ler({ caminho: 'trafegus/../../fora.md' }), /nao permitido/);
  assert.throws(() => vault.ler({ caminho: '/etc/passwd' }), /nao permitido/);
  assert.throws(() => vault.ler({ caminho: 'trafegus\\tarefas\\anjun.md' }), /nao permitido/);
  assert.throws(() => vault.ler({ caminho: 'trafegus/tarefas/anjun.md\0' }), /nao permitido/);
});

test('bloqueia symlink que sai do vault', () => {
  const { base, root, vault } = fixture();
  fs.symlinkSync(path.join(base, 'fora.md'), path.join(root, 'inbox', 'link.md'));
  fs.symlinkSync(base, path.join(root, 'inbox', 'pasta-link'));
  assert.throws(() => vault.ler({ caminho: 'inbox/link.md' }), /sai do vault/);
  assert.throws(() => vault.ler({ caminho: 'inbox/pasta-link/fora.md' }), /sai do vault/);
  assert.throws(() => vault.escrever({ caminho: 'inbox/pasta-link/novo.md', conteudo: 'x', modo: 'criar' }), /sai do vault/);
  assert.equal(fs.readFileSync(path.join(base, 'fora.md'), 'utf8'), 'segredo de fora');
});

test('bloqueia pastas ocultas', () => {
  const { vault } = fixture();
  assert.throws(() => vault.ler({ caminho: '.obsidian/config.md' }), /ocultos/);
  assert.throws(() => vault.escrever({ caminho: 'trafegus/tarefas/.trash/x.md', conteudo: 'x', modo: 'criar' }), /ocultos/);
  assert.ok(!vault.listar({}).itens.some(i => i.caminho.startsWith('.')));
});

test('escrita em pastas protegidas, na raiz ou fora de .md e bloqueada', () => {
  const { vault } = fixture();
  assert.throws(() => vault.escrever({ caminho: 'templates/tarefa.md', conteudo: 'x', modo: 'substituir' }), /somente leitura/);
  assert.throws(() => vault.escrever({ caminho: 'trafegus/conhecimento/base.md', conteudo: 'x', modo: 'substituir' }), /somente leitura/);
  assert.throws(() => vault.escrever({ caminho: 'trafegus/Conhecimento/nova.md', conteudo: 'x', modo: 'criar' }), /somente leitura/);
  assert.throws(() => vault.escrever({ caminho: 'raiz.md', conteudo: 'x', modo: 'criar' }), /raiz/);
  assert.throws(() => vault.escrever({ caminho: 'trafegus/tarefas/script.sh', conteudo: 'x', modo: 'criar' }), /\.md/);
  assert.throws(() => vault.editar({ caminho: 'templates/tarefa.md', trecho_antigo: 'status', trecho_novo: 'x' }), /somente leitura/);
});

test('escrita permitida em qualquer galho', () => {
  const { root, vault } = fixture();
  vault.escrever({ caminho: 'empresa/decisoes/2026-09.md', conteudo: 'ok', modo: 'criar' });
  vault.escrever({ caminho: 'projetos/prospector/tarefas/lead.md', conteudo: 'ok', modo: 'criar' });
  vault.escrever({ caminho: 'trafegus/armadilhas/tabela.md', conteudo: 'ok', modo: 'criar' });
  assert.equal(fs.readFileSync(path.join(root, 'projetos/prospector/tarefas/lead.md'), 'utf8'), 'ok');
});

test('criar, substituir e anexar', () => {
  const { base, root, vault } = fixture();
  vault.escrever({ caminho: 'trafegus/tarefas/sub/nova.md', conteudo: 'um', modo: 'criar' });
  assert.throws(() => vault.escrever({ caminho: 'trafegus/tarefas/sub/nova.md', conteudo: 'dois', modo: 'criar' }), /ja existe/);
  vault.escrever({ caminho: 'trafegus/tarefas/sub/nova.md', conteudo: 'dois', modo: 'anexar' });
  assert.equal(fs.readFileSync(path.join(root, 'trafegus/tarefas/sub/nova.md'), 'utf8'), 'um\ndois');
  vault.escrever({ caminho: 'trafegus/tarefas/sub/nova.md', conteudo: 'tres', modo: 'substituir' });
  assert.equal(fs.readFileSync(path.join(root, 'trafegus/tarefas/sub/nova.md'), 'utf8'), 'tres');
  assert.throws(() => vault.escrever({ caminho: 'trafegus/tarefas/nao-existe.md', conteudo: 'x', modo: 'anexar' }), /nao existe/);
  assert.ok(!fs.readdirSync(path.join(root, 'trafegus/tarefas/sub')).some(n => n.endsWith('.tmp')));
  assert.equal(fs.readFileSync(path.join(base, 'escritas.jsonl'), 'utf8').trim().split('\n').length, 3);
});

test('vault_editar exige exatamente uma ocorrencia', () => {
  const { root, vault } = fixture();
  vault.escrever({ caminho: 'inbox/e.md', conteudo: 'a b a c', modo: 'criar' });
  assert.throws(() => vault.editar({ caminho: 'inbox/e.md', trecho_antigo: 'zzz', trecho_novo: 'x' }), /nao encontrado/);
  assert.throws(() => vault.editar({ caminho: 'inbox/e.md', trecho_antigo: 'a', trecho_novo: 'x' }), /2 vezes/);
  vault.editar({ caminho: 'inbox/e.md', trecho_antigo: 'c', trecho_novo: '$& d' });
  assert.equal(fs.readFileSync(path.join(root, 'inbox/e.md'), 'utf8'), 'a b a $& d');
});

test('bloqueia conteudo com cara de segredo', () => {
  const { vault } = fixture();
  for (const s of ['senha=abc12345', 'password: hunter2hunter', 'API_TOKEN=abcdef123456', 'postgres://user:pw@host/db', '-----BEGIN RSA PRIVATE KEY-----', 'chave sk-abcdefghijklmnop1234', 'ghp_abcdefghijklmnopqrstuvwxyz']) {
    assert.throws(() => vault.escrever({ caminho: 'inbox/s.md', conteudo: s, modo: 'substituir' }), /Segredos nao vao para o vault/, s);
  }
  assert.equal(pareceSegredo('A senha fica com o Lucas. postgres://host/db sem credencial.'), false);
  assert.equal(pareceSegredo('bearer_token_env_var = "CEREBRO_TOKEN" (nome da variavel, nao o valor)'), false);
  assert.equal(pareceSegredo('TOKEN=a1b2c3d4e5f6'), true);
  assert.equal(pareceSegredo('ok\nCEREBRO_API_TOKEN=3f9a0c1d2e4b5a6978'), true);
});

test('limite de 100 KB por arquivo e deteccao de segredo rapida', () => {
  const { vault } = fixture();
  const inicio = Date.now();
  assert.throws(() => vault.escrever({ caminho: 'inbox/g.md', conteudo: 'x'.repeat(100 * 1024 + 1), modo: 'criar' }), /100 KB/);
  vault.escrever({ caminho: 'inbox/g.md', conteudo: 'x'.repeat(100 * 1024 - 10), modo: 'criar' });
  assert.throws(() => vault.escrever({ caminho: 'inbox/g.md', conteudo: 'y'.repeat(100), modo: 'anexar' }), /100 KB/);
  assert.ok(Date.now() - inicio < 2000, 'deteccao de segredo lenta demais');
});

test('indice mostra a arvore: tarefas de qualquer galho, casos e pastas resumidas', () => {
  const { vault } = fixture();
  const { conteudo } = vault.indice();
  assert.match(conteudo, /trafegus\/tarefas\/anjun\.md \[em andamento\] - Fim de viagem Anjun/);
  assert.doesNotMatch(conteudo, /velha\.md/);
  assert.match(conteudo, /1 concluida/);
  assert.match(conteudo, /## trafegus/);
  assert.match(conteudo, /## empresa\n- empresa\/processos\.md - Como a empresa atende chamados\./);
  assert.match(conteudo, /trafegus\/casos\/: 1 casos/);
  assert.match(conteudo, /trafegus\/casos\/CASO-1\/ \[veredito 2026-09-29\] macro 32 sem tmac/);
  assert.match(conteudo, /trafegus\/conhecimento\/eventos\/Tipo A\/: 2 notas/);
  assert.doesNotMatch(conteudo, /trafegus\.md|Tipo A\.md|templates/);
  assert.ok(conteudo.length <= 8000);
});

test('listar respeita pasta e recursivo', () => {
  const { vault } = fixture();
  assert.deepEqual(vault.listar({ pasta: 'trafegus/casos' }).itens.map(i => i.caminho), ['trafegus/casos/CASO-1/']);
  assert.ok(vault.listar({ pasta: 'trafegus/casos', recursivo: true }).itens.some(i => i.caminho === 'trafegus/casos/CASO-1/veredito.md'));
});

test('resumo e frontmatter', () => {
  assert.equal(resumoDeTexto('# V\n**Resumo:** SM criada sem carreta.\n'), 'SM criada sem carreta.');
  assert.equal(resumoDeTexto('# V\nAutor: Claude.\n\n## Conclusão\n\nA saida foi gerada.\n'), 'A saida foi gerada.');
  assert.equal(resumoDeTexto('---\nresumo: "Com: dois pontos"\n---\n# X\n'), 'Com: dois pontos');
  assert.equal(resumoDeTexto('# Pergunta\nAutor: X\nMotivo do atraso.\n'), 'Motivo do atraso.');
  assert.equal(resumoDeTexto('# V\n- Schema: coluna csis_configuracao_sistema e envi_automatico = S por RAPHAELA_CORDEIRO.\n'), 'Schema: coluna csis_configuracao_sistema e envi_automatico = S por RAPHAELA_CORDEIRO.');
  assert.equal(resumoDeTexto('# V\nTexto *enfatico* e _italico_ com `codigo`.\n'), 'Texto enfatico e italico com codigo.');
  assert.deepEqual(separarFrontmatter('sem frontmatter'), { linhas: null, corpo: 'sem frontmatter' });
  assert.deepEqual(separarFrontmatter('---\n---\ncorpo'), { linhas: [], corpo: 'corpo' });
  assert.equal(lerFrontmatter('---\ntipo: hub\n---\n').tipo, 'hub');
});
