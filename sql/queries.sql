-- ================================================================
-- COLETOR TRAFEGUS - FONTE UNICA DE SQLs
-- ================================================================
-- REGRA: este e o UNICO arquivo onde voce deve alterar consultas.
-- O backend nao deve conter SQL de negocio espalhado em outros arquivos.
--
-- $1 = inicio do periodo
-- $2 = fim do periodo (exclusivo)
--
-- DIARIO: 2026-08-19 00:00:00 ate 2026-08-20 00:00:00
-- MENSAL: 2026-07-01 00:00:00 ate 2026-08-01 00:00:00
-- ================================================================

-- ===================== DIARIO =====================

-- VIAGENS
-- Baseado no SQL antigo, mantendo NOT EXISTS correlacionado.
-- Se a metrica final for "SM", pode ser usada tambem para CRIADAS.
-- QUERY: VIAGENS_CADASTRADAS
SELECT COUNT(*)::bigint AS quantidade
FROM viag_viagem
WHERE viag_data_cadastro >= $1
  AND viag_data_cadastro < $2;

-- ENDQUERY
-- QUERY: VIAGENS_NAO_CANCELADAS
SELECT COUNT(*)::bigint AS quantidade
FROM viag_viagem vv
WHERE viag_data_cadastro >= $1
  AND viag_data_cadastro < $2
  AND NOT EXISTS (
      SELECT 1
      FROM vest_viagem_estatus vve
      WHERE vve.vest_viag_codigo = vv.viag_codigo
        AND vve.vest_estatus = '2'
  );

-- ENDQUERY
-- QUERY: SM_CRIADAS
SELECT COUNT(*)::bigint AS quantidade
FROM viag_viagem
WHERE viag_data_cadastro >= $1
  AND viag_data_cadastro < $2;

-- ENDQUERY
-- QUERY: SM_INICIADAS
-- Regra definida por voce: inicio da SM/viagem, nao apenas status 1 da vest.
SELECT COUNT(*)::bigint AS quantidade
FROM viag_viagem
WHERE viag_data_inicio >= $1
  AND viag_data_inicio < $2;

-- ENDQUERY
-- QUERY: SM_CANCELADAS
-- Conta a SM uma vez no periodo em que recebeu status 2.
SELECT COUNT(DISTINCT vest_viag_codigo)::bigint AS quantidade
FROM vest_viagem_estatus
WHERE vest_data_cadastro >= $1
  AND vest_data_cadastro < $2
  AND vest_estatus = '2';

-- ENDQUERY
-- QUERY: SM_EM_VIAGEM_NO_FIM_DO_DIA
-- Uma viagem esta em andamento no fechamento do dia se iniciou antes
-- do fim do dia e nao havia terminado ate esse instante.
SELECT COUNT(*)::bigint AS quantidade
FROM viag_viagem
WHERE viag_data_inicio IS NOT NULL
  AND viag_data_inicio < $1
  AND (viag_data_fim IS NULL OR viag_data_fim >= $1);

-- ENDQUERY
-- QUERY: SM_FINALIZADAS_NO_DIA
SELECT COUNT(*)::bigint AS quantidade
FROM viag_viagem
WHERE viag_data_inicio IS NOT NULL
  AND viag_data_fim IS NOT NULL
  AND viag_data_fim >= $1
  AND viag_data_fim < $2;

-- ENDQUERY
-- QUERY: TERMINAIS_ATIVADOS_NO_DIA
-- HETE: o sistema antigo diferencia GR e WS. DISTINCT evita duplicar
-- o mesmo terminal caso ambos tenham um evento no mesmo dia.
SELECT COUNT(DISTINCT h.hete_term_codigo)::bigint AS quantidade
FROM hete_historico_estatus_termin h
WHERE h.hete_data_inicio >= $1
  AND h.hete_data_inicio < $2
  AND h.hete_tipo_estatus IN ('GR','WS')
  AND h.hete_ativo_inativo = 'S';

