# Corrigir definitivamente a leitura das duas abas

## Objetivo
Ler explicitamente as worksheets `Faturamento` e `Bonificações` do workbook completo, com rotinas independentes, mantendo intacta a lógica já validada dos 3.451 registros de faturamento.

## Implementação
- Resolver primeiro os nomes exatos em `workbook.SheetNames`: `Faturamento` e `Bonificações`; usar normalização de acentos apenas como fallback e bloquear com diagnóstico se alguma estiver ausente.
- Separar o parser em `parseFaturamento(sheet)` e `parseBonificacoes(sheet)`. Cada rotina localizará e mapeará seu próprio cabeçalho, sem compartilhar a configuração de colunas da outra aba.
- Manter a interpretação atual de faturamento e limitar a nova lógica à seleção e leitura explícita das duas worksheets.
- Fazer `parseBonificacoes` converter toda a worksheet com `sheet_to_json`, preservar linha física, mapear apenas campos realmente existentes e retornar erros detalhados quando nenhuma linha for aceita.
- Registrar no diagnóstico `SheetNames`, nome, linhas brutas, primeira linha com dados, cabeçalhos e registros válidos de cada aba.
- Persistir somente as linhas retornadas por `parseBonificacoes` em `bonificacao_rows`, usando vendedor, cliente, documento, pedido, produto e data disponíveis. Manter `bonificacao_cadastro` como cadastro de regras comerciais, sem criar automaticamente negociações inexistentes; vínculos manuais continuam em `bonificacao_vinculos`.
- Corrigir o relatório para usar as contagens confirmadas de faturamento e bonificações, sem declarar toda a aba gravada quando apenas parte foi persistida.
- Garantir que a lista e os cálculos por vendedor consumam a lista independente de bonificações importadas.

## Segurança dos dados
- Não excluir nem alterar lotes anteriores, fechamentos, configurações ou outros meses.
- Se qualquer etapa falhar, não apresentar a importação como concluída e manter o lote anterior disponível.

## Validação
- Adicionar testes com nomes exatos `Faturamento` e `Bonificações`, cabeçalhos diferentes e múltiplas linhas de bonificação.
- Revalidar que a contagem do faturamento não muda nos arquivos mensais disponíveis.
- Executar testes e validação de compilação.
- Testar o arquivo real `Total Vendas Agosto - 2026.xlsx`, confirmar as duas abas, 3.451 vendas, total de bonificações, três exemplos persistidos e o vendedor correspondente. Este último teste depende do upload do arquivo, que não está disponível nesta sessão.
