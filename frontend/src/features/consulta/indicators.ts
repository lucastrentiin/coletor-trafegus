import type { IndicatorRow } from '@/types/api';

/*
  Catálogo de exibição dos indicadores. A regra de negócio continua em
  sql/queries.sql; aqui ficam só nomes e explicações para a tela.
*/

export const CATEGORY_TABS = ['TODOS', 'VIAGENS / SM', 'TERMINAIS', 'EVENTOS', 'USUÁRIOS', 'ACESSOS', 'CHAMADOS'] as const;
export type CategoryTab = (typeof CATEGORY_TABS)[number];

export const CATEGORY_LABEL: Record<CategoryTab, string> = {
  TODOS: 'Todos',
  'VIAGENS / SM': 'Viagens e SM',
  TERMINAIS: 'Terminais',
  EVENTOS: 'Eventos',
  'USUÁRIOS': 'Usuários',
  ACESSOS: 'Acessos',
  CHAMADOS: 'Chamados',
};

/** Agrupa a categoria técnica do SQL na aba da tela. ESIS (eventos por PGR) fica em Eventos. */
export function tabFor(row: Pick<IndicatorRow, 'categoria'>): Exclude<CategoryTab, 'TODOS'> {
  switch (row.categoria) {
    case 'VIAGENS':
    case 'SM':
      return 'VIAGENS / SM';
    case 'TERMINAIS':
      return 'TERMINAIS';
    case 'EVENTOS':
    case 'ESIS':
      return 'EVENTOS';
    case 'USUARIOS':
      return 'USUÁRIOS';
    case 'ACESSOS':
      return 'ACESSOS';
    case 'CHAMADOS':
      return 'CHAMADOS';
    default:
      return 'EVENTOS';
  }
}

/** Rótulo da coluna de detalhe conforme o tipo de indicador. */
export function detailLabel(tab: CategoryTab): string {
  if (tab === 'ACESSOS') return 'Usuário';
  if (tab === 'EVENTOS') return 'Evento';
  return 'Detalhe';
}

