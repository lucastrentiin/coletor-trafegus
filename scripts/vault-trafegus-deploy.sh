#!/usr/bin/env bash
# Renomeia o galho coletor/ -> trafegus/ no vault, publica o MCP do cerebro (so tools vault_*) e liga o organizador no cron.
# Rodar de ~/apps/coletor depois de instalar o codigo (tests ok). Nao apaga dados: backup em ~/backups-vault/.
# Rollback: ver agent_sync/changes/2026-09-29-claude-vault-arvore.md.
set -euo pipefail
V=/srv/vault
C="$HOME/apps/coletor"
N=/tmp/kb-trafegus/notas
B="$HOME/backups-vault"
CE="$HOME/docker/cerebro"
cd "$C"
trap 'echo "FALHOU na linha $LINENO. Se o MCP ja estava parado, siga o rollback do handoff antes de subir de novo."' ERR

echo '==> 0/9 Pre-condicoes'
test -d "$V/coletor/casos" && test -d "$V/coletor/conhecimento/eventos" || { echo 'galho coletor/ nao encontrado (ja renomeado?)'; exit 1; }
test ! -e "$V/trafegus" || { echo 'ja existe /srv/vault/trafegus'; exit 1; }
test -f "$N/COMO-USAR.md" && test -f "$N/servidor/conectar-ias.md" || { echo 'notas novas ausentes'; exit 1; }
test "$(grep -c 'CASOS_DIR: /vault/coletor/casos$' docker-compose.yml)" = 1 || { echo 'compose inesperado (CASOS_DIR)'; exit 1; }
test "$(grep -c 'KNOWLEDGE_DIR: /vault/coletor/conhecimento$' docker-compose.yml)" = 1 || { echo 'compose inesperado (KNOWLEDGE_DIR)'; exit 1; }
test "$(grep -c -- '- /srv/vault/coletor/conhecimento:/app/knowledge:ro' docker-compose.yml)" = 2 || { echo 'compose inesperado (montagens)'; exit 1; }
test "$(grep -c 'cerebro' docker-compose.yml Dockerfile.mcp | awk -F: '{s+=$2} END {print s}')" = 0 || { echo 'cerebro ja configurado'; exit 1; }
grep -q "registrarToolsVault(server, obterVault)" mcp-http.mjs || { echo 'mcp-http.mjs sem o patch das tools compartilhadas'; exit 1; }
test -f cerebro-http.mjs || { echo 'cerebro-http.mjs ausente'; exit 1; }

echo '==> 1/9 Backup (tar + git + compose + Dockerfile)'
mkdir -p "$B"
tar czf "$B/vault-antes-trafegus-20260929.tgz" -C /srv vault
cp docker-compose.yml docker-compose.yml.bak.pre-trafegus-20260929
cp Dockerfile.mcp Dockerfile.mcp.bak.pre-trafegus-20260929
git -C "$V" add -A
git -C "$V" commit -qm 'antes de renomear coletor para trafegus' || true

echo '==> 2/9 Token e servico do MCP do cerebro (nao exibe o token)'
mkdir -p "$CE/state"
if [ ! -f "$CE/.env" ]; then (umask 077; printf 'CEREBRO_API_TOKEN=%s\n' "$(openssl rand -hex 32)" > "$CE/.env"); fi
chmod 600 "$CE/.env"
sed -i 's#^COPY mcp/lib ./mcp/lib$#COPY mcp/lib ./mcp/lib\nCOPY cerebro-http.mjs ./cerebro-http.mjs#' Dockerfile.mcp
test "$(grep -c '^COPY cerebro-http.mjs ./cerebro-http.mjs$' Dockerfile.mcp)" = 1
cat >> docker-compose.yml <<'SERVICO'

  cerebro-mcp:
    build:
      context: .
      dockerfile: Dockerfile.mcp
    container_name: cerebro-mcp
    restart: unless-stopped
    user: "1000:1000"
    command: ["node", "cerebro-http.mjs"]
    env_file:
      - /home/lucas/docker/cerebro/.env
    environment:
      VAULT_DIR: /vault
      VAULT_LOG: /state/vault-escritas.jsonl
      MCP_PORT: 8000
      HOME: /tmp
    volumes:
      - /srv/vault:/vault
      - /home/lucas/docker/cerebro/state:/state
    ports:
      - "127.0.0.1:8766:8000"
SERVICO
docker compose config -q
docker compose config --services | grep -qx cerebro-mcp

