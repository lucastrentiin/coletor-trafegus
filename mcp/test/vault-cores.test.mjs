import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { atualizarCoresGrafico, coresAutomaticas, pastaDaConsulta, cssDasPastas, hslParaRgb } from '../lib/vault-cores.mjs';

function vault() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vault-cores-'));
  for (const d of ['trafegus/casos/X', 'trafegus/casos/Y', 'trafegus/conhecimento/eventos/Tipo A', 'projetos/cerebro', 'servidor/tarefas', 'templates', '.git/objects'])
    fs.mkdirSync(path.join(root, d), { recursive: true });
  return root;
}
const lerJson = (root, rel) => JSON.parse(fs.readFileSync(path.join(root, '.obsidian', rel), 'utf8'));
const rgbParaHsl = rgb => {
  const r = (rgb >> 16 & 255) / 255, g = (rgb >> 8 & 255) / 255, b = (rgb & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  return { l: (max + min) / 2 };
};

test('hslParaRgb converte cores conhecidas', () => {
  assert.equal(hslParaRgb(0, 100, 50), 0xff0000);
  assert.equal(hslParaRgb(120, 100, 50), 0x00ff00);
  assert.equal(hslParaRgb(0, 0, 100), 0xffffff);
});

test('todas as pastas de qualquer nivel ganham cor, as mais fundas primeiro, sem templates nem ocultas', () => {
  const root = vault();
  const c = coresAutomaticas(root);
  const pastas = c.map(x => x.pasta);
  for (const p of ['trafegus', 'trafegus/casos', 'trafegus/casos/X', 'trafegus/conhecimento/eventos/Tipo A', 'projetos/cerebro', 'servidor/tarefas'])
    assert.ok(pastas.includes(p), 'faltou ' + p);
  assert.ok(!pastas.some(p => p.startsWith('templates') || p.startsWith('.')));
  for (let i = 1; i < c.length; i++) assert.ok(c[i - 1].prof >= c[i].prof, 'ordem por profundidade');
});

test('tom clareia conforme desce na mesma arvore', () => {
  const c = Object.fromEntries(coresAutomaticas(vault()).map(x => [x.pasta, x.rgb]));
  const l = p => rgbParaHsl(c[p]).l;
  assert.ok(l('trafegus') < l('trafegus/conhecimento'));
  assert.ok(l('trafegus/conhecimento') < l('trafegus/conhecimento/eventos'));
  assert.ok(l('trafegus/conhecimento/eventos') < l('trafegus/conhecimento/eventos/Tipo A'));
  assert.notEqual(c['trafegus/casos/X'], c['trafegus/casos/Y'], 'irmas com variacao');
});

test('cria graph.json, CSS e appearance; idempotente; preserva busca, outros grupos e cor trocada a mao', () => {
  const root = vault();
  fs.mkdirSync(path.join(root, '.obsidian'));
  fs.writeFileSync(path.join(root, '.obsidian/graph.json'), JSON.stringify({ search: '', repelStrength: 14,
    colorGroups: [{ query: 'tag:#urgente', color: { a: 1, rgb: 7 } }, { query: 'path:sumiu', color: { a: 1, rgb: 9 } }] }));
  fs.writeFileSync(path.join(root, '.obsidian/appearance.json'), JSON.stringify({ enabledCssSnippets: ['meu'] }));
  assert.equal(atualizarCoresGrafico({ rootDir: root }), true);
  let g = lerJson(root, 'graph.json');
  assert.equal(g.repelStrength, 14);
  assert.deepEqual(g.colorGroups[0], { query: 'tag:#urgente', color: { a: 1, rgb: 7 } });
  assert.ok(!g.colorGroups.some(x => /sumiu/.test(x.query)));
  assert.deepEqual(lerJson(root, 'appearance.json').enabledCssSnippets, ['meu', 'cores-pastas']);
  assert.equal(atualizarCoresGrafico({ rootDir: root }), false);
  // usuario troca a cor de casos: e mantida; as demais continuam automaticas
  const i = g.colorGroups.findIndex(x => x.query === 'path:"trafegus/casos/"');
  g.colorGroups[i].color.rgb = 0x123456;
  fs.writeFileSync(path.join(root, '.obsidian/graph.json'), JSON.stringify(g));
  atualizarCoresGrafico({ rootDir: root });
  g = lerJson(root, 'graph.json');
  assert.equal(g.colorGroups.find(x => x.query === 'path:"trafegus/casos/"').color.rgb, 0x123456);
  assert.match(fs.readFileSync(path.join(root, '.obsidian/snippets/cores-pastas.css'), 'utf8'), /data-path="trafegus\/casos"\][^{]*\{ color: #123456; \}/);
});

test('cores de um esquema antigo (sem cores-auto.json) sao trocadas pelos tons novos', () => {
  const root = vault();
  fs.mkdirSync(path.join(root, '.obsidian'));
  fs.writeFileSync(path.join(root, '.obsidian/graph.json'), JSON.stringify({ colorGroups: [{ query: 'path:"trafegus/casos/"', color: { a: 1, rgb: 0x4caf50 } }] }));
  atualizarCoresGrafico({ rootDir: root });
  const novo = lerJson(root, 'graph.json').colorGroups.find(x => x.query === 'path:"trafegus/casos/"').color.rgb;
  assert.notEqual(novo, 0x4caf50);
});

test('CSS: pasta rasa antes da funda e arquivos herdam a cor da pasta mais proxima', () => {
  const css = cssDasPastas([
    { query: 'path:"a/b/"', color: { a: 1, rgb: 0x222222 } }, { query: 'path:"a/"', color: { a: 1, rgb: 0x111111 } }, { query: 'tag:#x', color: { a: 1, rgb: 1 } }]);
  assert.ok(css.indexOf('data-path="a"]') < css.indexOf('data-path="a/b"]'));
  assert.match(css, /\.nav-file-title\[data-path\^="a\/b\/"\] \{ color: #222222; \}/);
  assert.ok(!/tag/.test(css));
});

test('graph.json invalido nao e sobrescrito', () => {
  const root = vault();
  fs.mkdirSync(path.join(root, '.obsidian'));
  fs.writeFileSync(path.join(root, '.obsidian/graph.json'), '{quebrado');
  assert.equal(atualizarCoresGrafico({ rootDir: root }), false);
  assert.equal(fs.readFileSync(path.join(root, '.obsidian/graph.json'), 'utf8'), '{quebrado');
});

test('pastaDaConsulta reconhece so consultas de pasta', () => {
  assert.equal(pastaDaConsulta('path:trafegus/casos'), 'trafegus/casos');
  assert.equal(pastaDaConsulta('tag:#urgente'), null);
});