-- ENDQUERY
-- QUERY: TERMINAIS_INATIVADOS_NO_DIA
SELECT COUNT(DISTINCT h.hete_term_codigo)::bigint AS quantidade
FROM hete_historico_estatus_termin h
WHERE h.hete_data_fim >= $1
  AND h.hete_data_fim < $2
  AND h.hete_tipo_estatus IN ('GR','WS')
  AND h.hete_ativo_inativo = 'S';

-- ENDQUERY
-- QUERY: ESIS_PGR_AGRUPADO
-- Corrigido para contar o evento ESIS uma unica vez no JOIN.
-- Usa esis_evento_sistema_completa (regra: todo indicador de ESIS/eventos
-- sempre usa a tabela completa, nunca a curta de ~7 dias).
SELECT
    ppi.pite_descricao AS evento,
    COUNT(DISTINCT ees.esis_codigo)::bigint AS quantidade
FROM esis_evento_sistema_completa ees
JOIN pite_pg_item ppi
  ON ppi.pite_espa_codigo = ees.esis_espa_codigo
WHERE ees.esis_data_cadastro >= $1
  AND ees.esis_data_cadastro < $2
GROUP BY ppi.pite_descricao
ORDER BY quantidade DESC;

-- ===================== MENSAL / RELATORIO GERENTES =====================

