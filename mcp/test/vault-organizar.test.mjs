import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { organizarVault, nomeCliente, artigosCitados, nomeArquivoSeguro, mesclarNota } from '../lib/vault-organizar.mjs';
import { lerFrontmatter } from '../lib/vault.mjs';

function escrever(root, rel, texto) {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), texto);
}
const ler = (root, rel) => fs.readFileSync(path.join(root, rel), 'utf8');

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vault-org-'));
  escrever(root, 'COMO-USAR.md', '# Como usar\n');
  escrever(root, 'templates/tarefa.md', '---\nstatus:\n---\n');
  const c = 'trafegus/casos/ELITE-QHP2G55-BLOQ-20260925/';
  escrever(root, c + 'entrada.json', JSON.stringify({ cliente: 'EliteGR (ID MCP 27)', placa: 'QHP2G55', criado_em: '2026-09-25T10:00:00Z', descricao: 'bloqueio' }));
  escrever(root, c + 'veredito.md', '# Veredito\nAutor: Claude.\n\n## Resumo\nParada falsa gerou bloqueio. Regra art. 523422 e regras 524152 e 999999.\n');
  escrever(root, c + 'consulta-01.sql', 'select 1');
  escrever(root, c + 'resultado-01.json.gz', 'x');
  escrever(root, 'trafegus/casos/GEMINI-TREINO/entrada.json', JSON.stringify({ cliente: 'SINTETICO' }));
  escrever(root, 'trafegus/casos/STRATUM-AQK8E12-BLOQ-20260910/log.jsonl', '{}\n');
  const ev = 'trafegus/conhecimento/eventos/Controle da Viagem/';
  escrever(root, ev + 'Parada Não Autorizada em Percurso Mínimo.md', '---\ntipo: evento\nartigo: "523422"\n---\nTipo: x\n\n## Evento de Parada (art. 523422)\n');
  escrever(root, ev + 'Violação de Início de Espera em Origem.md', '---\ntipo: evento\nartigo: "524152"\n---\n## Evento (art. 524152)\n');
  fs.mkdirSync(path.join(root, 'empresa'), { recursive: true });
  return root;
}

test('gera ficha do caso com cliente, eventos citados, notas e dados', () => {
  const root = fixture();
  organizarVault({ rootDir: root });
  const ficha = ler(root, 'trafegus/casos/ELITE-QHP2G55-BLOQ-20260925/ELITE-QHP2G55-BLOQ-20260925.md');
  const fm = lerFrontmatter(ficha);
  assert.equal(fm.tipo, 'caso');
  assert.equal(fm.cliente, 'Elite GR');
  assert.equal(fm.status, 'veredito');
  assert.equal(fm.aberto, '2026-09-25');
  assert.equal(fm.resumo, 'Parada falsa gerou bloqueio. Regra art. 523422 e regras 524152 e 999999.');
  assert.match(ficha, /Cliente: \[\[trafegus\/clientes\/Elite GR\|Elite GR\]\]/);
  assert.match(ficha, /\[\[trafegus\/conhecimento\/eventos\/Controle da Viagem\/Parada Não Autorizada em Percurso Mínimo\|Parada Não Autorizada em Percurso Mínimo\]\] \(art\. 523422\)/);
  assert.match(ficha, /Violação de Início de Espera em Origem\]\] \(art\. 524152\)/);
  assert.doesNotMatch(ficha, /999999\)/);
  assert.match(ficha, /\[\[trafegus\/casos\/ELITE-QHP2G55-BLOQ-20260925\/veredito\|veredito\]\]/);
  assert.match(ficha, /1 consulta\(s\) SQL e 1 resultado\(s\)/);
});

