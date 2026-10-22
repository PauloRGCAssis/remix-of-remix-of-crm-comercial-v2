---
name: Busca rápida e inteligente de produtos (padrão do CRM)
description: Todo seletor de produto do CRM deve ter busca inteligente (nome, código, palavras fora de ordem, recheio, gramatura), sem acento/caixa, ordenada por relevância.
type: preference
---
Helpers: `src/lib/productSearch.ts` → `searchProducts(items, query, getSearchText)`, `normalizeProductText`, `scoreProductMatch`.

Componentes prontos:
- `src/components/produtos/ProdutoCheckList.tsx` — multisseleção com busca.
- `src/components/produtos/ProdutoSelectSearch.tsx` — seleção única (popover + Command).

Regras:
- Qualquer campo (atual ou futuro) que selecione produto DEVE usar um desses componentes ou `searchProducts`.
- Busca ignora acentos/maiúsculas, aceita termos parciais em qualquer ordem, casa código ("1531") e gramatura ("1kg" = "1 kg").
- Sem texto digitado → lista completa na ordem original.
- Catálogo: `CATALOGO_PRODUTOS` em `src/types/crm.ts`, com campo `codigo` e helper `produtoSearchText(p)`.
- Já aplicado em: Ações Comerciais (bonificação), Degustações, Prospecção, Feedback de visita, Ficha do cliente, Bonificações, filtros de produto.
