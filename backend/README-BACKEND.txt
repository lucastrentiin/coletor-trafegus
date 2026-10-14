BACKEND

index.js      -> ponto de entrada
collector.js  -> conecta aos clientes e executa os SQLs
sqlmap.js     -> carrega o unico arquivo sql/queries.sql
db.js         -> PostgreSQL + credenciais + SSH
auth/cfg      -> config/env
central.js    -> cria/grava banco central
report.js     -> gera HTML
test.js       -> testes estruturais
