# AGENTS.md

- Meta configuration drafts live in `src/lib/metaConfigDraft.ts` (localStorage, keyed by user + year-month) and store only changed fields with their DB base value; the draft is read only after DB values load, legacy or repeated-value drafts go to quarantine for explicit review, and "Salvar Metas" upserts only vendors that changed — so opening/loading can never overwrite saved goals.
