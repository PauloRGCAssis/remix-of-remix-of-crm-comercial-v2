---
name: Ações Comerciais
description: Aba /acoes-comerciais para campanhas promocionais por cliente (tipos cadastráveis, investimento, regras, alertas, histórico de alterações)
type: feature
---
Módulo "Ações Comerciais" (rota `/acoes-comerciais`, item no menu lateral acima de Degustações):
- Tabelas: `commercial_actions`, `commercial_action_types` (tipos cadastráveis), `commercial_action_history` (auditoria de criação/edição com diff de campos e autor).
- Hook `src/hooks/useCommercialActions.ts` (CRUD, tipos, histórico, `diasRestantes`, marcos de alerta 30/15/7/1 dias).
- UI: `src/pages/AcoesComerciaisPage.tsx` (KPIs, investimento por vendedor/cliente/período, filtros, tabela com editar/duplicar/excluir/histórico), `src/components/acoes/AcaoComercialDialog.tsx` (form com busca de cliente por nome fantasia, produto do catálogo, tipos criáveis), `AcaoHistoricoSheet.tsx`, `ClienteAcoesComerciais.tsx`.
- Integração: a ficha do cliente (`ClientProfileViewer`) exibe a seção "Ações Comerciais" com o histórico do cliente.
- Duplicar cria nova ação com status Planejada e sufixo "(cópia)".

## Resultado, ROI e conclusão (automáticos)
- Campo `produto_bonificado` foi REMOVIDO. Bonificação agora é `quantidade_bonificada` + `bonificacao_unidade` ('R$' ou 'kg') — o cliente escolhe os produtos depois.
- `src/lib/acaoResultado.ts`: a PLANILHA é a fonte oficial. Faturamento = soma de `preco_total`; Kg = soma de `quantidade`; Pedidos = COUNT DISTINCT de `codigo_venda` (sempre inteiro); "Itens/linhas vendidos" é métrica separada. Cliente localizado preferencialmente por CNPJ/CPF (fallback: nome normalizado).
- NUNCA aplicar ajuste proporcional por dias. Comparativos usam meses completos: "Último mês", "Média dos últimos 3 meses" (total/3, pedidos podem ter decimal e são rotulados "Média de pedidos") e "Mesmo período do ano anterior".
- Investimento total = investimento + bonificação em R$ + custo dos produtos degustados (kg × `custo_kg_degustacao`) + valor das promotoras (`valor_promotora`, padrão R$ 100) + `outros_custos`. ROI = (retorno incremental − custo)/custo; conclusão Positivo (≥ +5%) / Neutro / Negativo (≤ −5%).
- Degustações vinculadas: colunas `possui_degustacoes` e `degustacao_ids` em `commercial_actions`; o form lista degustações do mesmo cliente dentro do período e o resultado recalcula sozinho quando a degustação muda.
- O painel de resultado tem bloco de AUDITORIA listando cada linha usada (Código Venda, Data, Cliente, CNPJ, Produto, Quantidade, Preço Venda Total) com totais.
- Status é alterável direto na tabela por dropdown clicável, sem abrir o formulário.
- `src/components/acoes/AcaoResultadoPanel.tsx` (painel reutilizável, gráfico antes/durante/depois), `AcaoResultadoSheet.tsx` (drawer na tabela), colunas Crescimento/ROI/Conclusão na tabela e KPIs de ROI médio e maior crescimento no dashboard.

## Copiar / duplicar ação
- Ícone "Copiar ação" (mode `duplicate` no `AcaoComercialDialog`) abre o form pré-preenchido SEM sufixo "(cópia)", com banner de origem e foco no campo Cliente. A original nunca é alterada; a cópia é nova ação com ID e histórico próprios.
- Ícone "Copiar para vários clientes" (`src/components/acoes/CopiarAcaoVariosDialog.tsx`): multiseleção de clientes, contador ("Serão criadas N novas ações"), cada cópia é independente e nasce com status Planejada.
- `src/lib/acaoCopia.ts`: `encontrarAcaoSemelhante` (mesmo cliente+tipo+nome+período → aviso "Já existe uma ação semelhante para este cliente neste período." com opção "Criar mesmo assim") e `degustacoesDoClienteNoPeriodo` (ao trocar o cliente, degustações do cliente antigo são descartadas e revinculadas ao novo; custo por kg é recalculado).
- Auditoria: o histórico da cópia registra "Cópia" com Origem da cópia (ID/ação), Nova ação (ID) e Data da cópia.

## Promotoras (múltiplas por degustação)
- A degustação tem lista `promotoras` (jsonb `{ nome, valor }[]`) na tabela `degustacoes`; o campo antigo `promotora` (texto) é mantido apenas como rótulo/compatibilidade e vira "Promotora 1" com valor padrão R$ 100.
- Fonte única: `src/lib/degustacaoPromotoras.ts` (`promotorasDaDegustacao`, `custoTotalPromotoras`, `promotorasLabel`, `promotorasDetalhe`).
- O investimento real da ação usa a SOMA dos valores individuais das promotoras da degustação (cada promotora contada uma única vez). `valor_promotora` da ação só é fallback para degustações antigas sem lista.
