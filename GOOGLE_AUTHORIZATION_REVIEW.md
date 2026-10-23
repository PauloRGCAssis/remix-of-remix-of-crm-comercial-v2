# TI DELSO — Problema A: autorização após Google

Data: 23/10/2026. Branch: fix/seguranca-rls-permissoes.
Implementação local concluída e validada com testes simulados, TypeScript e build. OAuth e RLS reais não foram testados. Nenhum commit, push, merge, deploy ou alteração de banco foi executado.

## Problema original
AuthPage redirecionava qualquer sessão autenticada para o CRM. A integração Lovable entregava a sessão ao Supabase, mas não verificava user_access. ProtectedRoute e useUserRole já restringiam acesso, porém não encerravam a sessão Google recusada nem apresentavam estados distintos de falha. CrmProvider e carregamentos globais estavam fora das rotas protegidas. Os caches de autorização usavam apenas userId com validade global infinita.

## Solução
GoogleAccessGate fica dentro de AuthProvider e antes de CrmProvider. Ele reutiliza a mesma consulta de useUserRole: user_access.user_id deve corresponder ao ID da sessão e ativo precisa ser exatamente true.
Durante a validação, o CRM não é montado. Conta ausente ou inativa é encaminhada para /auth e tem o logout do CRM solicitado. Se o logout falhar, o bloqueio permanece e há nova tentativa manual. Falha de consulta produz mensagem de verificação indisponível, sem declarar que a conta não existe; permite nova tentativa. Consultas têm cancelamento e limite de 15 segundos por tentativa, com uma repetição para erros transitórios e nenhuma para recusa explícita.
O fluxo serve tanto ao retorno por URL quanto à autenticação concluída por setSession. O componente não depende do retorno da promessa do botão para decidir autorização.
Metadados de provedor identificam apenas se a conta utiliza ou possui identidade Google vinculada. Eles nunca autorizam acesso. Contas previamente cadastradas com e-mail/senha e Google vinculado também passam pela verificação, sem criar identidade ou registro.
Uma versão de sessão separa as chaves de user-access e user-permissions. Logout, troca de usuário e nova autenticação impedem reutilização indevida das permissões. Renovação normal de token não força consultas periódicas. Padrões globais do React Query permanecem iguais.

## Arquivos desta correção
| Arquivo | Alteração |
|---|---|
| src/components/GoogleAccessGate.tsx | Novo componente que aguarda autorização e trata bloqueio, logout, erro e tentativa manual |
| src/lib/accessDeniedError.ts | Identifica recusa por ausência ou inatividade, separadamente de erro de consulta |
| src/hooks/useUserRole.ts | Reutiliza consulta existente; expõe recusa/erro/retry; cancela consultas; usa versão da sessão |
| src/contexts/AuthContext.tsx | Adiciona versão de sessão; impede getSession atrasado de restaurar sessão antiga; propaga falha de logout |
| src/hooks/usePermissions.ts | Inclui versão da sessão na chave de cache, preservando resolução de permissões |
| src/App.tsx | Posiciona o bloqueio antes do CRM e de seus carregamentos globais |
| src/pages/AuthPage.tsx | Exibe motivo de recusa; encerra estado busy em sucesso/erro/exceção do Google |
| src/test/googleAccessGate.test.tsx | 10 testes do bloqueio e das transições com React |
| src/test/googleUserRole.test.tsx | 6 testes da consulta existente e isolamento de cache |
| src/test/authSessionAuthorization.test.tsx | 3 testes de eventos de sessão, corrida inicial e falha de logout |
| scripts/permissions-security.test.mjs | Atualiza mock de useAuth para o contexto ampliado; mantém os testes anteriores |
| GOOGLE_AUTHORIZATION_REVIEW.md | Este relatório |

Alterações anteriores em Edge Functions e os demais scripts já existentes foram preservados, sem ampliação desta tarefa.
A integração gerada src/integrations/lovable/index.ts não foi alterada. ProtectedRoute, primeiro acesso, nova senha, recuperação, funções comerciais, RLS e esquema não foram modificados nesta tarefa.

