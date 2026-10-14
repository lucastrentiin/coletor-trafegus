# Handoff: árvores separadas no cérebro + prompt de análise no vault

- **Autor:** Claude (Claude Code)
- **Data:** 2026-09-29
- **Objetivo:** cada pasta da raiz do vault vira uma árvore própria no Obsidian (trafegus, projetos, empresa, servidor, inbox), sem nota raiz ligando todas e sem links entre árvores; guardar o prompt de análise Trafegus no vault.
- **Estado:** instalado no servidor; testes do host passando; MCP do cérebro público ativo (https://cerebro.laselene.com.br/health = 200; /mcp sem token = 401).
- **Responsável seguinte:** Lucas (conectar as IAs com o token de ~/docker/cerebro/.env; Obsidian nos outros dispositivos).

## Arquivos
- mcp/lib/vault-organizar.mjs: não gera mais Cerebro.md; o hub de cada pasta da raiz não tem linha "Acima"; subpastas continuam ligadas ao hub de cima. Backup: .bak.pre-arvores-20260929.
- mcp/test/vault-organizar.test.mjs: teste "cada pasta da raiz e uma arvore separada". Backup: .bak.pre-arvores-20260929.
- scripts/vault-checar-arvores.mjs (novo): falha se algum link [[...]] aponta para outra árvore ou se nota solta na raiz tem link.
- Vault: Cerebro.md removido; COMO-USAR.md, trafegus/sistema/arquitetura.md, servidor/infraestrutura.md e servidor/conectar-ias.md reescritos com referências entre árvores como texto; projetos/*/visao-geral.md com "Onde roda: servidor/infraestrutura.md"; novo trafegus/sistema/prompt-analise.md (prompt de início de análise atualizado: vault_indice, trafegus/tarefas, vault_buscar em trafegus/casos e trafegus/armadilhas, executar_comando com logs, veredito com "Resumo:" e "art. NNNNNN").

## Regra nova
- Links do Obsidian só dentro da mesma árvore. Para citar outra árvore, escrever o caminho como texto (ex.: servidor/infraestrutura.md). Conferir com node scripts/vault-checar-arvores.mjs /srv/vault.

## Limitações
- As imagens dos MCPs ainda têm o organizador anterior em mcp/lib, mas ele não é usado em runtime (o organizador roda no host pelo cron). O próximo build sincroniza.
- O Obsidian desenha maior o nó com mais ligações; os hubs de tipo de evento aparecem maiores que o topo trafegus. Cores por árvore: Grupos do gráfico com path:trafegus, path:projetos etc.

## Rollback
- Restaurar mcp/lib/vault-organizar.mjs e mcp/test/vault-organizar.test.mjs dos .bak.pre-arvores-20260929; no vault, git -C /srv/vault log (commit "antes de separar as arvores") e git checkout <hash> -- . para as notas, ou restaurar ~/backups-vault/vault-antes-trafegus-20260929.tgz.

## Guia do usuário
- Manual do Cérebro publicado como artifact privado do Lucas (como funciona, conectar as IAs, projetos, Obsidian, manutenção, prompt de análise).
