# Permissões CRUD — mapeamento e plano de ativação

Branch `fix/seguranca-rls-permissoes`. Documento de revisão; nada foi publicado, executado no banco ou commitado.

## 1. Mecanismo

- `src/lib/crudEnforcement.ts` — chave de ativação **por módulo** (`CRUD_ATIVO`). Todas começam `false`.
  Com a chave desligada, criar/editar/excluir seguem liberados para quem acessa o módulo, exatamente como antes.
- `src/hooks/useModuleCrud.ts` — reaproveita `can()` de `usePermissions` (perfil + exceções individuais + role `admin`).
  Fornece `podeCriar/podeEditar/podeExcluir` para a interface e `exigir(acao)` para barrar a gravação em si
  (erro "Sem permissão para …", sem mensagem falsa de sucesso). Durante o carregamento, `can()` é falso: nada é liberado antes da hora.
- Ativar um módulo = mudar sua chave para `true`, **somente após** a análise das consultas SQL dos perfis (seção 5).

## 2. Regras aprovadas

| Situação | Ação exigida |
|---|---|
| Novo registro, duplicar, copiar para vários, importar planilha do módulo | criar |
| Editar, mudar status, arrastar entre colunas/dias, edição em lote, reativar | editar |
| Excluir, excluir em lote, exclusão lógica, inativar / remover da lista | excluir |
| Item de catálogo dentro de um formulário | criar/excluir do módulo do formulário |
| Ficha completa do cliente (diálogo e visualizador), de qualquer tela | `cadastro_clientes` |
| Diálogo de nova visita, de qualquer tela | `agenda_visitas` |
| Análise de Clientes: excluir cliente das análises | `clientes_duplicados:excluir` |
| Análise de Clientes: agendar visita | `agenda_visitas:criar` |
| Análise de Clientes: status salvo só no navegador | livre |
| Importação de vendas (Importar, Ponto de Venda, Pagamento) | `especial.importar_dados` (o mesmo que o servidor já exige) |
| Efeitos automáticos legítimos em outro módulo | não exigem segunda permissão |

Não alterados nesta tarefa: `visualizar` (pendente), demais `especial.*`, as 12 sub-abas `inteligencia.*`, exportações, `podeUsarIA`.

## 3. Situação por módulo

| Fase | Módulo | Operações | Situação |
|---|---|---|---|
| 1 | `acoes_comerciais` | criar (nova, duplicar, copiar p/ clientes, tipo), editar (formulário, status), excluir (ação, tipo) | **Preparado** (interface + gravação), chave desligada |
| 1 | `bonificacoes` | criar (nova, importar), editar (negociação, vínculos), excluir (lógica, em lote) | **Preparado**, chave desligada |
| 1 | `cadastro_clientes` | criar, editar, mesclar por CNPJ, excluir (1 e lote), catálogos do formulário | **Preparado**, chave desligada |
| 2 | `degustacoes` | criar (nova, duplicar 1/lote), editar (formulário, status inline/lote, confirmar, data na duplicação), excluir; catálogos materiais/equipamentos (criar/editar/excluir) | **Preparado** (interface + gravação nos hooks), chave desligada |
| 2 | `ponto_venda` | criar (novo, incluir cliente existente), editar (ficha PDV, ativar), excluir (inativar, remover da lista — lógico); importar vendas = `especial.importar_dados` (ativo, igual ao servidor) | **Preparado** (interface + handlers), chave desligada |
| 2 | `clientes_enderecos` | criar (importar planilha, criar fichas Sige), editar (associação manual/automática), excluir (descartar pendente) | **Preparado** (interface + handlers), chave desligada |
| 2 | `clientes_duplicados` | editar (agrupar, separar, adiar, lote, CNPJ em lote, restaurar), excluir (remover alias, excluir das análises) | **Preparado** (interface + gravação no hook `useClientAliases`), chave desligada |
| 2 | `analise_clientes` | excluir das análises (`clientes_duplicados:excluir`), agendar visita (`agenda_visitas:criar`, botão) | **Preparado**; o diálogo de visita será protegido na Fase 3 |
| 3 | `prospeccao` | criar, editar, pipeline, agendar, feedback, encerrar, excluir | A fazer (guarda nos handlers das páginas) |
| 3 | `agenda_visitas` | nova visita/lote, realizar, reagendar, editar, lote, excluir | A fazer |
| 3 | `agenda_pedidos` | criar, importar, editar, arrastar, modo, respostas/lote, remover do dia, inativar | A fazer |
| 4 | `metas` | salvar metas, configuração global, ajuste manual de comissão | A fazer |
| 4 | `pagamento_vendedores` | importar, fechar/editar mês, limpar lote | A fazer |
| 4 | `vendedores` | criar, editar, ativar/inativar, configuração global | A fazer |
| 4 | `importar` | importação (servidor já exige), reconstruir dedupe, cadastrar vendedores desconhecidos | A fazer |
| — | `dashboard`, `relatorios` | somente leitura | Nada a proteger |
| — | `administracao` | restrito à role `admin` (correção 02) | Já protegido |

