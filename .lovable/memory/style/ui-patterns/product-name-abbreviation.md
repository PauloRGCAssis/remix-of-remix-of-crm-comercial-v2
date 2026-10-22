---
name: Product Name Abbreviation (display only)
description: Display-layer helper formatProductDisplay() abbreviates long product names in tables, PDFs, charts and tooltips. Never use for filter/equality logic.
type: design
---
Helper: `src/lib/productDisplay.ts` → `formatProductDisplay(name)`.

Substitutions (case-insensitive, word-bounded):
- "Pão de Queijo" → "PDQ"
- "Tradicional"   → "Trad."
- "Unidade(s)"    → "unid."

Rules:
- Apply ONLY at presentation layer (JSX text, table cells, PDF/Excel cells, tooltips, chart labels).
- NEVER use for keys, comparisons, filters, aggregations or persistence.
- `cleanProductName` keeps full canonical name; abbreviation is a separate display step.
- Already applied in: DegustacoesPage (card/PDF/Excel), clientProfilePdf, MissingProductsCell, DeepClientAnalysis, DeepVendedorAnalysis, DeepProductAnalysis, ClientesDetalhesDialog, CurvaAbcTab, VendasPage product table, ProductFilterPopover.
- Quantity label standard: always render "{n} unid." (singular/plural removed).