test('casos internos e sem entrada.json', () => {
  const root = fixture();
  organizarVault({ rootDir: root });
  const interno = ler(root, 'trafegus/casos/GEMINI-TREINO/GEMINI-TREINO.md');
  assert.match(interno, /Cliente: \[\[trafegus\/sistema\/sistema\|interno\]\]/);
  const stratum = lerFrontmatter(ler(root, 'trafegus/casos/STRATUM-AQK8E12-BLOQ-20260910/STRATUM-AQK8E12-BLOQ-20260910.md'));
  assert.equal(stratum.cliente, 'Stratum');
  assert.equal(stratum.aberto, '2026-09-10');
  assert.equal(stratum.status, 'sem veredito');
  assert.ok(fs.existsSync(path.join(root, 'trafegus/clientes/Stratum.md')));
  assert.ok(!fs.existsSync(path.join(root, 'trafegus/clientes/SINTETICO.md')));
});

test('nota do cliente lista os casos', () => {
  const root = fixture();
  organizarVault({ rootDir: root });
  const cli = ler(root, 'trafegus/clientes/Elite GR.md');
  assert.equal(lerFrontmatter(cli).tipo, 'cliente');
  assert.match(cli, /\*\*Casos \(1\)\*\*/);
  assert.match(cli, /\[\[trafegus\/casos\/ELITE-QHP2G55-BLOQ-20260925\/ELITE-QHP2G55-BLOQ-20260925\|ELITE-QHP2G55-BLOQ-20260925\]\] \(2026-09-25\)/);
});

test('cada pasta da raiz e uma arvore separada, sem titulos ## e sem hub em templates', () => {
  const root = fixture();
  organizarVault({ rootDir: root });
  assert.ok(!fs.existsSync(path.join(root, 'Cerebro.md')));
  const topo = ler(root, 'trafegus/trafegus.md');
  assert.doesNotMatch(topo, /Acima:/);
  assert.match(topo, /\[\[trafegus\/casos\/casos\|casos\]\]/);
  assert.match(topo, /\[\[trafegus\/conhecimento\/conhecimento\|conhecimento\]\]/);
  assert.doesNotMatch(ler(root, 'empresa/empresa.md'), /Acima:|trafegus/);
  assert.ok(!fs.existsSync(path.join(root, 'templates/templates.md')));
  const tipo = ler(root, 'trafegus/conhecimento/eventos/Controle da Viagem/Controle da Viagem.md');
  assert.match(tipo, /Acima: \[\[trafegus\/conhecimento\/eventos\/eventos\|eventos\]\]/);
  assert.match(tipo, /Parada Não Autorizada em Percurso Mínimo/);
  assert.match(ler(root, 'trafegus/casos/casos.md'), /\[\[trafegus\/casos\/GEMINI-TREINO\/GEMINI-TREINO\|GEMINI-TREINO\]\]/);
  assert.match(ler(root, 'trafegus/conhecimento/eventos/eventos.md'), /Controle da Viagem\]\] \(2 notas\)/);
  assert.match(ler(root, 'empresa/empresa.md'), /vazio por enquanto/);
  for (const rel of ['trafegus/trafegus.md', 'trafegus/conhecimento/conhecimento.md', 'trafegus/conhecimento/eventos/Controle da Viagem/Controle da Viagem.md']) {
    assert.equal(lerFrontmatter(ler(root, rel)).tipo, 'hub', rel);
    assert.doesNotMatch(ler(root, rel), /^##\s/m, rel);
  }
});

test('segunda execucao nao reescreve nada', () => {
  const root = fixture();
  const primeira = organizarVault({ rootDir: root });
  assert.ok(primeira.escritos.length > 5);
  assert.deepEqual(organizarVault({ rootDir: root }).escritos, []);
});

