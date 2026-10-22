# Spreadsheet Revenue Mirror

The spreadsheet is the single source of truth for values. Imports are incremental/cumulative: use UPSERT/MERGE by stable sale key and never DELETE historical ranges during import. No exclusions (frete, isopor, embalagem, papelão, taxa, ajuste, etc.), no "produto acabado" classification, no aggregation caches.

Faturamento (and every KPI) = direct sum of `preco_total` over the rows currently filtered on screen. Filters mirror Excel filters: vendedor, período, cliente, descrição, código_venda.

Non-duplication across imports is enforced by the import key (codigo_venda + data/minuto + cliente + product code/name). Existing keys are preserved/updated individually; new keys are inserted. Never reintroduce `delete_range` or "Substituir período" for sales imports.

`isProdutoAcabado` and `isExcludedProduct` always return true/false respectively (kept only for legacy callers). `deduplicateSalesRows` and `deduplicateParsedRows` only sort — they no longer drop rows.
