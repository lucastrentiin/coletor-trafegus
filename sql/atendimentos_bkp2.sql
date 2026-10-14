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
  AND (
      (
          cb.data_resolvido IS NULL
          AND (cb.data_reaberto IS NULL OR cb.data_reaberto < $1)
      )
      OR cb.data_resolvido >= $1
  );
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
  AND (
      (
          cb.data_resolvido IS NULL
          AND (cb.data_reaberto IS NULL OR cb.data_reaberto < $2)
      )
      OR cb.data_resolvido >= $2
  );
-- ENDQUERY
