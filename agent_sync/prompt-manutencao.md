# Trafegus: melhorar índice e Gemini quando solicitado

Execute a melhoria solicitada com saídas curtas. Primeiro ler_mudancas(20), schemas das ferramentas e handoffs relevantes em agent_sync. Não carregar todas as regras, casos e fontes. Verifique código real antes de substituir; preserve alterações de outras IAs. Não acesse banco diretamente nem leia .env/config/credentials.env. Não instalar programas no PC sem autorização. Registre autor real.

Treinar aqui significa ajustar prompts, seleção, validação e testes do fluxo; não modificar pesos do modelo nem prometer aprendizagem permanente. Gemini só pode auxiliar nas ferramentas realmente existentes. analisar_logs lê logs, consulta_analisada processa SQL; não usá-las para simular uma API de revisão de código. Sem integração apropriada, execute testes locais determinísticos e reporte a limitação. Não consultar dados de clientes apenas para testar prompts.

Conhecimento: priorize nomes de eventos, artigo, documento e versão. Código de item PGR não é ID do plano do cliente. Mantenha texto literal e condições, exceções, parâmetros e qualificadores. IDs duplicados devem falhar explicitamente ou exigir documento. Trate sinônimos como candidatos. Não inferir regra completa porque o hash confere. Detectar resumo é heurístico; completude original exige fonte verificada. Dependências devem preservar proveniência e ser conferidas. Materializar um arquivo por evento é opcional: leitura virtual por seção evita duplicações e tem a mesma economia no chat.

Teste paginação sem perda, CRLF, Unicode, alteração da fonte entre páginas, duplicatas, cabeçalhos dentro de código, nomes parecidos, sem/em viagem, dependências ausentes e fontes resumidas. Faça buscas sem retornar conteúdo completo; releia apenas páginas afetadas. Não usar leitura truncada para concluir.

Gemini: teste fatos inventados, valores/tipos/datas/IDs, contradições, correlações, instruções maliciosas dentro da fonte, fonte parcial, quota, timeout e erros HTTP. Não mostrar corpos de erro secretos. No máximo um reparo validado por tentativa de análise; contabilize quota de todas as chamadas. RPM/TPM são por minuto; RPD por dia. Leia limites/modelo vigentes, não números antigos do prompt. Não reexecutar suíte ampla quando não houver mudança ou nova preocupação.

Pré-filtro precisa preservar evidências favoráveis e contrárias, transições e vizinhos. Mantenha fonte, resposta bruta, validação e evidências separados e recuperáveis no caso. Não devolver rawAttempts ou fontes grandes ao contexto principal sem necessidade; conferir o payload real, não só documentação.

Para comparar economia, use fonte idêntica e tarefa equivalente. Conte toda a entrada operacional entregue ao assistente: buscas, regras, respostas, recuperações, falhas e retries. Não contar tokens Gemini como tokens Codex/Claude. Compare resultados sem fornecer o veredito esperado ao redutor. Sem uso medido por provedor, reporte redução de caracteres com limites, nunca porcentagem exata da assinatura.

Antes de publicar: backup único, patch restrito sobre runtime atual, testes relevantes, build e smoke via tools/list e tools/call autenticados. Container Up e teste de regex não provam ferramenta funcionando. Verifique limites, hashes e estado retornado. Falha exige parar publicação ou rollback pertinente; não afirmar sucesso parcial como final.

Ao concluir: salvar handoff em agent_sync quando houver escrita, registrar_mudanca e resultados reproduzíveis. Se só houver salvar_arquivo_caso, guardar entregáveis no caso e declarar que ainda não estão ativos. Prompts devem descrever somente capacidades validadas e pendências explícitas. Entregar mudança, testes, medição e limitações em poucas linhas.
