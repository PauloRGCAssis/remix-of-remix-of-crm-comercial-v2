---
name: Controle de Bonificações
description: Conta-corrente por cliente cruzando vendas importadas x bonificações entregues, com % de negociação sobre o volume comprado
type: feature
---
Tela `/bonificacoes` ("Controle de Bonificações"). Agrupada por CLIENTE (não por produto).

Fontes (a tela NUNCA importa vendas — usa as bases já existentes):
- vendas: `sales_raw_rows` via `useSalesData` → volume comprado (kg) e faturamento (R$).
- entregas: `bonificacao_rows` (importação de bonificações / planilha de comissão).
- negociação: `bonificacao_cadastro`, coluna `pct_negociacao` (manual, prevalece sobre a estimativa).

Regras:
- **% de negociação é sempre sobre o volume comprado**: 10 kg comprados + 2 kg bonificados = 20% (nunca 2/12 = 16,7%).
- `Bonificação gerada = volume comprado × %`; `Saldo a entregar = gerada − entregue`.
- % estimada pelo histórico (entregue ÷ comprado × 100) é padronizada para múltiplos de 5 (10%, 20%, 30%); a % manual sempre prevalece e vale para todos os produtos daquele cliente.
- Colunas: Cliente | % Negociação | Volume comprado | Faturamento | Bonificação gerada | Bonificação entregue | Saldo a entregar | Status. Ações (Editar · Detalhes · Entregas · Excluir) ficam abaixo do nome do cliente.
- Todos os valores são clicáveis e abrem auditoria com os pedidos/entregas que os compõem.
- Filtros: período livre, busca, tipo de bonificação (multi-seleção dinâmica, padrão = categorias com "preço"), % de negociação, vendedor e status.

Cruzamento (`src/lib/bonificacaoCruzamento.ts`):
- Cliente casa por CNPJ ou por tokens com tolerância a erro de digitação (Levenshtein ≤ 1) — foi o que corrigiu "Armazen Central" (cadastro) x "Armazem Central - Savassi (GR)" (vendas), que zerava a tela.
- Produto casa por `produtoFamilia()` (marca | formato | recheio).
- Tolerância de 5% define ✅ Correto; abaixo/acima/sem bonificação/sem compra são os demais status.
- Exclusão é lógica (`ativo = false`), preservando histórico.

Coluna **Pedidos** (clicável) abre auditoria pedido a pedido: nº do pedido, data, unidade, produtos, kg, faturamento, % negociação, bonificação esperada × entregue e ⚠ divergência (tolerância 5%). Divergência de pedido NUNCA altera a % fixa do cliente.

Separação de unidades: cadastro é agrupado por cliente_key + CNPJ; as vendas casadas são divididas em UNIDADES (CNPJ, senão nome da venda). Cada unidade vira uma linha própria (volume, faturamento, pedidos, gerada, entregue, saldo) com rótulo curto de unidade/endereço. Nunca agrupar por nome comercial igual (ex.: Pastel na Feira — Alfredo Balena x Álvares Maciel).

Conciliação pedido × bonificação (`montarPedidos`) em cascata: (1) vínculo manual salvo em `bonificacao_vinculos`; (2) mesmo código de venda; (3) mesmo cliente + mesma data (soma todas as bonificações do dia); (4) vários pedidos no dia → desempate por família de produto e proximidade da quantidade esperada, senão "⚠ Bonificação pendente de conciliação"; (5) pedido mais próximo em até 7 dias; (6) só então "Bonificação sem pedido de compra". O número do pedido da bonificação NUNCA é exigido (o sistema de origem grava outro código). Vínculo manual/desvínculo fica no diálogo de Pedidos.
