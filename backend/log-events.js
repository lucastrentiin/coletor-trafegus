// Catalogo COMPLETO dos eventos que o sistema sabe registrar.
//
// Cada evento tem:
//   chave     - identificador estavel usado no codigo e no banco (logc_codigo)
//   grupo     - agrupamento exibido na tela de configuracao
//   rotulo    - nome curto mostrado ao lado do checkbox
//   descricao - texto detalhado do tooltip "i": explica exatamente o que
//               aparece no log quando o evento esta ligado
//   destino   - ARQUIVO (logs/coleta-*.log), AUDITORIA (tabela audi_log_auditoria,
//               que alimenta a "Atividade recente" do Dashboard) ou AMBOS
//   padrao    - se vem ligado quando ninguem configurou nada ainda
//
// Eventos marcados com padrao:true e sensiveis (login recusado, exclusoes)
// continuam ligados por padrao porque sao a trilha de auditoria minima.

const LOG_EVENTS = [
    // ===================== AUTENTICACAO =====================
    {
        chave: 'AUTH.LOGIN_OK',
        grupo: 'Autenticação',
        rotulo: 'Login realizado',
        destino: 'AUDITORIA',
        padrao: true,
        descricao: 'Registra cada entrada bem-sucedida no sistema. Grava o nome e o login do usuário, o endereço IP de origem e a data/hora exata. Aparece na "Atividade recente" do Dashboard como "Fulano entrou no sistema". Desligue se o volume de logins estiver poluindo o painel.'
    },
    {
        chave: 'AUTH.LOGIN_FALHA',
        grupo: 'Autenticação',
        rotulo: 'Tentativa de login recusada',
        destino: 'AUDITORIA',
        padrao: true,
        descricao: 'Registra toda tentativa de login que falhou, com o login digitado, o motivo da recusa (senha incorreta, usuário inativo ou inexistente) e o IP de origem. É o principal indício de tentativa de invasão ou de senha vencida — recomendamos manter sempre ligado.'
    },
    {
        chave: 'AUTH.LOGOUT',
        grupo: 'Autenticação',
        rotulo: 'Saída do sistema',
        destino: 'AUDITORIA',
        padrao: true,
        descricao: 'Registra quando o usuário sai pelo botão de logout, com login, IP e horário. Não registra expiração automática de sessão por inatividade, apenas a saída feita de propósito.'
    },
    {
        chave: 'AUTH.TROCA_SENHA',
        grupo: 'Autenticação',
        rotulo: 'Troca de senha própria',
        destino: 'AUDITORIA',
        padrao: true,
        descricao: 'Registra quando um usuário troca a própria senha, seja por vontade própria ou por exigência no primeiro acesso. Grava apenas quem trocou e quando — a senha em si nunca é registrada em nenhum log.'
    },

    // ===================== USUARIOS =====================
    {
        chave: 'USUARIO.CRIAR',
        grupo: 'Usuários',
        rotulo: 'Usuário criado',
        destino: 'AUDITORIA',
        padrao: true,
        descricao: 'Registra a criação de uma nova conta de acesso, com o login criado, quem criou e o IP. Não inclui a senha temporária gerada.'
    },
    {
        chave: 'USUARIO.EDITAR',
        grupo: 'Usuários',
        rotulo: 'Usuário editado',
        destino: 'AUDITORIA',
        padrao: true,
        descricao: 'Registra alterações em uma conta existente: mudança de nome, e-mail, situação ativo/inativo e troca dos perfis de permissão atribuídos. Grava quem alterou, qual conta foi alterada e quando.'
    },
    {
        chave: 'USUARIO.EXCLUIR',
        grupo: 'Usuários',
        rotulo: 'Usuário excluído',
        destino: 'AUDITORIA',
        padrao: true,
        descricao: 'Registra a exclusão definitiva de uma conta de acesso, com o código da conta removida, quem removeu e o IP. Como a exclusão não pode ser desfeita, recomendamos manter sempre ligado.'
    },
    {
        chave: 'USUARIO.RESETAR_SENHA',
        grupo: 'Usuários',
        rotulo: 'Senha resetada por administrador',
        destino: 'AUDITORIA',
        padrao: true,
        descricao: 'Registra quando um administrador gera nova senha temporária para outro usuário. Grava quem resetou e para qual conta — a senha temporária gerada não é registrada.'
    },

    // ===================== PERFIS =====================
    {
        chave: 'PERFIL.CRIAR',
        grupo: 'Perfis e permissões',
        rotulo: 'Perfil criado',
        destino: 'AUDITORIA',
        padrao: true,
        descricao: 'Registra a criação de um novo perfil de permissão (ex.: Gestor, Operador), com a sigla do perfil, quem criou e o IP.'
    },
    {
        chave: 'PERFIL.EDITAR',
        grupo: 'Perfis e permissões',
        rotulo: 'Perfil editado',
        destino: 'AUDITORIA',
        padrao: true,
        descricao: 'Registra alterações em um perfil, principalmente quais permissões foram concedidas ou retiradas. É o evento mais importante para auditar mudanças de nível de acesso — quem ganhou poder de mexer em quê.'
    },
    {
        chave: 'PERFIL.EXCLUIR',
        grupo: 'Perfis e permissões',
        rotulo: 'Perfil excluído',
        destino: 'AUDITORIA',
        padrao: true,
        descricao: 'Registra a exclusão de um perfil de permissão. O sistema só permite excluir perfis que não estejam atribuídos a nenhum usuário.'
    },

    // ===================== CLIENTES =====================
    {
        chave: 'CLIENTE.CRIAR',
        grupo: 'Clientes',
        rotulo: 'Cliente cadastrado',
        destino: 'AUDITORIA',
        padrao: true,
        descricao: 'Registra o cadastro de um novo cliente Trafegus, com o nome do cliente, host e banco configurados e quem cadastrou. Senhas de banco e chaves SSH nunca são gravadas no log.'
    },
    {
        chave: 'CLIENTE.EDITAR',
        grupo: 'Clientes',
        rotulo: 'Cliente editado',
        destino: 'AUDITORIA',
        padrao: true,
        descricao: 'Registra alterações no cadastro de um cliente: mudança de host, porta, nome do banco, grupo de credencial, configuração de túnel SSH, nome usado no banco de atendimentos e situação ativo/inativo.'
    },
    {
        chave: 'CLIENTE.EXCLUIR',
        grupo: 'Clientes',
        rotulo: 'Cliente excluído',
        destino: 'AUDITORIA',
        padrao: true,
        descricao: 'Registra a remoção de um cliente do sistema. Junto com o cliente saem também os apelidos dele no banco de atendimentos.'
    },
    {
        chave: 'CLIENTE.TESTE_CONEXAO',
        grupo: 'Clientes',
        rotulo: 'Teste de conexão executado',
        destino: 'ARQUIVO',
        padrao: false,
        descricao: 'Registra cada clique no botão "Testar conexão" do cadastro de cliente, com o resultado (sucesso ou a mensagem de erro retornada pelo PostgreSQL/SSH). Útil enquanto se está configurando um cliente novo, mas gera bastante linha — por isso vem desligado por padrão.'
    },
    {
        chave: 'CLIENTE.FALHA_CONEXAO',
        grupo: 'Clientes',
        rotulo: 'Cliente desativado por falha',
        destino: 'AMBOS',
        padrao: true,
        descricao: 'Registra quando uma coleta falha ao conectar no banco de um cliente e o sistema desativa esse cliente automaticamente. Grava o nome do cliente e a mensagem de erro original (timeout, senha recusada, banco inexistente). É como você descobre que um cliente parou de trazer dados.'
    },

    // ===================== CREDENCIAIS E CONEXOES =====================
    {
        chave: 'CREDENCIAL.CRIAR',
        grupo: 'Credenciais e conexões',
        rotulo: 'Grupo de credencial criado',
        destino: 'AUDITORIA',
        padrao: true,
        descricao: 'Registra a criação de um grupo de credenciais compartilhado entre clientes, com a sigla do grupo e quem criou. Usuário e senha do banco não são gravados.'
    },
    {
        chave: 'CREDENCIAL.EDITAR',
        grupo: 'Credenciais e conexões',
        rotulo: 'Grupo de credencial editado',
        destino: 'AUDITORIA',
        padrao: true,
        descricao: 'Registra alterações em um grupo de credenciais, incluindo troca de usuário, de senha ou de chave SSH. O log diz que houve troca, mas nunca mostra o valor novo nem o antigo.'
    },
    {
        chave: 'CREDENCIAL.EXCLUIR',
        grupo: 'Credenciais e conexões',
        rotulo: 'Grupo de credencial excluído',
        destino: 'AUDITORIA',
        padrao: true,
        descricao: 'Registra a remoção de um grupo de credenciais. Clientes que ainda usavam esse grupo passam a ficar sem credencial e param de coletar até serem reconfigurados.'
    },
    {
        chave: 'CONEXAO.EDITAR',
        grupo: 'Credenciais e conexões',
        rotulo: 'Conexão externa alterada',
        destino: 'AUDITORIA',
        padrao: true,
        descricao: 'Registra mudanças na configuração do Banco de Atendimentos ou do Banco Central do Coletor: host, porta, nome do banco, usuário, SSL e se a conexão está ativa. Alterar isso afeta a coluna de Chamados de todos os clientes de uma vez.'
    },

    // ===================== CONSULTAS E EXPORTACAO =====================
    {
        chave: 'CONSULTA.INICIO',
        grupo: 'Consultas e exportação',
        rotulo: 'Início de consulta manual',
        destino: 'ARQUIVO',
        padrao: true,
        descricao: 'Registra o disparo de uma consulta pela tela Consulta, listando quem executou, quais clientes foram selecionados e qual período (dia, semana, mês ou intervalo). Gravado no arquivo de log, não no Dashboard.'
    },
    {
        chave: 'CONSULTA.FIM',
        grupo: 'Consultas e exportação',
        rotulo: 'Fim de consulta manual',
        destino: 'ARQUIVO',
        padrao: true,
        descricao: 'Registra o encerramento da consulta com o resumo do resultado: quantos clientes retornaram dados com sucesso e quantos falharam. Junto com o evento de início, permite medir quanto tempo a consulta levou.'
    },
    {
        chave: 'CONSULTA.PERSONALIZADA',
        grupo: 'Consultas e exportação',
        rotulo: 'Consulta personalizada (SQL) executada',
        destino: 'AMBOS',
        padrao: true,
        descricao: 'Registra a execução de uma busca personalizada em SQL, com o nome da busca, a origem consultada (bancos dos clientes, atendimentos ou central) e quem executou. Como esse recurso roda SQL livre nos bancos, recomendamos manter ligado.'
    },
    {
        chave: 'CONSULTA.SALVAR_PERSONALIZADA',
        grupo: 'Consultas e exportação',
        rotulo: 'Busca personalizada salva ou removida',
        destino: 'AUDITORIA',
        padrao: true,
        descricao: 'Registra quando alguém cria, edita ou exclui uma busca personalizada salva, com o nome e a categoria da busca. Não grava o texto completo do SQL.'
    },
    {
        chave: 'EXPORTACAO.EXECUTAR',
        grupo: 'Consultas e exportação',
        rotulo: 'Exportação de Excel',
        destino: 'AMBOS',
        padrao: true,
        descricao: 'Registra cada geração de planilha, com quem exportou, os clientes incluídos, o período e o formato escolhido (Todos juntos ou Separados por cliente, Detalhada ou Normal). É como se rastreia quem tirou qual relatório e quando.'
    },

    // ===================== COLETA AUTOMATICA =====================
    {
        chave: 'COLETA.INICIO',
        grupo: 'Coleta automática',
        rotulo: 'Início da coleta agendada',
        destino: 'ARQUIVO',
        padrao: true,
        descricao: 'Registra o início da rotina automática de coleta, com a data de referência, a periodicidade (diária, semanal ou mensal) e quantos clientes entraram na execução. É a primeira linha a conferir quando a coleta da madrugada não rodou.'
    },
    {
        chave: 'COLETA.PROGRESSO',
        grupo: 'Coleta automática',
        rotulo: 'Progresso por cliente e indicador',
        destino: 'ARQUIVO',
        padrao: false,
        descricao: 'Registra cada passo da coleta: para cada cliente, qual indicador acabou de ser coletado. Gera centenas de linhas por execução — ligue apenas quando estiver investigando em qual indicador exatamente a coleta está travando ou demorando.'
    },
    {
        chave: 'COLETA.RELATORIO',
        grupo: 'Coleta automática',
        rotulo: 'Relatório gerado pela coleta',
        destino: 'ARQUIVO',
        padrao: true,
        descricao: 'Registra o caminho do arquivo Excel gerado ao final da coleta automática. Serve para localizar rapidamente o relatório da execução daquele dia.'
    },
    {
        chave: 'ATENDIMENTO.FALHA',
        grupo: 'Coleta automática',
        rotulo: 'Falha no banco de atendimentos',
        destino: 'AMBOS',
        padrao: true,
        descricao: 'Registra quando a busca de Chamados falha para um cliente, seja por queda de conexão com o banco de atendimentos, seja porque o nome/apelido do cliente não foi encontrado lá. É o evento que explica por que a coluna de Chamados veio vazia para determinado cliente.'
    },

    // ===================== LOGS =====================
    {
        chave: 'LOG.LIMPAR',
        grupo: 'Logs',
        rotulo: 'Limpeza de logs',
        destino: 'AUDITORIA',
        padrao: true,
        descricao: 'Registra quando alguém apaga os logs, indicando o que foi apagado (arquivos de log, trilha de auditoria do Dashboard ou ambos) e quantos registros foram removidos. Esta entrada é gravada depois da limpeza, então ela permanece visível como prova de que a limpeza aconteceu.'
    },
    {
        chave: 'LOG.CONFIGURAR',
        grupo: 'Logs',
        rotulo: 'Alteração desta configuração',
        destino: 'AUDITORIA',
        padrao: true,
        descricao: 'Registra mudanças nesta própria tela de configuração de logs, listando quais eventos foram ligados e quais foram desligados, e por quem. Manter ligado evita que alguém desative um log importante sem deixar rastro.'
    }
];

const BY_KEY = new Map(LOG_EVENTS.map(e => [e.chave, e]));

function listEventKeys() {
    return LOG_EVENTS.map(e => e.chave);
}

function getEvent(chave) {
    return BY_KEY.get(chave) || null;
}

function defaultEnabled(chave) {
    const event = BY_KEY.get(chave);
    return event ? event.padrao : true;
}

module.exports = { LOG_EVENTS, listEventKeys, getEvent, defaultEnabled };