-- ENDQUERY
-- QUERY: MENSAL_TERMINAIS_FATURAMENTO
-- $1 deve ser o primeiro dia do mes de competencia.
SELECT COUNT(*)::bigint AS quantidade
FROM (
    SELECT terminal,
           tecnologia,
           placa,
           COALESCE(proprietario, transportador, trans_viag.pess_nome, pjur_tran.pjur_razao_social) proprietario,
           COALESCE(transportador, trans_viag.pess_nome, pjur_tran.pjur_razao_social, proprietario) transportador,
           viag,
           status_completo,
           ativou_data_completo,
           ativou_usuario_completo,
           inativou_data_completo,
           inativou_usuario_completo,
           ativou_data_posicao,
           ativou_usuario_posicao,
           inativou_data_posicao,
           inativou_usuario_posicao,
           status_posicao,
           upos_data_comp_bordo,
           upos_descricao_sistema,
           cliente,
           data_coleta,
           competencia,
           vinculo_veic_codigo,
           vinculo_veic_descricao
    FROM (
        WITH hete_gr AS (
            SELECT DISTINCT ON (hete_term_codigo) *
            FROM hete_historico_estatus_termin
            WHERE hete_tipo_estatus = 'GR'
              AND hete_ativo_inativo = 'S'
            ORDER BY hete_term_codigo, hete_data_cadastro DESC
        ),
        hete_ws AS (
            SELECT DISTINCT ON (hete_term_codigo) *
            FROM hete_historico_estatus_termin
            WHERE hete_tipo_estatus = 'WS'
              AND hete_ativo_inativo = 'S'
            ORDER BY hete_term_codigo, hete_data_cadastro DESC
        )
        SELECT DISTINCT ON (terminais.terminal)
            terminais.terminal,
            terminais.tecnologia,
            COALESCE(viag.veic_placa, veic.veic_placa) AS placa,
            COALESCE(prop.pess_nome, pjur_prop.pjur_razao_social) AS proprietario,
            tran.pess_nome AS transportador,
            ativo_completo.hete_data_inicio AS ativou_data_completo,
            ativo_completo.hete_usuario_adicionou AS ativou_usuario_completo,
            ativo_completo.hete_data_fim AS inativou_data_completo,
            ativo_completo.hete_usuario_alterou AS inativou_usuario_completo,
            CASE WHEN ativo_completo.hete_tipo_estatus = 'GR' THEN 'ATIVO COMPLETO'
                 ELSE ativo_completo.hete_tipo_estatus END AS status_completo,
            ativo_posicao.hete_data_inicio AS ativou_data_posicao,
            ativo_posicao.hete_usuario_adicionou AS ativou_usuario_posicao,
            ativo_posicao.hete_data_fim AS inativou_data_posicao,
            ativo_posicao.hete_usuario_alterou AS inativou_usuario_posicao,
            CASE WHEN ativo_posicao.hete_tipo_estatus = 'WS' THEN 'ATIVO POSICAO'
                 ELSE ativo_posicao.hete_tipo_estatus END AS status_posicao,
            COALESCE(
                viag.id,
                (
                    SELECT tpfa_viag_codigo
                    FROM tpfa_terminal_posicao_faturamento
                    WHERE tpfa_viag_codigo IS NOT NULL
                      AND tpfa_term_codigo = terminais.term_codigo
                      AND tpfa_data_posicao >= DATE_TRUNC('month', $1::date - INTERVAL '1 month')
                      AND tpfa_data_posicao < DATE_TRUNC('month', $1::date)
                    ORDER BY 1 DESC LIMIT 1
                ),
                (
                    SELECT vter_viag_codigo
                    FROM vter_viagem_terminal
                    JOIN viag_viagem ON vter_viag_codigo = viag_codigo
                    JOIN (
                        SELECT vest_viag_codigo, vest_estatus
                        FROM vest_viagem_estatus
                        WHERE vest_codigo = ANY (
                            SELECT MAX(vest_codigo)
                            FROM vest_viagem_estatus
                            GROUP BY vest_viag_codigo
                        )
                    ) vest ON vest.vest_viag_codigo = viag_codigo
                    WHERE vter_term_codigo = terminais.term_codigo
                    ORDER BY vest_estatus != '5', vest_estatus != '1', vest_estatus != '0', viag_codigo DESC
                    LIMIT 1
                )
            ) AS viag,
            tpfa_data_posicao AS upos_data_comp_bordo,
            (
                SELECT tpfa_descricao_sistema
                FROM tpfa_terminal_posicao_faturamento
                WHERE tpfa_term_codigo = terminais.term_codigo
                  AND tpfa_data_posicao >= DATE_TRUNC('month', $1::date - INTERVAL '1 month')
                  AND tpfa_data_posicao < DATE_TRUNC('month', $1::date)
                ORDER BY tpfa_data_posicao DESC LIMIT 1
            ) AS upos_descricao_sistema,
            (SELECT csis_nome_empresa FROM csis_configuracao_sistema LIMIT 1) AS cliente,
            CURRENT_TIMESTAMP AS data_coleta,
            DATE_TRUNC('month', $1::date - INTERVAL '1 month') AS competencia,
            tvei_codigo AS vinculo_veic_codigo,
            tvei_descricao AS vinculo_veic_descricao
        FROM (
            SELECT term_numero_terminal AS terminal,
                   tecn_descricao AS tecnologia,
                   term_codigo,
                   term_oras_codigo,
                   term_vtec_codigo,
                   MAX(tpfa_data_posicao) tpfa_data_posicao
            FROM tpfa_terminal_posicao_faturamento
            JOIN term_terminal ON term_codigo = tpfa_term_codigo
            JOIN vtec_versao_tecnologia ON vtec_codigo = term_vtec_codigo
            JOIN tecn_tecnologia ON tecn_codigo = vtec_tecn_codigo
            WHERE tpfa_data_posicao >= DATE_TRUNC('month', $1::date - INTERVAL '1 month')
              AND tpfa_data_posicao < DATE_TRUNC('month', $1::date)
            GROUP BY terminal, tecnologia, term_codigo, term_oras_codigo, term_vtec_codigo
        ) AS terminais
        LEFT JOIN (
            SELECT MAX(vter_viag_codigo) id,
                   veic_placa,
                   veic_tvei_codigo AS sub_tvei_codigo,
                   vter_term_codigo,
                   veic_oras_codigo
            FROM vter_viagem_terminal
            JOIN viag_viagem ON viag_codigo = vter_viag_codigo
            JOIN vvei_viagem_veiculo ON vvei_viag_codigo = viag_codigo AND vvei_precedencia = '1'
            JOIN veic_veiculo ON vvei_veic_oras_codigo = veic_oras_codigo
            WHERE viag_data_inicio >= DATE_TRUNC('month', $1::date - INTERVAL '1 month')
              AND viag_data_fim < DATE_TRUNC('month', $1::date)
            GROUP BY veic_placa, vter_term_codigo, veic_tvei_codigo, veic_oras_codigo
        ) viag ON viag.vter_term_codigo = terminais.term_codigo
        LEFT JOIN veic_veiculo veic ON veic.veic_oras_codigo = COALESCE(terminais.term_oras_codigo, viag.veic_oras_codigo)
        LEFT JOIN pess_pessoa tran ON tran.pess_oras_codigo = veic.veic_tran_pess_oras_codigo
        LEFT JOIN pess_pessoa prop ON prop.pess_oras_codigo = veic.veic_pess_oras_codigo_propri
        LEFT JOIN pjur_pessoa_juridica pjur_prop ON pjur_prop.pjur_pess_oras_codigo = prop.pess_oras_codigo
        LEFT JOIN tvei_tipo_veiculo ON COALESCE(sub_tvei_codigo, veic.veic_tvei_codigo) = tvei_codigo
        LEFT JOIN hete_gr ativo_completo ON ativo_completo.hete_term_codigo = terminais.term_codigo
        LEFT JOIN hete_ws ativo_posicao ON ativo_posicao.hete_term_codigo = terminais.term_codigo
        ORDER BY terminais.terminal, term_oras_codigo NULLS LAST
        LIMIT 1000000000
    ) AS tabela
    LEFT JOIN viag_viagem viagem ON viagem.viag_codigo = tabela.viag
    LEFT JOIN pess_pessoa trans_viag ON trans_viag.pess_oras_codigo = viagem.viag_tran_pess_oras_codigo
    LEFT JOIN pjur_pessoa_juridica pjur_tran ON pjur_tran.pjur_pess_oras_codigo = trans_viag.pess_oras_codigo
    WHERE tabela.placa IS NOT NULL
    ORDER BY viag, placa, terminal
) dados;