echo '==> 3/9 Build (servicos atuais seguem no ar) e testes dentro da imagem'
docker compose build coletor-mcp cerebro-mcp > /tmp/kb-trafegus/build.log 2>&1 || { tail -20 /tmp/kb-trafegus/build.log; exit 1; }
docker compose run --rm --no-deps -v "$C/mcp/test:/app/mcp/test:ro" --entrypoint node cerebro-mcp --test \
  /app/mcp/test/vault.test.mjs /app/mcp/test/vault-organizar.test.mjs /app/mcp/test/vault-tools.test.mjs /app/mcp/test/knowledge-index-hub.test.mjs 2>&1 \
  | tee /tmp/kb-trafegus/testes-imagem.log | grep -E '^# (tests|pass|fail|skipped)'
grep -q '^# fail 0$' /tmp/kb-trafegus/testes-imagem.log && grep -q '^# skipped 0$' /tmp/kb-trafegus/testes-imagem.log || { echo 'testes falharam na imagem'; exit 1; }

echo '==> 4/9 Parando o MCP do Trafegus'
docker compose stop coletor-mcp

echo '==> 5/9 Renomeando coletor/ -> trafegus/'
mv "$V/coletor" "$V/trafegus"
rm -f "$V/trafegus/coletor.md"
node scripts/vault-trafegus-links.mjs "$V/trafegus/conhecimento"
cp -a "$N/." "$V/"
node scripts/patch-trafegus-codigo.mjs . prompt

echo '==> 6/9 docker-compose.yml (caminhos)'
sed -i 's#CASOS_DIR: /vault/coletor/casos$#CASOS_DIR: /vault/trafegus/casos#; s#KNOWLEDGE_DIR: /vault/coletor/conhecimento$#KNOWLEDGE_DIR: /vault/trafegus/conhecimento#; s#- /srv/vault/coletor/conhecimento:/app/knowledge:ro#- /srv/vault/trafegus/conhecimento:/app/knowledge:ro#' docker-compose.yml
test "$(grep -c 'CASOS_DIR: /vault/trafegus/casos$' docker-compose.yml)" = 1
test "$(grep -c 'KNOWLEDGE_DIR: /vault/trafegus/conhecimento$' docker-compose.yml)" = 1
test "$(grep -c -- '- /srv/vault/trafegus/conhecimento:/app/knowledge:ro' docker-compose.yml)" = 2
docker compose config -q

echo '==> 7/9 Organizador'
node scripts/vault-organizar.mjs "$V" | cut -c1-200
node --input-type=module -e "import { organizarVault } from './mcp/lib/vault-organizar.mjs'; const r = organizarVault({ rootDir: '$V' }); if (r.escritos.length) { console.error('organizador instavel:', r.escritos); process.exit(1); } console.log('    organizador estavel; avisos:', JSON.stringify(r.avisos));"
test ! -e "$V/coletor" && test -f "$V/trafegus/trafegus.md"
RESTOS="$(grep -rl --include='*.md' '\[\[coletor/' "$V" || true)"
test -z "$RESTOS" || { echo "links antigos restantes:"; echo "$RESTOS" | head; exit 1; }
echo '    nenhum link antigo para coletor/'

echo '==> 8/9 Subindo MCP do Trafegus, web e MCP do cerebro'
docker compose up -d coletor-mcp coletor-web cerebro-mcp
sleep 6
docker ps --format '{{.Names}} | {{.Status}}' | grep -E 'coletor|cerebro'
docker logs --tail 3 coletor-trafegus-mcp
docker logs --tail 3 cerebro-mcp
echo "cerebro /health: $(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8766/health) (esperado 200)"
echo "cerebro sem token: $(curl -s -o /dev/null -w '%{http_code}' -X POST http://127.0.0.1:8766/mcp) (esperado 401)"
T="$(sed -n 's/^CEREBRO_API_TOKEN=//p' "$CE/.env")"
TOOLS="$(curl -s -X POST http://127.0.0.1:8766/mcp -H "Authorization: Bearer $T" -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | grep -o '"name":"vault_[a-z]*"' | sort -u | wc -l)"
INDICE="$(curl -s -X POST http://127.0.0.1:8766/mcp -H "Authorization: Bearer $T" -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"vault_indice","arguments":{}}}' | grep -c '## trafegus' || true)"
unset T
echo "cerebro tools vault_*: $TOOLS (esperado 6); indice com galho trafegus: $INDICE (esperado 1)"
test "$TOOLS" = 6 && test "$INDICE" -ge 1

echo '==> 9/9 Cron (organizador + backup git a cada 15 min) e commit'
( crontab -l 2>/dev/null | grep -v 'srv/vault'; echo '*/15 * * * * cd /srv/vault && /usr/bin/node /home/lucas/apps/coletor/scripts/vault-organizar.mjs /srv/vault >> /home/lucas/docker/vault/organizar.log 2>&1; git add -A && git commit -qm auto >/dev/null 2>&1' ) | crontab -
crontab -l | grep 'srv/vault'
git -C "$V" add -A
git -C "$V" commit -qm 'galho coletor renomeado para trafegus; MCP do cerebro' || true
echo 'DEPLOY_TRAFEGUS_OK'
