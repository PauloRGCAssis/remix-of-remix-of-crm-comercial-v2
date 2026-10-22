---
name: Client Profiles (Cadastro)
description: Aba 'Cadastro de Clientes' com fichas completas (CNPJ, endereço, entrega, contatos, produtos, PDF). Tabela client_profiles, ViaCEP, região auto via getRegionalByBairro
type: feature
---
Módulo "Cadastro de Clientes" (rota /cadastro) gerencia fichas completas de clientes:
- Tabela Supabase `client_profiles` com RLS pública (mesmo padrão do projeto).
- Persistência via hook `useClientProfiles` (React Query) em `src/hooks/useClientProfiles.ts`.
- Tipos em `src/types/clientProfile.ts` (Contato, ProdutoNegociadoFicha, ClientProfile).
- CEP via ViaCEP em `src/lib/viacep.ts` (auto-preenche rua/bairro/cidade/estado e resolve região quando cidade=Belo Horizonte usando `getRegionalByBairro`).
- UI: `ClientProfileDialog` (formulário), `ClientProfileViewer` (Sheet de visualização + export PDF via jsPDF/autotable), `CadastroClientesPage` (lista com busca + filtros vendedor/cidade/região).
- Vendedores reaproveitados de `TEAM_VENDEDORES` (useMetasData.ts). Ramos próprios em `RAMOS_ATIVIDADE` (clientProfile.ts). Catálogo de produtos vem de `CATALOGO_PRODUTOS` (crm.ts).
- Índice único parcial em CNPJ (apenas quando preenchido) impede duplicatas.
- Fase 1 entregue: ficha + lista + PDF. Pendente: integrações com Análise de Clientes, Inteligência Comercial, Metas, e alertas inteligentes.