-- ENDQUERY
-- QUERY: MENSAL_USUARIOS_TOTAL
SELECT COUNT(*)::bigint AS quantidade FROM usua_usuario;

-- ENDQUERY
-- QUERY: MENSAL_USUARIOS_CADASTRADOS
SELECT COUNT(*)::bigint AS quantidade
FROM usua_usuario
WHERE usua_data_cadastro >= $1
  AND usua_data_cadastro < $2;

-- ENDQUERY
-- QUERY: MENSAL_USUARIOS_CONECTADOS
SELECT COUNT(DISTINCT rras.rasi_usua_pfis_pess_oras_codigo)::bigint AS quantidade
FROM rasi_registro_acesso_sistema rras
WHERE rasi_tipo_acesso = '1'
  AND rasi_data_cadastro >= $1
  AND rasi_data_cadastro < $2;

-- ENDQUERY
-- QUERY: MENSAL_QUANTIDADE_ACESSOS
SELECT COUNT(*)::bigint AS quantidade
FROM rasi_registro_acesso_sistema rras
WHERE rasi_tipo_acesso = '1'
  AND rasi_data_cadastro >= $1
  AND rasi_data_cadastro < $2;

-- ENDQUERY
-- QUERY: MENSAL_ACESSO_POR_USUARIO
SELECT usua_login AS usuario,
       COUNT(*)::bigint AS acessos
FROM rasi_registro_acesso_sistema rras
LEFT JOIN usua_usuario
  ON usua_pfis_pess_oras_codigo = rras.rasi_usua_pfis_pess_oras_codigo
WHERE rasi_tipo_acesso = '1'
  AND rasi_data_cadastro >= $1
  AND rasi_data_cadastro < $2
GROUP BY usua_login
ORDER BY acessos DESC;

