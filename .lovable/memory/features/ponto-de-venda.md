---
name: Ponto de Venda (PDV)
description: Aba /ponto-de-venda lista clientes marcados como ponto de venda; flags em client_profiles e importação de endereços em /clientes-enderecos
type: feature
---
Módulo "Ponto de Venda":
- Flags em `client_profiles`: `is_ponto_venda`, `pdv_ativo`, `pdv_tipo` (Supermercado, Padaria, Empório, Sacolão, Loja de conveniência, Atacado, Restaurante, Outro), `telefone`, `whatsapp`, `codigo_cliente`.
- Só aparece na tela quem estiver marcado como ponto de venda no Cadastro de Clientes; importação de vendas nunca cria PDV automaticamente.
- Marcar como INATIVO ou remover da lista NÃO apaga cadastro nem histórico.
- Regras de agregação em `src/lib/pontoVenda.ts` (agrupa por `codigo_venda` para evitar duplicidade); match cliente↔vendas por CNPJ/código e, em fallback, nome normalizado.
- Telas: `src/pages/PontoVendaPage.tsx` (filtros, KPIs, tabela, export Excel/PDF), `src/components/pdv/PontoVendaDetalhe.tsx`, `src/components/pdv/AdicionarPontoVendaDialog.tsx`.
- `/clientes-enderecos` (`ClientesEnderecosPage`) importa planilha de endereços/telefones com mapeamento de colunas, usando CPF/CNPJ ou código do cliente como chave.
