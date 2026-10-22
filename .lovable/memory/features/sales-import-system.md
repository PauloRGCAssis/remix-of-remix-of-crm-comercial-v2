---
name: Sales Import System
description: Incremental UPSERT/MERGE imports; never delete historical sales
type: feature
---
Sales imports are incremental and cumulative. Never delete or replace a historical date range during import.

Identify each imported sale by a stable key: `codigo_venda` + date/minute + normalized client + product code/name. If the key already exists, preserve it when unchanged or update only that specific row when values changed. If the key does not exist, insert it.

The import UI must present only the incremental flow; do not re-add "Substituir período", `delete_range`, or DELETE + INSERT behavior.