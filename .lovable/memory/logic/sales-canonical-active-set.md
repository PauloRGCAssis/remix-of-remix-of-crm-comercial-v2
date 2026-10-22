---
name: Conjunto vigente de vendas (dedupe canônico)
description: Regras que definem quais linhas de sales_raw_rows ficam ativas; importação nunca desativa por ausência
type: feature
---
O importador NUNCA pode desativar linhas apenas por estarem "ausentes" no arquivo (a antiga varredura `syncFullReport` por intervalo de datas/códigos apagou meses inteiros). Desativação só dentro do grupo canônico presente no arquivo.

Conjunto vigente (`rebuild_sales_dedupe`):
1. Grupo canônico = codigo_venda + dia + cliente normalizado + código/nome do produto.
2. Vence a linha do arquivo com importação mais recente do grupo.
3. O arquivo que representa ≥50% das linhas do mês é o FECHAMENTO oficial daquele mês; linhas de outros arquivos naquele mês são descartadas.
4. Exceção: pedidos do ÚLTIMO DIA do mês importados depois do fechamento pertencem ao ciclo seguinte e permanecem ativos (regra de virada).

Referências validadas (Juliano): 01–28/06/2026 = R$ 264.308,85; 01–28/07/2026 = R$ 245.211,52 (inclui R$ 945,96 do pedido 118343 de 30/06).

## Regra do arquivo de fechamento (ago/2026)
- Para cada mês, o arquivo que traz a exportação completa (≥50% das linhas do mês) é a FONTE OFICIAL. Linhas de arquivos parciais mais antigos, dentro da faixa de datas coberta por ele, ficam `active=false`.
- Um item só pode ser desativado se existir versão ativa equivalente (pedido + produto + sequência). "Órfãos" (desativados sem substituto) são bug: reativar a versão mais recente.
- Validação de referência: julho/2026 — Juliano Carneiro Meira Freitas R$ 289.894,27; Armazém Central - Castelo 18 itens, 5 pedidos, 162 kg, R$ 3.472,06.

## Set/2026: flag syncFullReport desligada no import-sales
Relatórios parciais desativavam por ausência todo o intervalo (ex.: Pão do Carlão 27/08 sumiu). Flag forçada a false; 1.808 linhas órfãs reativadas (versão do arquivo mais recente por codigo_venda).
