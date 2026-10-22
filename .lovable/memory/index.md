# Project Memory

## Core
Pão de Queijo Ti Delso commercial system. pt-BR interface.
Visuals: Playfair Display (headings), DM Sans (body), golden/amber palette.
Tech: Supabase, Edge Functions. React Query v5.56.2.
UI Rules: Tables use freeze panes. KPI cards use responsive grids. Phones use BR masks. Use 'mil' instead of 'K' for large values. Product names abbreviated for display via formatProductDisplay (PDQ/Trad./unid.).
Component Constraints: Radix Select MUST NOT receive empty/null strings.
Business Logic: Revenue mirrors spreadsheet total exactly; do not exclude any sales item. Commercial week anchor day is Wednesday.

## Memories
- [Project Identity](mem://project/identity) — System context and locale
- [Visual Direction](mem://style/visual-direction) — Typography and color palette
- [Tech Stack](mem://tech/stack) — Supabase, Edge Functions, bulk import deduplication
- [Filters & Metrics UI](mem://features/filters-and-metrics-ui) — Accent-insensitive search, explicit popover confirmation
- [Map & Routing](mem://features/map-and-routing) — Geographic block priority and Haversine distance
- [Regional Audit Panel](mem://features/regional-audit-panel) — Audit for geographic assignment accuracy
- [Sales Pipeline Flow](mem://logic/sales-pipeline-flow) — Prospecting Kanban strictly manual movement
- [Visit Feedback System](mem://features/visit-feedback-system) — Auto-completes agenda when lead deal closes
- [Product Catalog](mem://features/product-catalog) — Fixed 19 products, mandatory price on closing
- [Objection Management](mem://features/objection-management) — Mandatory justification for lost deals
- [Kanban Card Layout](mem://style/kanban-card-layout) — Conditional fields by stage, badge types
- [Sales Study Analytics](mem://features/sales-study-analytics) — Monthly compare with 'steep drop' alerts
- [Navigation Structure](mem://project/navigation-structure) — Fixed sidebar order
- [Client Management UI](mem://features/client-management-ui) — Segmentations (Ativo/Atenção/Crítico) from real sales
- [Ponto de Venda](mem://features/ponto-de-venda) — PDV flags in client_profiles, /ponto-de-venda screen and address import
- [Client Profiles (Cadastro)](mem://features/client-profiles) — Aba '/cadastro' com fichas completas, ViaCEP, região auto, PDF
- [Cadastro Central do Cliente](mem://logic/cadastro-central-cliente) — Sincronização de dados de qualquer tela, conflitos, ficha mínima, auditoria
- [Seller Performance Metrics](mem://logic/seller-performance-metrics) — Regex name matching for direct sales aggregation
- [Table Scrolling UI](mem://style/ui-patterns/table-scrolling) — Freeze panes logic for large datasets
- [Performance Metrics](mem://logic/performance-metrics) — Dynamic calculation vs previous or custom period
- [Number Formatting UI](mem://style/ui-patterns/number-formatting) — Large currency representation
- [Sales Import System](mem://features/sales-import-system) — Incremental UPSERT/MERGE imports; never delete historical sales
- [Conjunto vigente de vendas](mem://logic/sales-canonical-active-set) — Dedupe canônico, arquivo de fechamento do mês e regra de virada

- [Client Name Normalization](mem://logic/client-name-normalization) — Sanitization and Levenshtein deduplication
- [Agenda Card Layout](mem://style/agenda-card-layout) — Geographic ordering and fixed contact layout
- [Phone Formatting UI](mem://style/ui-patterns/phone-formatting) — BR masks and default DDD 31
- [Regional Assignment Logic](mem://logic/regional-assignment-logic) — Neighborhood to region mapping rules
- [Visit Scheduling Logic](mem://logic/visit-scheduling) — Redundant time field parsing
- [First Sale Alert](mem://features/first-sale-alert) — KPIs and tags for clients with exactly one purchase
- [Comparative Analysis](mem://features/comparative-analysis) — Custom period comparison with absolute and % variations
- [Team Composition Rules](mem://logic/team-composition-rules) — 'Equipe' metrics restricted to 6 fixed sellers
- [Prospecting Details](mem://features/prospecting-details) — Fields, attendance types, exclusion history
- [Product Smart Search](mem://style/ui-patterns/product-smart-search) — Busca inteligente obrigatória em todo seletor de produto
- [Product Normalization](mem://logic/product-normalization) — Canonical mapping for UI consistency
- [Product & Client Identity](mem://logic/product-and-client-identity) — Product = sheet code, client = CNPJ/CPF, month = sale date in UTC

- [React Query Version](mem://tech/dependencies/react-query-version) — Pinned to 5.56.2
- [Select Values Constraint](mem://tech/ui-constraints/select-component-values) — No empty strings in Radix Select
- [Spreadsheet Revenue Mirror](mem://logic/spreadsheet-revenue-mirror) — Revenue is direct SUM of Preço Venda Total (R$), no item exclusions
- [Client Lifecycle Rules](mem://logic/client-lifecycle-rules) — Novo, Em Validação, Recorrente classifications
- [Commission & Rewards](mem://features/commission-and-rewards) — Voucher Gasolina and commission ladder
- [Order Schedule Alerts](mem://logic/order-schedule-alerts) — Missed order alerts for specific route days
- [Persistence Logic](mem://tech/persistence-logic) — Cloud merge via 'atualizado_em', promise queue
- [Prospecting Segmentation](mem://features/prospecting-segmentation) — Auto-classification and multi-select for segments
- [ABC Analysis](mem://features/abc-analysis) — Pareto curve and Strategic Radar
- [Commercial Week Definition](mem://logic/commercial-week-definition) — Wednesday anchor rule for commercial weeks
- [Order Schedule Mode](mem://logic/order-schedule-per-day-mode) — Independent auto/manual modes per weekday
- [WhatsApp Integration](mem://features/order-schedule-whatsapp-integration) — Template variables and metrics
- [Manual Activity Status](mem://features/client-manual-activity-status) — Optimistic toggle for lead active state
- [Commercial Goals Module](mem://features/commercial-goals-module) — Goal hierarchies, thresholds, and calculations
- [Sales Data Aggregation](mem://logic/sales-data-aggregation) — 'Pedidos Agregados' layer for accurate KPIs
- [Audit Mode](mem://features/audit-mode) — Panel showing raw data and formulas for transparency
- [Order Schedule Tool](mem://features/order-schedule-tool) — Anchor day, statuses, drag-and-drop, global search
- [KPI Cards UI](mem://style/ui-patterns/kpi-cards) — Responsive layouts for indicators
- [Client Address Association](mem://logic/client-address-association) — Cruzamento endereços x cadastro oficial, ordem de confiança, autofill de formulários
- [Commercial Intelligence](mem://features/commercial-intelligence) — BI dashboard mechanics and projections
- [Meta Config Draft](mem://features/meta-config-draft) — Autosaved per user+month drafts in Configuração de Metas, 3-option close prompt
- [Product Name Abbreviation](mem://style/ui-patterns/product-name-abbreviation) — Display-only PDQ/Trad./unid. helper
- [Ações Comerciais](mem://features/acoes-comerciais) — Campanhas promocionais por cliente, investimento, alertas e histórico
- [Controle de Bonificações](mem://features/controle-bonificacoes) — Bonificação fixa por cliente/produto, fórmula 10+N, conferência em kg
- [Commission Batch Storage](mem://tech/commission-batch-storage) — Importação da planilha de pagamento persistida no banco, nunca em localStorage
