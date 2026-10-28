# Correções de segurança — entrega parcial para revisão

## Situação em 28/10/2026 (leia isto primeiro)

O relatório abaixo, de 23/10/2026, foi a primeira rodada da revisão. Desde então:

**Resolvido**
- Suíte de testes e build passaram a rodar: Vitest 325/325, testes estáticos 31/31 (permissões, admin-users, import-sales) e build ok. CI do GitHub (`.github/workflows/auditoria-ti-delso.yml`) roda os três scripts estáticos.
- Teste da importação (`scripts/import-security.test.mjs`) atualizado: falha na consulta de acesso agora é negada com 503 (antes o teste esperava 403; ambos negam).
- Problema 1 — contrato de permissões (commit `349bc06`): acessar/visualizar, sub-abas da Inteligência, perfil inativo bloqueia, IA autorizada pela matriz e não pelo nome do perfil (tela e função `central-analise`).
- Problema 3 — gravação da Prospecção/Agenda (commit `2792ddc`): grava só o que mudou, com conferência de versão; recusa do banco aparece e é desfeita; exclusões chegam ao banco; nada é gravado para outro usuário.
- Problema 5 — escopo de vendedores e clientes, parte da tela (commit `5bbd8d0`): filtro pela coluna `vendedor`, escopo personalizado por clientes/regiões, conferência de carteira antes de gravar, releitura do escopo a cada 5 min.

**Ainda pendente (continua valendo o que está abaixo)**
- Regras do banco (RLS), funções SECURITY DEFINER e grants: nunca verificadas. Aguardando o resultado de `scripts/inspect-security.sql` (somente leitura) para preparar migrations. Até lá, o isolamento entre vendedores é só no navegador.
- Primeiro acesso por código (OTP): template de e-mail, SMTP e ativação atômica ainda não validados.
- Testes A/B/gestor/admin direto na API, em homologação.

---

Branch local: fix/seguranca-rls-permissoes. Nenhum push, merge, deploy ou acesso ao banco de produção foi realizado.

## Achados e alterações
| Arquivo | Achado estático anterior | Gravidade | Alteração |
|---|---|---|---|
| src/hooks/usePermissions.ts:123 | Ausência de acesso assumia atividade; admin passava antes da checagem; erro de escopo permitia fallback | Alta | Atividade exige sessão e consultas bem-sucedidas; escopo ausente/inativo causa erro; listas negadas vazias; exceções individuais preservadas |
| src/hooks/useUserRole.ts:46 | Papel admin não verificava atividade | Alta | Consulta user_access e expõe verified; erros não reutilizam autorização administrativa do cache |
| src/components/ProtectedRoute.tsx:48 | Administrador dispensado da atividade | Alta | Conta ativa obrigatória; auditoria de página só após autorização |
| supabase/functions/import-sales/index.ts:152 | Handler não verificava solicitante antes das operações administrativas | Crítica | Validação Auth, atividade, papel e permissão especial.importar_dados/acessar, com exceção individual prevalecendo sobre perfil para não administradores |
| supabase/functions/ativar-acesso/index.ts:47 | Conhecer e-mail de conta liberada permitia definir senha | Crítica | Exige OTP de e-mail consumido pelo Supabase Auth e identidade correspondente ao cadastro |
| src/pages/PrimeiroAcessoPage.tsx | Não solicitava prova de controle do e-mail | Crítica | Solicitação de código sem criação de conta e envio do código junto à ativação |
| supabase/functions/admin-users/index.ts:41 | Dependia de has_role sem checagem explícita de atividade | Alta, definição SQL desconhecida | Verificação explícita de conta ativa antes das ações |
| supabase/functions/central-analise/index.ts:258 | Papel admin dispensava conta ativa | Alta | Verificação de atividade também para admin |

Reprodução anterior: leitura estática dos ramos do código da main. Não foram executados ataques contra serviços reais. As linhas indicam a versão modificada; comparar com git diff para localizar o comportamento anterior.

## Evidências
| Teste | Antes | Depois | Tipo |
|---|---|---|---|
| Importação: sem token, token inválido, sem acesso, inativo, admin inativo, falha de consulta e ausência de permissão | Não executado; ausência de validação constatada no código | 11 cenários passaram, incluindo permissões individuais e herdadas | Handler real com cliente Supabase simulado |
| Permissões: sessão ausente, acesso ausente, inatividade, erro com cache, carregamento, papel não verificado, perfil, exceção e admin ativo | Não executado; ramos permissivos constatados no código | 10 cenários passaram; cinco ações por cenário | Hook real com dependências simuladas; não testa ciclo de vida React |
| git diff --check | Não aplicável | Passou | Verificação estática |
| Build e suíte Vitest existente | Não executado | Pendente: dependências não instaladas | Não aprovado |
| OTP, admin-users e central-analise | Não executado | Pendente de testes adicionais | Não aprovado |
| SELECT/INSERT/UPDATE/DELETE reais e autopromoção | Não executado | Pendente de homologação | RLS não validada |