-- ================================================================
-- ATENDIMENTOS - OUTRO BANCO CENTRAL
-- ================================================================
-- NAO executar enquanto voce nao preencher a regra real.
-- A estrutura alvo e criada em sql/central.sql.
--
-- STATUS JA DEFINIDOS:
-- Retornado Pelo Cliente
-- Novo
-- Aprovação da Analise de Requisitos
-- Em atendimento
-- Resolvido / Concluído
-- Equipe de desenvolvimento
-- Aguardando Atualização
-- Em Implantação
-- Cancelado / Rejeitado
-- Aprovação de orçamento
-- Time RUN - Integração Azure Devops
-- Mesclado
-- Em Correção (TI)
-- Em Testes
-- Retorno do cliente
-- Fechado / Concluído
-- Em Desenvolvimento (TI)
--
-- Amanhã, os SQLs de atendimento entram AQUI, na mesma área do arquivo.
-- ENDQUERY

-- ================================================================
-- STATUS DE ATENDIMENTO JA IDENTIFICADOS
-- ================================================================
-- Retornado Pelo Cliente
-- Novo
-- Aprovação da Analise de Requisitos
-- Em atendimento
-- Resolvido / Concluído
-- Equipe de desenvolvimento
-- Aguardando Atualização
-- Em Implantação
-- Cancelado / Rejeitado
-- Aprovação de orçamento
-- Time RUN - Integração Azure Devops
-- Mesclado
-- Em Correção (TI)
-- Em Testes
-- Retorno do cliente
-- Fechado / Concluído
-- Em Desenvolvimento (TI)

-- ================================================================
-- INDICADORES COMPLEMENTARES V6.0.6
-- Escopo SISTEMA = todo o banco, sem filtro de data.
-- Escopo PERIODO = usa $1 inicio e $2 fim exclusivo.
-- ================================================================

-- ===================== VIAGENS / SM =====================

-- QUERY: VIAGENS_TOTAL_SISTEMA
SELECT COUNT(DISTINCT viag_codigo)::bigint AS quantidade
FROM viag_viagem;
-- ENDQUERY

-- QUERY: VIAGENS_SEM_CANCELADAS_SISTEMA
SELECT COUNT(DISTINCT vv.viag_codigo)::bigint AS quantidade
FROM viag_viagem vv
WHERE NOT EXISTS (
    SELECT 1
    FROM vest_viagem_estatus vve
    WHERE vve.vest_viag_codigo = vv.viag_codigo
      AND vve.vest_estatus = '2'
);
-- ENDQUERY

-- QUERY: VIAGENS_TOTAL_PERIODO
SELECT COUNT(DISTINCT viag_codigo)::bigint AS quantidade
FROM viag_viagem
WHERE viag_data_cadastro >= $1
  AND viag_data_cadastro < $2;
-- ENDQUERY

-- QUERY: VIAGENS_SEM_CANCELADAS_PERIODO
SELECT COUNT(DISTINCT vv.viag_codigo)::bigint AS quantidade
FROM viag_viagem vv
WHERE vv.viag_data_cadastro >= $1
  AND vv.viag_data_cadastro < $2
  AND NOT EXISTS (
      SELECT 1
      FROM vest_viagem_estatus vve
      WHERE vve.vest_viag_codigo = vv.viag_codigo
        AND vve.vest_estatus = '2'
  );
-- ENDQUERY

-- ===================== TERMINAIS =====================

-- QUERY: TERMINAIS_ATIVOS_SISTEMA
-- Regra da planilha: ativo pelo campo term_ativo = 'S'.
SELECT COUNT(*)::bigint AS quantidade
FROM term_terminal
WHERE term_ativo = 'S';
-- ENDQUERY

-- QUERY: TERMINAIS_ATIVOS_GR_WS_SISTEMA
-- Indicador adicional: ativo em GR ou WS.
SELECT COUNT(*)::bigint AS quantidade
FROM term_terminal
WHERE term_ativo = 'S'
   OR term_ativo_ws = 'S';
-- ENDQUERY