const INFO: Record<string, string> = {
  'VIAGENS:TOTAL': 'Total de viagens cadastradas no banco, sem filtro de data.',
  'VIAGENS:TOTAL_NAO_CANCELADAS': 'Total de viagens cadastradas sem registro de cancelamento (vest_estatus = 2).',
  'VIAGENS:TOTAL_PERIODO':
    'Viagens com viag_data_cadastro dentro do período. Pode estar iniciada, finalizada, em andamento ou cancelada: o critério é só o cadastro.',
  'VIAGENS:SEM_CANCELADAS_PERIODO': 'Viagens cadastradas no período, excluindo as que têm cancelamento (vest_estatus = 2).',
  'VIAGENS:CADASTRADAS': 'Mesmo conceito de viagens cadastradas no período, mantido como indicador operacional adicional.',
  'VIAGENS:NAO_CANCELADAS': 'Viagens cadastradas no período menos as que têm cancelamento (vest_estatus = 2).',
  'SM:CRIADAS': 'Viagens/SM cadastradas no período. Mesma base de viagens cadastradas, mantida como métrica operacional.',
  'SM:INICIADAS': 'Viagens/SM com viag_data_inicio no período. Não precisam ter sido finalizadas.',
  'SM:CANCELADAS': 'Cada viagem conta uma vez quando recebeu vest_estatus = 2 dentro do período.',
  'SM:EM_VIAGEM_NO_FIM_DO_DIA': 'Viagens em andamento no instante final do período: já tinham começado e ainda não tinham terminado.',
  'SM:FINALIZADAS_NO_DIA': 'Viagens com viag_data_fim dentro do período.',
  'TERMINAIS:ATIVOS_SISTEMA': 'Terminais com term_ativo = S. Não usa a data do filtro.',
  'TERMINAIS:ATIVOS_GR_WS_SISTEMA': 'Terminais com term_ativo = S ou term_ativo_ws = S. Indicador adicional de estado atual.',
  'TERMINAIS:ATIVOS_PERIODO': 'Terminais distintos ativos em algum momento do intervalo, pelo histórico HETE GR/WS.',
  'TERMINAIS:TOTAL_SISTEMA': 'Total de registros em term_terminal. Não usa a data do filtro.',
  'TERMINAIS:CADASTRADOS': 'Terminais com term_data_cadastro dentro do intervalo.',
  'TERMINAIS:CADASTRADOS_ATIVOS': 'Terminais cadastrados no intervalo que hoje estão ativos (term_ativo ou term_ativo_ws = S).',
  'TERMINAIS:ATIVADOS_NO_PERIODO': 'Terminais distintos ativados no histórico HETE dentro do intervalo, considerando GR/WS.',
  'TERMINAIS:INATIVADOS_NO_PERIODO': 'Terminais distintos com inativação registrada no histórico HETE dentro do intervalo.',
  'TERMINAIS:FATURAMENTO': 'Terminais retornados pelo SQL de faturamento da competência mensal referente ao período.',
  'USUARIOS:TOTAL': 'Total atual de usuários cadastrados em usua_usuario.',
  'USUARIOS:CADASTRADOS_PERIODO': 'Usuários com usua_data_cadastro dentro do intervalo.',
  'USUARIOS:CONECTADOS_SISTEMA': 'Usuários distintos com algum acesso do tipo 1 na tabela de acessos.',
  'USUARIOS:CONECTADOS_PERIODO': 'Usuários distintos com pelo menos um acesso do tipo 1 no intervalo.',
  'USUARIOS:QUANTIDADE_ACESSOS_SISTEMA': 'Total de registros de acesso do tipo 1 existentes na tabela.',
  'USUARIOS:QUANTIDADE_ACESSOS': 'Registros de acesso do tipo 1 dentro do intervalo.',
  'ACESSOS:POR_USUARIO': 'Acessos do tipo 1 agrupados por login, só no intervalo selecionado.',
  'ACESSOS:POR_USUARIO_SISTEMA': 'Todos os acessos do tipo 1 existentes, agrupados por login.',
  'EVENTOS:TOTAL_SISTEMA': 'Total de registros da esis_evento_sistema_completa, sem filtro de data.',
  'EVENTOS:AUTO_SISTEMA': 'Eventos da esis_evento_sistema_completa com esis_usu_codigo_leitura <= 2 (tratamento automático).',
  'EVENTOS:MANUAL_SISTEMA': 'Eventos da esis_evento_sistema_completa com esis_usu_codigo_leitura > 2 (tratamento manual).',
  'EVENTOS:TOTAL_PERIODO': 'Total de eventos da esis_evento_sistema_completa dentro do intervalo.',
  'EVENTOS:AUTO_PERIODO': 'Eventos do intervalo com esis_usu_codigo_leitura <= 2 (tratamento automático).',
  'EVENTOS:MANUAL_PERIODO': 'Eventos do intervalo com esis_usu_codigo_leitura > 2 (tratamento manual).',
  'ESIS:GERADOS': 'Eventos do período agrupados por descrição PGR. O total geral de eventos é outra métrica e usa a tabela completa.',
  'CHAMADOS:BACKLOG_ENTRADA': 'Chamados em aberto no início do período (estatistica.chamados_bi).',
  'CHAMADOS:ABERTOS_PERIODO': 'Chamados abertos dentro do período.',
  'CHAMADOS:FECHADOS_PERIODO': 'Chamados fechados dentro do período.',
  'CHAMADOS:BACKLOG_SAIDA': 'Chamados ainda em aberto no fim do período.',
};

export function indicatorInfo(row: IndicatorRow): string {
  return row.info || INFO[`${row.categoria}:${row.indicador}`] || 'Regra definida pela consulta SQL configurada em sql/queries.sql.';
}

const ACRONYMS = new Set(['SM', 'GR', 'WS', 'PGR', 'ESIS', 'SQL']);

/**
 * TOTAL_NAO_CANCELADAS → "Total não canceladas". O sufixo _PERIODO/_SISTEMA sai
 * porque a etiqueta de escopo já diz isso. O código original segue no tooltip.
 */
export function humanizeIndicator(code: string): string {
  const base = code.replace(/(_NO)?_(PERIODO|SISTEMA)$/i, '') || code;
  const words = base
    .toLowerCase()
    .split('_')
    .filter(Boolean)
    .map((word) => {
      const upper = word.toUpperCase();
      if (ACRONYMS.has(upper)) return upper;
      return word.replace(/^nao$/, 'não').replace(/^periodo$/, 'período').replace(/^usuarios?$/, (w) => (w.endsWith('s') ? 'usuários' : 'usuário'));
    });
  const text = words.join(' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export const ATTENDANCE_INDICATORS = [
  { code: 'BACKLOG_ENTRADA', label: 'Backlog de entrada' },
  { code: 'ABERTOS_PERIODO', label: 'Abertos no período' },
  { code: 'FECHADOS_PERIODO', label: 'Fechados no período' },
  { code: 'BACKLOG_SAIDA', label: 'Backlog de saída' },
] as const;

export function rowKey(row: IndicatorRow): string {
  return `${row.categoria}\u0000${row.indicador}\u0000${row.evento ?? ''}\u0000${row.escopo ?? 'PERIODO'}`;
}
