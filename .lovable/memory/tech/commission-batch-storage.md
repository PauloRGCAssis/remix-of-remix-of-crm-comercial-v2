---
name: Armazenamento da importação de comissão
description: Planilha de Pagamento de Vendedores é persistida no banco (commission_batches/commission_batch_rows), nunca em localStorage
type: constraint
---
Dados completos de importação NUNCA vão para o localStorage (estourava a quota: `commission-batch-YYYY-MM`).

- Lote da planilha mensal fica em `commission_batches` (metadados, 1 por competência) + `commission_batch_rows` (linhas em jsonb, ligadas por `batch_uid`).
- Gravação é atômica na leitura: linhas novas entram sob um `batch_uid` inédito, o ponteiro da competência só é atualizado no fim, e o lote anterior só é apagado depois. Falha no meio = rollback das linhas parciais.
- localStorage só para preferências pequenas: última competência aberta (`commission-batch-current-ym`) e rascunho de configuração por vendedor/mês (`pagto-prefs-v3-*`).
- `cleanupLegacyCommissionStorage()` em `src/hooks/useCommissionImport.ts` remove apenas chaves `commission-batch-YYYY-MM` obsoletas.
