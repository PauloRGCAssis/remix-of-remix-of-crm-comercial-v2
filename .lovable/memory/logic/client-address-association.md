---
name: Associação de endereços com o cadastro oficial
description: Regras de cruzamento entre client_address_staging e a base oficial (client_profiles + clientes com vendas) usadas na tela Clientes (Endereços) e no preenchimento automático de formulários
type: feature
---
Base oficial de clientes = `client_profiles` + todos os clientes com vendas importadas (view `client_directory`).

Ordem de confiança do cruzamento (`src/lib/clientAddressMatch.ts`):
1. código do cliente → 2. CNPJ/CPF → 3. telefone → 4. nome normalizado (sem acento, caixa, pontuação e tags "(IM)", "(GR)", "(INATIVO)") → 4b. núcleo do nome (sem prefixo de segmento e sufixos societários) → 5. nome + endereço.
Similaridade ≥ 0,82 gera apenas SUGESTÃO (nunca funde automaticamente). Chave ambígua (mais de um cliente) nunca é aplicada sozinha.

Tela Clientes (Endereços): botão "Executar associação automática" (aplica os matches de alta confiança, criando ficha quando o cliente só existe nas vendas) + botão "Criar ficha a partir do cadastro Sige" para registros sem cliente em nenhuma base. Busca global no topo da fila de revisão.

Formulários (ex.: Nova Degustação) preenchem endereço/bairro/cidade/contato via `src/lib/clientAddressLookup.ts`, que consulta a ficha e, como retaguarda, `client_address_staging`. Quando há mais de uma unidade, o formulário exibe seletor de endereço.
