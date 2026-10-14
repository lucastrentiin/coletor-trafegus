-- Parâmetros:
--   $1 = início do período (inclusivo)  ex: 2026-08-01 00:00:00
--   $2 = fim do período (EXCLUSIVO)     ex: 2026-09-01 00:00:00
--   $3 = filtro de cliente (texto)
--
-- Backlog: chamados reabertos depois do corte usam o histórico de status
-- (as datas do bi guardam só o último evento).


-- QUERY: ATENDIMENTOS_BACKLOG_ENTRADA
SELECT COUNT(*)::bigint AS quantidade
FROM estatistica.chamados_bi cb
WHERE cb.cliente ILIKE '%' || $3 || '%'
  AND (
      cb.deletado IS NOT TRUE
      OR (
          cb.deletado IS TRUE
          AND cb.data_resolvido >= $1
      )
  )
  AND cb.data_criacao < $1
  AND $2::date IS NOT NULL
  AND CASE
        WHEN cb.data_reaberto >= $1 THEN
          COALESCE((
            SELECT h.status
            FROM estatistica.chamados_historico_status h
            WHERE h.chamado_id = cb.id
              AND h.data_alteracao < $1
            ORDER BY h.data_alteracao DESC
            LIMIT 1
          ), 'Novo') NOT IN ('Resolvido / Concluído', 'Fechado / Concluído',
                             'Cancelado / Rejeitado', 'Mesclado')
        ELSE (cb.data_resolvido IS NULL OR cb.data_resolvido >= $1)
      END;
-- ENDQUERY


-- QUERY: ATENDIMENTOS_ABERTOS_PERIODO
SELECT COUNT(*)::bigint AS quantidade
FROM estatistica.chamados_bi cb
WHERE cb.cliente ILIKE '%' || $3 || '%'
  AND cb.deletado IS NOT TRUE
  AND cb.data_criacao >= $1
  AND cb.data_criacao < $2;
-- ENDQUERY


-- QUERY: ATENDIMENTOS_FECHADOS_PERIODO
SELECT COUNT(*)::bigint AS quantidade
FROM estatistica.chamados_bi cb
WHERE cb.cliente ILIKE '%' || $3 || '%'
  AND cb.deletado IS NOT TRUE
  AND cb.data_resolvido >= $1
  AND cb.data_resolvido < $2;
-- ENDQUERY


-- QUERY: ATENDIMENTOS_BACKLOG_SAIDA
SELECT COUNT(*)::bigint AS quantidade
FROM estatistica.chamados_bi cb
WHERE cb.cliente ILIKE '%' || $3 || '%'
  AND (
      cb.deletado IS NOT TRUE
      OR (
          cb.deletado IS TRUE
          AND cb.data_resolvido >= $2
      )
  )
  AND cb.data_criacao < $2
  AND $1::date IS NOT NULL
  AND CASE
        WHEN cb.data_reaberto >= $2 THEN
          COALESCE((
            SELECT h.status
            FROM estatistica.chamados_historico_status h
            WHERE h.chamado_id = cb.id
              AND h.data_alteracao < $2
            ORDER BY h.data_alteracao DESC
            LIMIT 1
          ), 'Novo') NOT IN ('Resolvido / Concluído', 'Fechado / Concluído',
                             'Cancelado / Rejeitado', 'Mesclado')
        ELSE (cb.data_resolvido IS NULL OR cb.data_resolvido >= $2)
      END;
-- ENDQUERY