Observação Fase 1 (resolvida na Fase 2): `QuickCreateSelect` agora recebe `modulo` obrigatório — Cadastro → `cadastro_clientes`, PDV → `ponto_venda`, Prospecção → `prospeccao` (sem chave ainda, segue liberado).

Observação Fase 2: a ação "Importar planilha" do PDV passou a ser exibida só com `especial.importar_dados`, sem chave de ativação, porque a função `import-sales` já recusa quem não a tem (mesma precedência: admin → exceção individual → perfil). Quem não tem essa permissão já recebia erro ao importar.

## 4. Problemas fora do escopo (somente documentados)

| Gravidade | Problema | Onde |
|---|---|---|
| **Crítica** | Sincronização do CRM pode enviar à nuvem dados locais/de exemplo como se fossem do usuário atual se a leitura inicial falhar; regrava todas as linhas a cada mudança e ignora erros | `lib/crmCloudSync.ts`, `contexts/CrmContext.tsx` |
| **Crítica** | Pagamento de Vendedores: seletor de vendedor ignora o escopo — qualquer usuário com acesso abre e salva o pagamento de outro; leituras de comissão sem escopo | `pages/PagamentoVendedoresPage.tsx`, `hooks/useCommissionImport.ts` |
| Alta | Exclusões de Prospecção e Agenda de Visitas não chegam ao banco (só insert/update); registros voltam ao recarregar | `lib/crmCloudSync.ts` |
| Alta | IA no servidor autoriza pelo nome do perfil, não pela matriz | `supabase/functions/central-analise` |
| Alta | Várias leituras sem filtro de vendedor no cliente (comissões, logs semanais, aliases, staging de endereços) — dependem só do RLS | diversos hooks |
| Média | "Limpar" lote de comissão apaga sem confirmação | `PagamentoVendedoresPage.tsx` |
| Média | Agenda de Pedidos ignora erros de gravação | `hooks/useAgendaPedidos.ts` |
| Média | Migração automática de lote legado grava no banco ao carregar (também a partir da Inteligência) | `hooks/useCommissionImport.ts` |
| Baixa | Ajuste manual de comissão grava a cada tecla | `components/metas/VendedorPerformanceCard.tsx` |
| Baixa | "Nova bonificação" usa upsert e pode sobrescrever silenciosamente cliente+produto existente | `hooks/useBonificacoes.ts` |
| Baixa | Código sem uso: `useClientStatus`, `useImportPdvSalesRows`, `batchMarkEnviada` | — |

## 5. Pendências que dependem de banco / decisão

1. **Consultas dos perfis** (enviadas anteriormente): cobertura de visualizar/criar/editar/excluir por perfil e módulo, especiais, exceções individuais, políticas RLS. Necessárias para ativar cada chave.
2. **`user_permissions`**: chave única, duplicados e definição de `tem_permissao` — necessárias para habilitar o Bloquear individual.
3. **RLS**: não há migrations no repositório. Toda proteção do frontend pode ser contornada por chamada direta à API se as políticas forem permissivas. Validar em homologação com usuários fictícios (admin, gestor, vendedor A/B) as quatro operações por tabela.
4. **`visualizar`**: definir semântica depois da consulta (1).
