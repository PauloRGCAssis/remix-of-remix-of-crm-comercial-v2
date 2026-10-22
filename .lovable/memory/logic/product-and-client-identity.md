---
name: Product and Client Identity
description: Product identity is the sheet code; client identity is CNPJ/CPF; month is the sale date in UTC
type: feature
---
Produto: a identidade é o CÓDIGO do prefixo da descrição ("105 - ..."), aceitando também "105- " e "105-1 - ". Nunca agrupar por preço nem por texto. `registerProductVocabulary(rows)` monta código → nome canônico (nome do catálogo `CATALOGO_PRODUTOS` quando existir; senão a variante de texto mais frequente) e `cleanProductName` devolve esse nome. Variações de digitação ("Recheado" ausente, acentos, "1kg"/"1 kg", typos) do mesmo código somam na mesma linha em todas as telas.

Cliente: mesmo CNPJ/CPF = mesmo cliente (`buildClientNameByDocument` + `resolveClientName`). Sem documento, vale `normalizeClientName` (que já remove marcadores (GR)/(IM)).

Competência: `getMonthKey` lê a data da venda em UTC (prefixo YYYY-MM). Nunca usar fuso local — jogava vendas do dia 1 para o mês anterior.

Estudo de Vendas: o intervalo de meses só é definido depois que os meses reais carregam (flag `estudo-vendas:rangeInitialized`); sem isso ficava travado no primeiro mês do histórico e a tela mostrava "—".
