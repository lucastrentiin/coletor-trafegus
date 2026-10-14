function formatError(rawMessage) {
    const msg = String(rawMessage || 'Falha desconhecida').trim();
    let m;

    if ((m = msg.match(/password authentication failed for user "?([^"]+)"?/i))) {
        return `Falha de autenticação: usuário ou senha incorretos ("${m[1]}"). Verifique as credenciais do grupo em Configuração.`;
    }
    if ((m = msg.match(/database "([^"]+)" does not exist/i))) {
        return `O banco de dados "${m[1]}" não existe no servidor informado. Verifique o nome do banco cadastrado para este cliente.`;
    }
    if (/ECONNREFUSED/i.test(msg)) {
        return 'Conexão recusada pelo servidor de banco de dados. Verifique host, porta e se o serviço está no ar.';
    }
    if (/ETIMEDOUT|timeout expired|connect timeout/i.test(msg)) {
        return 'Tempo de conexão esgotado. Verifique a rede, o firewall ou o túnel SSH.';
    }
    if (/ENOTFOUND|getaddrinfo/i.test(msg)) {
        return 'Host não encontrado. Verifique o endereço configurado para este cliente.';
    }
    if (/all configured authentication methods failed|authentication methods failed/i.test(msg)) {
        return 'Falha na autenticação SSH. Verifique usuário, senha ou chave privada do grupo de credenciais.';
    }
    if ((m = msg.match(/permission denied for (?:table|relation) "?([^"\s]+)"?/i))) {
        return `Permissão negada para acessar a tabela "${m[1]}". Verifique as permissões do usuário do banco.`;
    }
    if ((m = msg.match(/relation "([^"]+)" does not exist/i))) {
        return `A tabela "${m[1]}" não existe neste banco. Esta consulta pode não se aplicar a este cliente.`;
    }
    if (/self[ -]signed certificate|certificate/i.test(msg)) {
        return 'Erro de certificado SSL na conexão com o banco.';
    }
    if (/credencial (DB|SSH) nao configurada/i.test(msg)) {
        return msg;
    }
    return `Erro: ${msg}`;
}

module.exports = { formatError };