test('preserva texto e chaves do usuario e atualiza o bloco automatico', () => {
  const root = fixture();
  organizarVault({ rootDir: root });
  const rel = 'trafegus/clientes/Elite GR.md';
  const editada = ler(root, rel).replace('tipo: cliente', 'tipo: cliente\ntags: [vip]') + '\nContato: via central.\n';
  fs.writeFileSync(path.join(root, rel), editada);
  escrever(root, 'trafegus/casos/ELITE-OUTRO-20260926/entrada.json', JSON.stringify({ cliente: 'elitegr', criado_em: '2026-09-26T00:00:00Z' }));
  const r = organizarVault({ rootDir: root });
  assert.ok(r.escritos.includes(rel));
  const final = ler(root, rel);
  assert.match(final, /tags: \[vip\]/);
  assert.match(final, /Contato: via central\./);
  assert.match(final, /\*\*Casos \(2\)\*\*/);
  assert.equal(final.split('auto:inicio').length - 1, 1);
  assert.deepEqual(organizarVault({ rootDir: root }).escritos, []);
});

test('nota existente sem marcadores recebe o bloco no topo e mantem o texto', () => {
  const novo = mesclarNota('# Minhas anotacoes\ntexto\n', [['tipo', 'hub']], '# x');
  assert.match(novo, /^---\ntipo: hub\n---\n<!-- auto:inicio[^\n]*-->\n# x\n<!-- auto:fim -->\n\n# Minhas anotacoes\ntexto\n$/);
  assert.equal(mesclarNota(novo, [['tipo', 'hub']], '# x'), novo);
});

test('nomes de cliente, artigos citados e nomes de arquivo', () => {
  assert.equal(nomeCliente('komando (ID MCP 36)'), 'Komando');
  assert.equal(nomeCliente('Rotele / GR Global'), 'GR Global');
  assert.equal(nomeCliente('EliteGR, MCP 27 habilitado'), 'Elite GR');
  assert.equal(nomeCliente('CCI (prints CCI)'), 'CCI');
  assert.equal(nomeCliente('gruposc'), 'Grupo SC');
  assert.equal(nomeCliente('', 'STRATUM-AQK8E12'), 'Stratum');
  assert.equal(nomeCliente('SINTETICO'), null);
  assert.equal(nomeCliente('', 'KNOWLEDGE-ECONOMIA-V2'), null);
  assert.equal(nomeCliente('novocliente'), 'Novocliente');
  assert.deepEqual(artigosCitados('Regra art. 570272 (item 521). Regras 522231 e 523802 lidas. REGRA-ART-534104. esis 64753985. start 123456'), ['522231', '523802', '534104', '570272']);
  assert.equal(nomeArquivoSeguro('Autorização/Deslacre: "x" [grupo]#1.'), 'Autorização-Deslacre- -x- -grupo-1');
  assert.equal(nomeArquivoSeguro('a'.repeat(120)).length, 90);
});

test('nomes de cliente seguem o cadastro do MCP (prefixo do ID e nome inteiro)', () => {
  assert.equal(nomeCliente('GAGA2', 'GAGA2-RIW1D67-CHEGSAIDA-20260908'), 'HH2 Risk');
  assert.equal(nomeCliente('3 Corações', '3COR-ECJ1I41-PERNOITE-20261005'), '3 Corações');
  assert.equal(nomeCliente('3 Corações'), '3 Corações');
  assert.equal(nomeCliente('GR Parceria', 'GRPARC-TPZ4A14-PERNOITE-MOVIND-20261006'), 'GR Parceria');
  assert.equal(nomeCliente('', 'GRPARCERIA-FCF2778-PGR-20261007'), 'GR Parceria');
  assert.equal(nomeCliente('Total Express', 'TOTAL-NAOCONF-EMAIL-20261008'), 'Total Express');
  assert.equal(nomeCliente('EliteGR (ID MCP 27); transportadora Zeni', 'ZENI-RKX6F33-BLOQUEIO-202609'), 'Elite GR');
  assert.equal(nomeCliente('Rotele / GR Global', 'ROTELE-RWB5D75-EFETIVACAO-20260911'), 'GR Global');
  assert.equal(nomeCliente('', 'GEMINI-TREINAMENTO-ETAPA2'), null);
});

