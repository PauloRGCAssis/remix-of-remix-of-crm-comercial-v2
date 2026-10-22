---
name: Cadastro central do cliente (cadastre uma vez, use em todo o CRM)
description: Regra de sincronização de dados cadastrais informados em qualquer tela para client_profiles, com resolução de conflitos, endereços múltiplos, ficha mínima e auditoria
type: feature
---
Fonte única do cadastro = `client_profiles`. Qualquer módulo que capture dado cadastral deve chamar
`useCadastroCentralSync().sincronizar(dados, { modulo, registroId })` após salvar o próprio registro
e renderizar `<SincronizarCadastroDialog {...dialogProps} />`.

Motor: `src/lib/clientCentralRegistry.ts`
- Localiza a ficha por CNPJ e, na falta dele, por nome normalizado (`normalizeClientName` + `nameKeyStrict`). Nunca duplica cliente.
- Campo VAZIO na ficha -> preenchido automaticamente (endereço, bairro, cidade, estado, telefone/WhatsApp, contato).
- Campo com valor DIFERENTE -> conflito com escolha obrigatória: Manter atual / Atualizar cadastro / Adicionar como alternativo
  (telefone vira contato alternativo; endereço vira nova unidade em `client_address_staging` com `status='aplicado'` e `applied_profile_id`).
- Cliente "sem ficha" (só existe no histórico de vendas) -> cria ficha mínima com os dados informados.
- Toda alteração é auditada em `client_data_updates` (campo, valor anterior/novo, ação, módulo, registro de origem, usuário).

Normalização de nome (`src/lib/clientNameNormalization.ts`): `stripClientMarkers` remove (IM), (GR), (TD),
(INATIVO), (INADIMPLENTE), (MATRIZ), (FILIAL) de QUALQUER posição antes de comparar; `extractClientMetadata`
devolve o nome limpo + marcadores encontrados.

Já integrado: Degustações. Padrão a replicar nos demais formulários.
