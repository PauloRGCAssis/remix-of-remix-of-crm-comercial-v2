# Controle de acesso por perfil e vendedor (global)

Nenhum dado é apagado, migrado ou zerado. A mudança é só de visibilidade e permissão.

## 1. Camada global de escopo de vendedor

Criar um hook único `useVendorScope()` (sobre o `usePermissions` já existente) que responde:

- `vendedoresPermitidos`: lista de vendedores autorizados ao login, ou "todos" quando o escopo for empresa.
- `vendedorPadrao`: preenchido automaticamente quando há apenas um autorizado.
- `podeVer(vendedor)`: usado para filtrar listas, editar e excluir.
- `opcoesVendedor`: fonte única para todos os seletores de vendedor do CRM (inclusive nos formulários de cadastro).

A lista vem exatamente do que o administrador configurou em Administração → Usuários (vendedores vinculados, escopo do perfil e escopo personalizado). Nada de regra própria por tela.

## 2. Filtro de vendedor em todas as telas comerciais

Aplicar a mesma camada em: Dashboard, Prospecção, Ponto de Venda, Agenda de Visitas, Agenda de Pedidos, Cadastro de Clientes, Clientes/Endereços, Análise de Clientes, Estudo de Vendas, Inteligência Comercial, Metas, Ações Comerciais, Degustações, Bonificações, Relatórios e Pagamento de Vendedores.

Regras iguais em todas:

- O seletor mostra somente vendedores autorizados; "Todos" só aparece para quem tem escopo de empresa.
- Com um único vendedor autorizado, o filtro já abre selecionado e travado.
- As listas, KPIs, gráficos e exportações usam a lista autorizada, não a seleção visual.
- Ao criar registro novo, o campo vendedor só oferece os autorizados (preenchido automaticamente quando há um só).
- Editar e excluir ficam bloqueados em registros de vendedores fora da lista.
- Se o vendedor não tiver registros, a tela aparece vazia — comportamento esperado.

## 3. Chat / IA restrito a Administrador e Gestor

- A aba "Central de Análise (IA)" some do menu e das abas da Inteligência Comercial para os demais perfis.
- A rota/aba fica bloqueada mesmo acessada diretamente pela URL.
- Nenhum botão de IA fica disponível, portanto não há como gerar consumo de créditos.
- Bloqueio também no backend: a função de IA passa a exigir sessão válida e conferir o papel do usuário antes de chamar o modelo, devolvendo acesso negado para quem não for Administrador/Gestor.

## 4. Segurança no banco

- Revisar e aplicar políticas de acesso usando a função já existente `pode_ver_vendedor` nas tabelas comerciais por vendedor (bonificações, PDV, degustações, ações comerciais, metas, comissões, vendas), garantindo o filtro no servidor.
- Nenhuma política nova apaga linhas: os registros continuam na base e apenas deixam de ser retornados para o login sem autorização.
- Administrador continua enxergando tudo.

Observação técnica: os dados de Prospecção e Agenda de Visitas hoje vivem em um único registro compartilhado (`crm_state`), então o isolamento desses dois módulos continua sendo feito na camada do aplicativo (leitura filtrada e gravação preservando os registros dos outros vendedores). Se quiser isolamento no banco também para esses dois, é um segundo passo de normalização dessas tabelas — que exige migrar os dados para tabelas próprias sem apagar nada.

## 5. Teste com o login da Raiane

Validar em navegador, com a configuração real (Raiane → vendedor autorizado: Raiane):

- Chat/IA não aparece e a rota é negada.
- Prospecção, Agenda de Visitas e Agenda de Pedidos aparecem vazias quando não há registros dela.
- Seletores de vendedor mostram apenas "Raiane".
- Ao voltar ao login administrador, todos os registros antigos continuam visíveis e intactos.
