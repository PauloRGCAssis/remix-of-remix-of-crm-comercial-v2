# Login, Perfis e Permissões (CRM Comercial)

## O que já existe
Login ativo, papéis admin/vendedor, vínculo usuário → vendedor, menu filtrado por gestor e filtro de dados por vendedor no CRM e nas vendas. Acesso anônimo ao banco já foi bloqueado.

## O que será construído

### 1. Estrutura de permissões no banco
- `permission_profiles`: perfis prontos (Administrador, Gestor, Vendedor, Personalizado).
- `profile_permissions`: permissões do perfil por módulo/sub-aba e por ação (acessar, visualizar, criar, editar, excluir).
- `user_permissions`: exceções individuais que sobrescrevem o perfil (ex.: liberar uma sub-aba só para o Ednei).
- `user_access`: perfil do usuário, status ativo/inativo, administrador sim/não, escopo de dados (`meus_dados` | `vendedores_selecionados` | `empresa`) e lista de vendedores autorizados.
- `access_audit_log`: usuário, data/hora, login, página, ação, exportações, importações, alterações de permissão.
- Função de banco `pode_ver_vendedor(usuario, vendedor)` e `tem_permissao(usuario, modulo, acao)` usadas nas políticas de acesso das tabelas comerciais (vendas, PDV, bonificações, degustações, ações comerciais, metas, comissões), garantindo o isolamento no servidor — não só na tela.

### 2. Catálogo de módulos
Um único arquivo central lista todas as abas e sub-abas do CRM (incluindo as 11 sub-abas da Inteligência Comercial) com sua rota. Esse catálogo alimenta a matriz de permissões, o menu e a proteção de rotas — sem espalhar regra por tela.

### 3. Camada central de autorização no app
- Contexto único que carrega perfil, permissões efetivas (perfil + exceções) e escopo de dados no login.
- Componente de rota protegida por módulo/sub-aba, exibindo "Você não possui permissão para acessar esta área." ao tentar acessar pela URL.
- Menu lateral e abas internas renderizados a partir das permissões.
- Hook de escopo que devolve a lista de vendedores permitidos; todas as consultas comerciais passam a filtrar por ela, inclusive exportações Excel/PDF e o pacote de dados enviado à Central de Análise (filtragem antes do envio à IA).
- Filtros de vendedor travados no próprio vendedor quando o escopo for "somente meus dados"; sem opção "todos".

### 4. Área Administração (somente administradores)
- **Usuários**: nome, e-mail, vendedor vinculado, perfil, status, administrador, escopo de dados.
- **Perfis e Permissões**: matriz visual módulo × ação, com sub-abas aninhadas, selecionar tudo / remover tudo, e permissões especiais (importar, exportar Excel, exportar PDF, ver valores financeiros, ver comissões, ver/editar metas, ver outros vendedores, ver empresa inteira, editar/excluir clientes, editar bonificações e ações comerciais, administrar usuários, alterar permissões, ver comparação entre vendedores).
- **Auditoria de Acessos**: lista filtrável por usuário, período e tipo de evento.

### 5. Regras preservadas
Nenhuma alteração em cálculos de faturamento, metas, cliente novo, bonificações, comissões ou datas de pedidos. Dados históricos continuam vinculados ao vendedor do próprio registro.

## Entrega sugerida
1. Banco (tabelas, funções, políticas) + catálogo de módulos.
2. Camada central de autorização, menu dinâmico e rotas protegidas.
3. Tela de Administração (usuários, matriz, auditoria).
4. Aplicação do escopo nas consultas, exportações e Central de Análise.
