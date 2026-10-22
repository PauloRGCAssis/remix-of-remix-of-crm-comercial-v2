# Plano: permissões individuais na edição de usuários

## Objetivo
Evoluir **Administração → Usuários → Editar usuário** para configurar permissões específicas por usuário, preservando integralmente os perfis e escopos já cadastrados.

## Implementação

### 1. Painel de permissões dentro da edição
- Manter os dados atuais do usuário no diálogo de edição: nome, e-mail, vendedores, perfil, escopo, status e papel administrativo.
- Tornar **Permissões individuais** uma área claramente acessível nesse fluxo, exibindo o nome do perfil-base e um resumo das exceções configuradas.
- Abrir uma matriz organizada por módulo e submódulo, usando o catálogo atual do CRM para não criar nomes ou rotas paralelas.

### 2. Estados explícitos por ação
Cada ação aplicável terá três estados:
- **Herdar do perfil**: nenhuma exceção individual; vale a configuração do perfil selecionado.
- **Liberar**: grava uma exceção individual com `permitido = true`.
- **Bloquear**: grava uma exceção individual com `permitido = false`.

A interface mostrará separadamente o valor herdado do perfil e o resultado efetivo, evitando confundir “não marcado” com “bloqueado”. As ações serão as já reconhecidas pelo sistema: acessar, visualizar, criar/cadastrar, editar e excluir; importação, exportação, finanças, metas, comissões e demais capacidades continuarão na seção de permissões especiais existente.

### 3. Controles por módulo
- Permitir configurar cada ação isoladamente, por exemplo: visualizar e editar liberados, criar e excluir bloqueados.
- Adicionar comandos por módulo para **Liberar módulo**, **Bloquear módulo** e **Restaurar herança do perfil**.
- Em módulos com sub-abas, manter controles independentes para o módulo principal e para cada sub-aba.
- Desabilitar ações que não se aplicam ao módulo, conforme o catálogo atual.

### 4. Salvamento seguro e independente
- Carregar em conjunto as permissões do perfil-base e as exceções do usuário.
- Manter alterações em estado local e persistir somente ao clicar em **Salvar permissões**, evitando gravações parciais a cada clique.
- Salvar por chave única `usuário + módulo + ação`, removendo somente as exceções que voltarem para “Herdar”.
- Não alterar `profile_permissions`, perfis, escopos, outros usuários, autenticação ou histórico.
- Invalidar os caches de permissões após salvar para que o novo acesso seja aplicado imediatamente.

### 5. Compatibilidade com as regras atuais
- Preservar a precedência já implementada: exceção individual substitui o perfil; sem exceção, vale o perfil.
- Preservar a cópia de usuário: as exceções individuais continuam sendo copiadas como uma configuração inicial independente.
- Usuários com papel **Administrador** continuam com acesso total pela regra de segurança atual; permissões individuais passam a valer quando esse papel não estiver ativo.

## Arquivos principais
- `src/components/admin/EditarUsuarioDialog.tsx`: integração e resumo das permissões na edição.
- `src/components/admin/UsuarioPermissoesDialog.tsx`: matriz com herança/liberação/bloqueio, ações por módulo e salvamento em lote.
- `src/lib/modulesCatalog.ts`: apenas ajustes de rótulos/metadados se necessários, sem mudar permissões de perfis.

## Validação
- Testar usuário com perfil-base e nenhuma exceção: resultado igual ao perfil.
- Liberar uma ação negada pelo perfil e confirmar o acesso efetivo.
- Bloquear uma ação liberada pelo perfil e confirmar a negação efetiva.
- Restaurar uma ação para “Herdar” e confirmar a remoção da exceção.
- Validar bloqueio/liberação em lote por módulo e controles de sub-abas.
- Confirmar que nenhum registro de `profile_permissions` foi alterado.
- Rodar verificação de tipos, build e teste visual responsivo do diálogo em Administração → Usuários.
