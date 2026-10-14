#!/usr/bin/env bash
# Reorganizacao do vault em arvore (2026-09-29). Rodar de ~/apps/coletor, com o MCP no ar, depois de:
#   1) codigo novo + testes passando (node --test mcp/test/*.test.mjs);
#   2) node scripts/kb-dividir-eventos.mjs /srv/vault/conhecimento /tmp/kb-arvore/conhecimento agent_sync/tests/2026-09-29-kb-divisao-eventos.json
#   3) notas novas em /tmp/kb-arvore/notas/ (COMO-USAR, templates, sistema, servidor, projetos).
# Nao apaga nada: o conhecimento antigo vai para ~/backups-vault/. Rollback: ver agent_sync/changes/2026-09-29-claude-vault-arvore.md.
set -euo pipefail
V=/srv/vault
C="$HOME/apps/coletor"
ST=/tmp/kb-arvore
B="$HOME/backups-vault"
cd "$C"
trap 'echo "FALHOU na linha $LINENO. Se o MCP ja estava parado, siga o rollback do handoff antes de subir de novo."' ERR

echo '==> 0/7 Pre-condicoes'
test -d "$V/casos" && test -d "$V/conhecimento" || { echo 'estrutura antiga nao encontrada (ja reorganizado?)'; exit 1; }
test -f "$ST/conhecimento/.verificado" || { echo 'divisao dos eventos nao verificada'; exit 1; }
test -f "$ST/notas/COMO-USAR.md" || { echo 'notas novas ausentes'; exit 1; }
test "$(grep -c 'CASOS_DIR: /vault/casos$' docker-compose.yml)" = 1 || { echo 'compose inesperado (CASOS_DIR)'; exit 1; }
test "$(grep -c 'KNOWLEDGE_DIR: /vault/conhecimento$' docker-compose.yml)" = 1 || { echo 'compose inesperado (KNOWLEDGE_DIR)'; exit 1; }
test "$(grep -c -- '- /srv/vault/conhecimento:/app/knowledge:ro' docker-compose.yml)" = 2 || { echo 'compose inesperado (montagens)'; exit 1; }
test ! -e "$B/conhecimento-antes-arvore-20260929" || { echo 'backup de conhecimento ja existe'; exit 1; }

echo '==> 1/7 Backup (tar + git + compose)'
mkdir -p "$B"
tar czf "$B/vault-antes-arvore-20260929.tgz" -C /srv vault
cp docker-compose.yml docker-compose.yml.bak.pre-arvore-20260929
git -C "$V" add -A
git -C "$V" commit -qm 'antes da reorganizacao em arvore' || true

echo '==> 2/7 Build da nova imagem do MCP (o servico atual segue no ar)'
docker compose build coletor-mcp > /tmp/kb-arvore/build.log 2>&1 || { tail -20 /tmp/kb-arvore/build.log; exit 1; }

echo '==> 3/7 Parando o MCP'
docker compose stop coletor-mcp

echo '==> 4/7 Movendo para a arvore'
mkdir -p "$V/coletor" "$V/empresa" "$V/projetos" "$V/servidor/tarefas" "$V/inbox"
mv "$V/casos" "$V/coletor/casos"
mv "$V/conhecimento" "$B/conhecimento-antes-arvore-20260929"
mkdir "$V/coletor/conhecimento"
cp -a "$ST/conhecimento/." "$V/coletor/conhecimento/"
rm -f "$V/coletor/conhecimento/.verificado"
if [ -d "$V/trafegus" ]; then mv "$V/trafegus" "$V/coletor/armadilhas"; else mkdir -p "$V/coletor/armadilhas"; fi
if [ -f "$V/tarefas/teste-vault.md" ]; then mv "$V/tarefas/teste-vault.md" "$V/servidor/tarefas/teste-vault.md"; fi
rmdir "$V/tarefas" 2>/dev/null || echo '    AVISO: tarefas/ na raiz nao esta vazia; mantida como esta'
cp -a "$ST/notas/." "$V/"

echo '==> 5/7 docker-compose.yml'
sed -i 's#CASOS_DIR: /vault/casos$#CASOS_DIR: /vault/coletor/casos#; s#KNOWLEDGE_DIR: /vault/conhecimento$#KNOWLEDGE_DIR: /vault/coletor/conhecimento#; s#- /srv/vault/conhecimento:/app/knowledge:ro#- /srv/vault/coletor/conhecimento:/app/knowledge:ro#' docker-compose.yml
test "$(grep -c 'CASOS_DIR: /vault/coletor/casos$' docker-compose.yml)" = 1
test "$(grep -c 'KNOWLEDGE_DIR: /vault/coletor/conhecimento$' docker-compose.yml)" = 1
test "$(grep -c -- '- /srv/vault/coletor/conhecimento:/app/knowledge:ro' docker-compose.yml)" = 2
docker compose config -q

echo '==> 6/7 Organizador (hubs, fichas de caso, clientes)'
node scripts/vault-organizar.mjs "$V" | cut -c1-300
node --input-type=module -e "import { organizarVault } from './mcp/lib/vault-organizar.mjs'; const r = organizarVault({ rootDir: '$V' }); if (r.escritos.length) { console.error('organizador instavel:', r.escritos); process.exit(1); } console.log('    organizador estavel; avisos:', JSON.stringify(r.avisos));"

echo '==> 7/7 Subindo MCP e web'
docker compose up -d coletor-mcp coletor-web
sleep 5
docker ps --format '{{.Names}} | {{.Status}}' | grep coletor
git -C "$V" add -A
git -C "$V" commit -qm 'reorganizacao em arvore' || true
echo 'REORGANIZACAO_OK'
