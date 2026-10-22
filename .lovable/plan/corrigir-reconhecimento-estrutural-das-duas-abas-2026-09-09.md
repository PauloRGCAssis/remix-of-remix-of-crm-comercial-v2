# Corrigir reconhecimento estrutural das duas abas

## Objetivo
Garantir que a importação mensal percorra todas as worksheets e reconheça vendas e bonificações pela estrutura real dos cabeçalhos, sem depender do nome da aba e sem alterar os 3.451 registros de vendas já válidos.

## Implementação
- Criar uma inspeção prévia de cada worksheet, procurando o melhor cabeçalho nas primeiras linhas após normalizar acentos, caixa, espaços e pontuação.
- Registrar e exibir no diagnóstico: abas encontradas, total de linhas, primeira linha não vazia, linha do cabeçalho, cabeçalhos reais e regra usada na classificação.
- Classificar vendas pela assinatura de faturamento (`Código Venda`, `Data`, `Cliente`, `Vendedor`, `Preço Venda Total`).
- Classificar bonificações pela assinatura estrutural (`Cliente`, `Vendedor`, `Produto/Descrição`, `Categoria Venda`, `Custo`) e, como fallback seguro, reconhecer a outra worksheet tabular compatível quando já existir uma única aba de vendas claramente identificada.
- Mapear os dados usando somente as posições dos cabeçalhos realmente encontrados e preservar aba e número de linha em todos os erros.
- Bloquear conclusão quando não houver as duas partes, mostrando todas as abas, cabeçalhos e a regra que falhou.
- Manter a gravação atual das vendas e usar a estrutura existente de bonificações, vinculando vendedor e competência selecionada.

## Validação
- Executar testes automatizados com os arquivos mensais reais disponíveis, que possuem `Faturamento` e `Bonificação`, verificando contagens e classificação das duas abas.
- Validar compilação e o relatório visual separado de vendas e bonificações.
- Testar `Total Vendas Agosto - 2026.xlsx` assim que o arquivo estiver disponível no ambiente; no momento, os uploads contêm arquivos até julho de 2026, não agosto.
