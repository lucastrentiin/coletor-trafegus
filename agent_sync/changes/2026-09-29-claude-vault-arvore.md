# Handoff: cérebro em árvore (galho trafegus) + MCP do cérebro

- **Autor:** Claude (Claude Code)
- **Data:** 2026-09-29
- **Objetivo:** organizar o vault (/srv/vault) como uma árvore única para todos os assuntos do Lucas (galhos trafegus, empresa, projetos, servidor, inbox), com uma nota por evento TrafegusGR agrupada pelo tipo oficial, fichas de caso e notas de cliente interligadas; e permitir que qualquer IA (claude.ai, Claude Code, ChatGPT, Codex, Gemini) use o cérebro sem acesso ao Trafegus.
- **Estado:** publicado e validado em produção (MCP do Trafegus e MCP do cérebro no ar; organizador e backup no cron).
- **Responsável seguinte:** Lucas (Cloudflare + conectar as IAs) e próximo assistente (validar vault_* por conector numa sessão nova).

## Estrutura do vault
- Raiz: Cerebro.md (hub), COMO-USAR.md (protocolo), templates/.
- trafegus/: casos/<ID>/ (ficha <ID>.md automática + veredito e dados), clientes/ (uma nota por cliente, automática), conhecimento/ (KNOWLEDGE_DIR; documentos na raiz e eventos/<Tipo>/<Evento>.md, 365 eventos em 12 tipos oficiais), armadilhas/, sistema/arquitetura.md, tarefas/.
- empresa/, projetos/<projeto>/visao-geral.md (laselene-v2, laselene-producao, prospector, redesign), servidor/ (infraestrutura.md, conectar-ias.md, tarefas/teste-vault.md), inbox/.
- Cada pasta tem nota-hub com o mesmo nome (frontmatter tipo: hub). O organizador reescreve só o trecho entre <!-- auto:inicio --> e <!-- auto:fim -->.

## Arquivos (código em ~/apps/coletor)
- mcp/lib/vault.mjs: árvore (escrita em qualquer galho; protegidos templates/ e trafegus/conhecimento/), índice por galho, resumo que preserva identificadores com _, detecção de segredo que ignora nomes de variável em maiúsculas.
- mcp/lib/vault-organizar.mjs (novo) + scripts/vault-organizar.mjs (CLI do cron): hubs, fichas de caso (cliente, placa, resumo, eventos citados por "art. NNNNNN"), notas de cliente.
- mcp/lib/vault-tools.mjs (novo): registro das 6 tools vault_*, usado pelos dois MCPs. mcp-http.mjs passou a usar esse módulo.
- cerebro-http.mjs (novo): MCP só do cérebro (Bearer ou ?token=, comparação em tempo constante). Dockerfile.mcp copia o arquivo; serviço cerebro-mcp no docker-compose.yml (uid 1000, só /srv/vault e ~/docker/cerebro/state, 127.0.0.1:8766). Token em ~/docker/cerebro/.env (600), nunca exibido.
- mcp/lib/knowledge-index.mjs: ignora notas com tipo: hub.
- scripts/kb-dividir-eventos.mjs, vault-reorganizar-arvore.sh, vault-trafegus-links.mjs, patch-arvore-*.mjs, patch-trafegus-codigo.mjs, vault-trafegus-deploy.sh: scripts de migração usados (registro).
- docker-compose.yml: CASOS_DIR=/vault/trafegus/casos, KNOWLEDGE_DIR=/vault/trafegus/conhecimento, coletor-web/job montam /srv/vault/trafegus/conhecimento; serviço cerebro-mcp.
- agent_sync/prompt-analise.md: vault_indice no início, vault_buscar(pasta=trafegus/conhecimento), armadilhas em trafegus/armadilhas/, veredito com "Resumo:" e "art. NNNNNN".
- cron do lucas: */15 organizador + git commit do vault (log em ~/docker/vault/organizar.log).

## Interfaces
- vault_indice, vault_listar, vault_ler, vault_buscar, vault_escrever, vault_editar (mesmos parâmetros de antes; caminhos agora com galho, ex: trafegus/casos).
- MCP do cérebro: https://cerebro.laselene.com.br/mcp (após o hostname no Cloudflare), porta local 127.0.0.1:8766, /health público.
- Ferramentas de regra: documento passou a ser eventos/<Tipo>/<Evento>.md para os 365 eventos; ids REGRA-ART-* e sha256 inalterados; 2 ids REGRA-SEC mudaram (seções de grupo de Periféricos) — mapa em agent_sync/tests/2026-09-29-kb-divisao-eventos.json.

## Testes e resultados
- Host: 99 testes (98 ok, 1 pulado: vault-tools sem zod no host). Imagem: 26/26 (vault, organizador, vault-tools, knowledge-index-hub), incluindo symlink.
- Divisão: 5 arquivos reconstruídos byte a byte; 365 eventos; 374 regras antes = depois (título, sha256, artigo, PGR, sistema, tamanho); 349 tipos declarados no texto, 16 pelo arquivo (Periféricos); 2 nomes com sufixo de artigo por título duplicado (art 522641 e 523351).
- Renomeação: 365 links corrigidos, índice de regras idêntico, nenhum link [[coletor/ restante; organizador estável na 2ª execução.
- Produção: localizar_regra 523363 e 522583 com sha iguais aos de antes; ler_trecho_regra ok; listar_casos 22; fichas com links trafegus/; MCP do cérebro /health 200, sem token 401, 6 tools, vault_indice com galho trafegus.

## Limitações
- executar_comando usa COMPOSE_PROJECT_NAME coletor-trafegus-docker, diferente do projeto real (coletor): status vem vazio e build/subir por ele podem criar containers em conflito. Publicar pelo shell (anterior a esta mudança).
- Remotely Save gratuito não mescla conflitos; o histórico git do vault é a rede de segurança.
- O histórico git do vault contém as pastas temporárias de transferência (TMP-ARVORE-TRANSFER, TMP-TRAFEGUS-TRANSFER): cópias do código e dos testes (com segredos falsos de teste). Nenhum segredo real.
- Casos sem veredito e sem descrição ficam com resumo vazio (ex.: STRATUM).
- Tools novas só aparecem no claude.ai após reconectar o conector ou abrir uma conversa nova.

## Rollback
- Código: restaurar os .bak.pre-trafegus-20260929 (mcp/lib/vault.mjs, mcp/lib/vault-organizar.mjs, mcp-http.mjs, mcp/test/vault*.test.mjs, scripts/kb-dividir-eventos.mjs, docker-compose.yml, Dockerfile.mcp), remover cerebro-http.mjs e mcp/lib/vault-tools.mjs, docker compose build coletor-mcp && docker compose up -d coletor-mcp coletor-web && docker compose rm -sf cerebro-mcp.
- Vault: com o MCP parado, git -C /srv/vault log (commit "antes de renomear coletor para trafegus"), git reset --hard <hash> && git clean -fd; ou restaurar ~/backups-vault/vault-antes-trafegus-20260929.tgz. Estado anterior à árvore: ~/backups-vault/vault-antes-arvore-20260929.tgz e ~/backups-vault/conhecimento-antes-arvore-20260929/.
- Cron: remover a linha com srv/vault do crontab do lucas.

## Pendências
- Lucas: criar o hostname público cerebro.laselene.com.br -> http://localhost:8766 (sem Cloudflare Access) e conectar as IAs seguindo servidor/conectar-ias.md no vault.
- Próximo assistente: validar vault_* pelo conector numa sessão nova; avaliar corrigir COMPOSE_PROJECT_NAME do executar_comando.
