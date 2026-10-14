# Handoff: cérebro (vault Obsidian) + tools vault_* no WEB MCP

- **Autor:** Claude (Claude Code, via SSH web)
- **Data:** 2026-09-29
- **Objetivo:** memória persistente (tarefas pausadas, casos, armadilhas, conhecimento) num único lugar, legível pelo Obsidian e pelo MCP, para economizar tokens.
- **Estado:** publicado no coletor-mcp. Tools novas validadas dentro do container (módulo real, /vault real); validação via conector claude.ai pendente numa sessão nova (lista de tools é carregada ao iniciar a sessão).

## Arquivos
- mcp/lib/vault.mjs (novo) e mcp/test/vault.test.mjs (novo, 14 testes).
- mcp-http.mjs: +6 tools vault_*; removidas buscar_conhecimento e ler_documento_conhecimento (substituídas por vault_buscar/vault_ler com paginação). Backup: mcp-http.mjs.bak.pre-vault-20260929.
- docker-compose.yml: coletor-mcp roda como 1000:1000 + group_add 983 (docker.sock), HOME=/tmp, VAULT_DIR=/vault, CASOS_DIR=/vault/casos, KNOWLEDGE_DIR=/vault/conhecimento, volume /srv/vault:/vault. coletor-web/job montam /srv/vault/conhecimento. Backup: docker-compose.yml.bak.pre-vault-20260929.
- Migração: ./casos -> /srv/vault/casos; ./knowledge -> /srv/vault/conhecimento (chown 1000 nos casos e mcp/state).
- agent_sync/prompt-analise.md: buscar_conhecimento -> vault_buscar(pasta=conhecimento); início com vault_indice.
- /srv/vault/COMO-USAR.md (protocolo). INDICE.md manual removido: vault_indice gera o índice do frontmatter (tarefa/resumo + status) e da 1a linha do veredito.md dos casos.
- WebDAV: ~/docker/vault (rclone serve webdav, 127.0.0.1:8765, uid 1000). Credencial só em ~/docker/vault/.env (600). Túnel: vault.laselene.com.br -> http://localhost:8765 (sem Access).
- Backup: git em /srv/vault + cron do lucas a cada 15 min.

## Interfaces
vault_indice(); vault_listar(pasta?, recursivo?); vault_ler(caminho, inicio?, limite<=8000); vault_buscar(termo>=2, pasta?, limite<=30) -> caminho+linha+trecho 200; vault_escrever(caminho, conteudo, modo criar|substituir|anexar); vault_editar(caminho, trecho_antigo único, trecho_novo).
Escrita só .md em tarefas/ casos/ projetos/ trafegus/ inbox/, máx 100 KB, atômica, bloqueio de segredos, log em /state/vault-escritas.jsonl.

## Testes e resultados
- node --test mcp/test/*.test.mjs: 87/87 ok (inclui ..; absoluto; \; byte nulo; symlink; ocultos; pastas proibidas; criar existente; editar 0 e 2+; segredo; 100 KB; índice; busca sem acento).
- Corrigido regex de segredo com backtracking quadrático (100 KB levava 28 s; agora ms).
- Smoke no container: criou tarefas/teste-vault.md (dono 1000), segredo bloqueado, índice e busca ok. listar_casos ok após migração. WebDAV local 207 com senha / 401 sem; público 401 sem senha.

## Limitações
- executar_comando status retorna lista vazia (project name do compose difere; aparenta ser anterior a esta mudança).
- Remotely Save grátis não mescla conflitos: histórico git é a rede de segurança.
- Casos contêm dados brutos (.sql/.json.gz); no celular, ignorar esses arquivos no Remotely Save.

## Rollback
docker compose stop coletor-mcp; mv /srv/vault/casos ./casos; mv /srv/vault/conhecimento ./knowledge; restaurar os dois .bak; docker compose up -d --build coletor-mcp coletor-web. WebDAV: cd ~/docker/vault && docker compose down.

## Pendências / responsável seguinte
- Lucas: Obsidian + Remotely Save nos dispositivos; teste ponta a ponta (editar tarefas/teste-vault.md no Obsidian).
- Próximo assistente: validar vault_* via conector numa sessão nova; migrar resumos úteis de casos antigos para trafegus/ quando pedido.

## Ajuste 2026-09-29 (pós-teste Obsidian)
- Remotely Save usa a subpasta remota com o nome do cofre. rclone agora roda com --baseurl /Cerebro (raiz do vault = /Cerebro/ no WebDAV) e --exclude /.git/** /.gitignore. Todo dispositivo deve nomear o cofre "Cerebro" (ou definir a pasta remota como Cerebro).
