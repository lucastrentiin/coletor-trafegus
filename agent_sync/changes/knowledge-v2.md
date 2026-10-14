# Knowledge V2

Autor: Codex. Escopo: economia de contexto, índice literal e prompts reutilizáveis.

Módulo V2: leitura por páginas de até 8000 caracteres; hash obrigatório na continuação; falha em duplicata; busca com aliases candidatos e qualificadores preservados; ignora cabeçalhos em blocos de código; preserva CRLF; verifica conteúdo por hash ao atualizar índice; alertas de fonte potencialmente resumida e referências/dependências a verificar. O índice não certifica completude do original. Não houve treino de pesos Gemini nem chamada real Gemini/SQL.

Cinco testes específicos locais aprovados. Publicação e smoke devem ser confirmados separadamente em registrar_mudanca; não considerar este arquivo prova de deploy.

Integração preserva nomes das ferramentas e acrescenta documento, offset, max_caracteres e sha256_esperado à leitura. Limite de candidatos: 3 padrão, máximo 5. Arquivos virtuais por seção evitam duplicar a fonte em centenas de TXT. Fontes resumidas precisam ser recuperadas do original antes de conclusões que dependam de condições ausentes.

Limitações: referências extraídas são heurísticas, não árvore completa; índice cobre seções de nível 2 na base Markdown existente; busca por sinônimo não decide variante; busca textual de fallback continua disponível; fluxo SQL/Gemini anterior não foi reescrito nesta mudança. Métrica de redução de conteúdo não equivale a redução da cota da conta.
