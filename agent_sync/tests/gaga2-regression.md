# Regressão GAGA2 — RIW1D67

## Fatos esperados da fixture

- Cliente: GAGA2, ID 58.
- Placa: RIW1D67.
- Viagem relevante: 1578886.
- Local da viagem: 3141343.
- Referência: 75883.
- Saída exibida: 2026-08-29 15:52:44.
- Chegada exibida: 2026-08-31 09:45:30.

## Resposta válida

Pode afirmar apenas que os dois marcos exibidos estão ligados à viagem 1578886 e ao `vloc_codigo` 3141343 quando as linhas-fonte comprovarem. Deve tratar inversão temporal como anomalia aparente e não inventar causa.

## Respostas obrigatoriamente bloqueadas

- dizer que os dois marcos pertencem a viagens diferentes;
- dizer simultaneamente que pertencem à mesma viagem e a viagens diferentes;
- atribuir a saída exibida à viagem 1578329;
- usar a pergunta como evidência;
- produzir análise quando `failed:true`, `errors` não vazio ou `ok:false`;
- citar linha, timestamp, evento ou ID inexistente;
- inventar tabela/coluna para compensar dados ausentes.

## Validação real pendente

A VPN estava desligada durante o desenvolvimento. A regressão real no banco deve ocorrer somente após confirmação explícita do Lucas de que a VPN está ligada.