-- QUERY: TERMINAIS_ATIVOS_PERIODO
-- Terminal que esteve ativo em qualquer momento do intervalo, por HETE.
-- DISTINCT evita duplicar GR/WS para o mesmo terminal.
SELECT COUNT(DISTINCT h.hete_term_codigo)::bigint AS quantidade
FROM hete_historico_estatus_termin h
WHERE h.hete_tipo_estatus IN ('GR','WS')
  AND h.hete_ativo_inativo = 'S'
  AND h.hete_data_inicio < $2
  AND (h.hete_data_fim IS NULL OR h.hete_data_fim >= $1);
-- ENDQUERY

-- QUERY: TERMINAIS_CADASTRADOS_SISTEMA
SELECT COUNT(*)::bigint AS quantidade
FROM term_terminal;
-- ENDQUERY

-- QUERY: TERMINAIS_CADASTRADOS_PERIODO
SELECT COUNT(*)::bigint AS quantidade
FROM term_terminal
WHERE term_data_cadastro >= $1
  AND term_data_cadastro < $2;
-- ENDQUERY

-- QUERY: TERMINAIS_CADASTRADOS_ATIVOS_PERIODO
SELECT COUNT(*)::bigint AS quantidade
FROM term_terminal
WHERE term_data_cadastro >= $1
  AND term_data_cadastro < $2
  AND (term_ativo = 'S' OR term_ativo_ws = 'S');
-- ENDQUERY

-- ===================== USUARIOS / ACESSOS =====================

-- QUERY: MENSAL_USUARIOS_CONECTADOS_SISTEMA
SELECT COUNT(DISTINCT rasi_usua_pfis_pess_oras_codigo)::bigint AS quantidade
FROM rasi_registro_acesso_sistema
WHERE rasi_tipo_acesso = '1';
-- ENDQUERY

-- QUERY: MENSAL_QUANTIDADE_ACESSOS_SISTEMA
SELECT COUNT(*)::bigint AS quantidade
FROM rasi_registro_acesso_sistema
WHERE rasi_tipo_acesso = '1';
-- ENDQUERY

-- QUERY: ACESSO_POR_USUARIO_SISTEMA
SELECT usua_login AS usuario,
       COUNT(*)::bigint AS acessos
FROM rasi_registro_acesso_sistema rras
LEFT JOIN usua_usuario
  ON usua_pfis_pess_oras_codigo = rras.rasi_usua_pfis_pess_oras_codigo
WHERE rasi_tipo_acesso = '1'
GROUP BY usua_login
ORDER BY acessos DESC;
-- ENDQUERY

-- ===================== EVENTOS =====================
-- Sempre usa a tabela completa para permitir períodos históricos de até 60 dias.

-- QUERY: EVENTOS_TOTAL_SISTEMA
SELECT COUNT(*)::bigint AS quantidade
FROM esis_evento_sistema_completa;
-- ENDQUERY

-- QUERY: EVENTOS_AUTO_SISTEMA
SELECT COUNT(*)::bigint AS quantidade
FROM esis_evento_sistema_completa
WHERE esis_usu_codigo_leitura <= 2;
-- ENDQUERY

-- QUERY: EVENTOS_MANUAL_SISTEMA
SELECT COUNT(*)::bigint AS quantidade
FROM esis_evento_sistema_completa
WHERE esis_usu_codigo_leitura > 2;
-- ENDQUERY

-- QUERY: EVENTOS_TOTAL_PERIODO
SELECT COUNT(*)::bigint AS quantidade
FROM esis_evento_sistema_completa
WHERE esis_data_cadastro >= $1
  AND esis_data_cadastro < $2;
-- ENDQUERY

-- QUERY: EVENTOS_AUTO_PERIODO
SELECT COUNT(*)::bigint AS quantidade
FROM esis_evento_sistema_completa
WHERE esis_data_cadastro >= $1
  AND esis_data_cadastro < $2
  AND esis_usu_codigo_leitura <= 2;
-- ENDQUERY

-- QUERY: EVENTOS_MANUAL_PERIODO
SELECT COUNT(*)::bigint AS quantidade
FROM esis_evento_sistema_completa
WHERE esis_data_cadastro >= $1
  AND esis_data_cadastro < $2
  AND esis_usu_codigo_leitura > 2;
-- ENDQUERY
