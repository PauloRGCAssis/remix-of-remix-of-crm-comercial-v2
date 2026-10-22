---
name: Meta Config Draft
description: Autosave and data-protection rules for the Configuração de Metas dialog
type: feature
---
- Every edit autosaves a draft, separated by user and reference month; only the edited fields are stored.
- DB values load first; the draft is applied afterwards and only to the fields the user changed. Opening or loading never creates a draft.
- Drafts without original values or repeating the same value across several vendors (e.g. R$ 10.000,00 everywhere) are NEVER auto-applied: shown for review with Aplicar só individuais / Aplicar mesmo assim / Remover.
- Closing with unsaved changes offers: Continuar editando / Sair e manter rascunho / Descartar alterações.
- Indicator: "Alterações não salvas" → "Rascunho salvo automaticamente" → "Metas salvas com sucesso".
- Salvar Metas writes only vendors that changed; blocks emptied fields that had a saved value (type 0 to remove on purpose); draft deleted only after DB confirms; on error all typed values stay.
- Never use default/placeholder values for goals.
