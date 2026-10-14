-- ================================================================
-- ATENDIMENTOS / CHAMADOS
-- ORIGEM: banco central separado, tabela estatistica.chamados_bi
-- $1 = inicio do periodo
-- $2 = fim do periodo (exclusivo)
-- $3 = nome do cliente no banco de atendimentos
--
-- (1) CHAMADOS EXCLUIDOS — deletado IS NOT TRUE
--   A tabela tem 5.984 chamados marcados como excluidos, quase todos com
--   status "Mesclado" (foram fundidos em outro chamado). O SQL nunca
--   filtrava essa coluna e contava todos eles, inflando os backlogs.
--   Exemplo 3 Coracoes, julho/2026 — 6 mesclados indevidos:
--       indicador          antes   depois   planilha antiga
--       backlog entrada      16       10          10
--       abertos              31       31          31
--       fechados             38       34          34
--       backlog saida         9        7           7
--   Usamos IS NOT TRUE (e nao = false) porque 62.645 registros tem a
--   coluna NULA: "<> true" descartaria todos eles junto.
--
-- (2) COMO O BANCO GUARDA O ESTADO (verificado em 97.888 chamados)
--   data_resolvido guarda o estado ATUAL, nao o historico. Quando um
--   chamado e reaberto ela volta a ficar NULL, e e preenchida de novo
--   quando ele fecha outra vez. Prova: nao existe UMA linha sequer com
--   data_reaberto > data_resolvido (0 de 10.159 reaberturas), e ha 84
--   chamados com reabertura e data_resolvido nula.
--
-- REGRA DO CLIENTE: "se e reaberto em agosto, nao pode voltar pro
-- backlog de julho". O numero de um mes fechado nao pode mudar depois.
-- ================================================================

-- QUERY: ATENDIMENTOS_BACKLOG_ENTRADA
-- Chamados que estavam EM ABERTO no inicio do periodo ($1).
--
-- Um chamado estava aberto no corte quando:
--   a) esta aberto agora E nunca foi reaberto        -> nunca fechou, entao
--      (data_resolvido NULL, data_reaberto NULL)        estava aberto no corte
--   b) esta aberto agora E foi reaberto ANTES do corte -> ja estava aberto la
--   c) so foi fechado depois do corte                -> data_resolvido >= $1
--
-- O caso (b) e a trava da regra do cliente: um chamado fechado em julho e
-- reaberto em agosto fica com data_resolvido nula, e sem essa condicao
-- voltaria para o backlog de julho.
SELECT COUNT(*)::bigint AS quantidade
FROM estatistica.chamados_bi cb
WHERE cb.cliente = $3
  AND cb.deletado IS NOT TRUE
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
-- Chamados criados dentro do periodo. Conta pela data de criacao, que
-- nunca muda: o numero do mes fica estavel para sempre.
SELECT COUNT(*)::bigint AS quantidade
FROM estatistica.chamados_bi cb
WHERE cb.cliente = $3
  AND cb.deletado IS NOT TRUE
  AND cb.data_criacao >= $1
  AND cb.data_criacao < $2;
-- ENDQUERY

-- QUERY: ATENDIMENTOS_FECHADOS_PERIODO
-- Chamados resolvidos dentro do periodo.
--
-- LIMITACAO CONHECIDA (nao da para resolver em SQL): como data_resolvido
-- guarda o estado atual, um chamado fechado em julho e reaberto depois
-- fica com a coluna nula e some da contagem de julho. A tabela nao guarda
-- historico de fechamentos, entao a informacao "houve um fechamento em
-- julho" se perde. Resolver isso exigiria uma tabela de eventos na origem.
SELECT COUNT(*)::bigint AS quantidade
FROM estatistica.chamados_bi cb
WHERE cb.cliente = $3
  AND cb.deletado IS NOT TRUE
  AND cb.data_resolvido >= $1
  AND cb.data_resolvido < $2;
-- ENDQUERY

-- QUERY: ATENDIMENTOS_BACKLOG_SAIDA
-- Chamados que ainda estavam EM ABERTO no fim do periodo ($2).
-- Mesma logica da entrada, com o corte no fim: uma reabertura posterior
-- ao corte significa que naquele momento o chamado estava fechado.
SELECT COUNT(*)::bigint AS quantidade
FROM estatistica.chamados_bi cb
WHERE cb.cliente = $3
  AND cb.deletado IS NOT TRUE
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