Comandos locais: node --test scripts/import-security.test.mjs scripts/permissions-security.test.mjs; git diff --check. Requer Node com stripTypeScriptTypes (executado com Node 24).

## Banco: inventário e dependências
A árvore recebida não contém migrations ou definições reais de políticas. Não foi possível determinar grants, RLS ou funções SECURITY DEFINER. scripts/inspect-security.sql é somente leitura e coleta catálogos de tabelas, políticas, grants, funções e triggers, sem selecionar registros de negócio.

Superfícies confirmadas:
- crm_leads e crm_visitas: leitura ampla e insert/update por crmCloudSync; conteúdo em payload exige inspeção das chaves de propriedade e triggers.
- sales_raw_rows e client_aliases: consultas em useSalesData; a função de importação usa privilégios administrativos sobre vendas.
- bonificacao_cadastro, bonificacao_rows e bonificacao_vinculos: leitura e alterações diretas.
- profiles, user_roles, user_access, permission_profiles, profile_permissions, user_permissions e data_scopes: superfície de administração que depende de RLS para impedir autopromoção e ampliação de escopo.
- Filtros no navegador continuam presentes. Eles não provam que outros registros não chegaram ao navegador.
- has_role, tem_permissao, pode_ver_vendedor e demais RPCs precisam de definição real, search_path, grants EXECUTE, checagem de auth.uid e análise de todos os caminhos de chamada.

Não foi criada migration executável baseada em schema presumido. Após a inspeção, preparar migrations específicas para:
1. Negar usuários sem user_access ativo em cada operação exposta.
2. Aplicar USING e WITH CHECK conforme permissões e escopos reais.
3. Impedir alteração de proprietário/vendedor e campos administrativos por usuários comuns, incluindo payloads e RPCs.
4. Restringir funções SECURITY DEFINER, parâmetros de identidade arbitrários e execução pública.
5. Validar políticas combinadas: políticas permissivas existentes podem ampliar acesso.
6. Testar diretamente APIs com usuários fictícios A/B, gestor e admin em homologação, incluindo as quatro operações e autopromoção.

## Primeiro acesso: requisitos antes de publicar
O código OTP é uma proposta local ainda não pronta para publicação. Configurar no template de e-mail do Supabase o código {{ .Token }}, SMTP, entrega, expiração e limites de envio/verificação. O fluxo não depende de redirecionamento. Confirmar comportamento real do tipo email em verifyOtp, reenvio, expiração, repetição e contas já ativadas.
A atualização de senha Auth e do marcador profiles.senha_definida continua em operações separadas. É necessário definir uma reserva atômica/serialização de ativação baseada no schema real para impedir corridas entre códigos válidos e recuperar falhas parciais. A alteração não resolve essa dependência de banco. Não publicar antes dessa validação.
As mensagens distintas de conta após a prova de e-mail permanecem; a solicitação inicial usa resposta genérica. Validar limitação de abuso no Supabase.

## Impactos
Contas legadas sem user_access ativo passam a ser bloqueadas, inclusive administradores. Corrigir cadastros autorizados por procedimento administrativo revisado. Falhas de consultas negam acesso; escopos referenciados ausentes/inativos não ampliam permissões. Importadores comuns precisam da permissão especial correspondente. Não foi alterada a lógica comercial de deduplicação e sincronização.

## Implantação e rollback propostos
1. Concluir testes e build com dependências do lockfile; revisar o diff.
2. Obter catálogos SQL somente leitura e backup verificável do banco e configurações Auth.
3. Preparar/revisar migrations e reversões específicas; aplicar exclusivamente em homologação.
4. Configurar e testar e-mail/OTP e ativação atômica; executar matriz completa de API/RLS.
5. Obter autorização explícita para push e implantação.
6. Implantar banco e funções compatíveis antes da interface; monitorar 401/403, falhas de consulta e importações sem registrar segredos.
7. Em regressão, reverter para versão segura compatível, preservando dados e bloqueando temporariamente ativação/importação vulneráveis; não restaurar o fluxo inseguro como rollback automático.

Esta entrega não conclui os critérios de segurança. Faltam testes de integração, build, RLS real, migrations fundamentadas no catálogo e conclusão segura da ativação.