## Testes executados
| Verificação | Resultado |
|---|---|
| Testes novos de React | 19/19 passaram |
| Suíte Vitest completa | 129/129 passaram, 26 arquivos; inclui os 19 novos |
| Scripts anteriores de segurança | 21/21 passaram com mocks |
| TypeScript — tsc --noEmit -p tsconfig.app.json | Passou após instalação completa |
| Build — vite build | Passou; aviso de chunks maiores que 500 kB |
| ESLint dos arquivos desta correção | Zero erros; um aviso de Fast Refresh no AuthContext |
| ESLint geral | Falhou: 390 erros e 61 avisos no conjunto do projeto; erros fora dos arquivos desta correção |
| git diff --check | Passou |

Os comandos foram executados pelos entrypoints Node locais: node node_modules/vitest/vitest.mjs run; node node_modules/typescript/bin/tsc --noEmit -p tsconfig.app.json; node node_modules/vite/bin/vite.js build; node node_modules/eslint/bin/eslint.js.
Scripts adicionais: node --test scripts/import-security.test.mjs scripts/permissions-security.test.mjs.

A primeira instalação com npm ci falhou porque package.json e package-lock.json já estavam inconsistentes. Para validar, foi usado npm install --package-lock=false --ignore-scripts, sem alterar manifestos/lockfiles. O SWC instalado inicialmente teve incompatibilidade com cache nativo do ambiente; foi utilizada localmente a versão 1.13.2 registrada no lockfile, com --no-save. As primeiras tentativas de Vitest/TypeScript antes da conclusão desse preparo não passaram; os resultados finais acima foram obtidos após o ajuste. Não foram atualizadas bibliotecas versionadas no repositório.

## Matriz solicitada
| Cenário | Evidência |
|---|---|
| Google com ativo=true | Teste React libera filhos após verified; teste do hook verifica consulta por ID e atividade |
| Sem registro | Mock nega, redireciona para /auth e solicita logout uma vez |
| Inativo, inclusive administrador | Hook nega antes de carregar papéis; teste React solicita logout |
| Erro de consulta/rede/RLS | Mock bloqueia e oferece nova tentativa, sem classificar como ausência |
| Logout falha | Mock mantém filhos bloqueados e informa falha |
| Conta existente com Google vinculado | Teste React cobre provider=email com providers incluindo google; nenhuma escrita de identidade adicionada |
| Módulo sem permissão | Regras preservadas; scripts anteriores continuam negando exceções individuais negativas |
| E-mail/senha | Teste preserva passagem de conta exclusivamente email; autenticação real pendente |
| Primeiro acesso/recuperação | Arquivos e rotas preservados por inspeção; fluxo real pendente |
| Troca obrigatória de senha | Teste do hook mantém mustChangePassword=true para usuário ativo; rota original preservada |
| Logout/relogin e troca de conta | Testes reais de React Query demonstram que nova versão/ID não reutiliza autorização anterior |
| Retorno OAuth por URL e sem recarga | Testes simulam sessão Google presente na montagem e transição de loading para verificado; integração externa real pendente |
| Resposta getSession atrasada | Teste confirma que não restaura sessão após evento de logout |

## Limites e riscos restantes
- Não foram usados usuários reais, tokens de produção, chamadas OAuth reais ou consultas ao Supabase real para estes testes.
- Validar no ambiente real ambos os retornos Lovable/Google, conta previamente vinculada, conta sem autorização, conta inativa, erro de rede, logout e recuperação/troca de senha.
- O logout encerra a sessão do CRM via Supabase; não desconecta a conta Google de outros sites no navegador.
- O gate impede montar o CRM durante uma sessão Google não autorizada, inclusive os carregamentos globais abaixo dele. Consultas anônimas anteriores ao login, requests já iniciados e caches de dados comerciais não foram redesenhados. Cache comercial compartilhado entre contas precisa de auditoria própria; esta mudança isola apenas autorização.
- A proteção contra chamadas diretas à API continua dependendo de RLS e autorização no backend. Nenhuma política foi presumida ou alterada.
- Conta com Google vinculado também é validada se entrar por senha. Usuários legítimos ativos mantêm o fluxo; contas sem autorização ficam bloqueadas.
- Não houve necessidade de alterar funcionalidades fora do escopo. A instalação local de dependências foi apenas preparação para validação.
