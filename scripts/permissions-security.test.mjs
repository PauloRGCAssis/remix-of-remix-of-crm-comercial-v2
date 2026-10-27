import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';

const source = stripTypeScriptTypes(readFileSync(new URL('../src/hooks/usePermissions.ts', import.meta.url), 'utf8').replace(/^import .*;\r?\n/gm, '').replace(/export /g, ''));
for (const scenario of [
  { name: 'sem sessão', session: false, allowed: false },
  { name: 'sem acesso', missing: true, allowed: false },
  { name: 'conta inativa', inactive: true, allowed: false },
  { name: 'admin inativo', inactive: true, admin: true, allowed: false },
  { name: 'erro com cache anterior', error: true, admin: true, allowed: false },
  { name: 'carregando', loading: true, allowed: false },
  { name: 'papel não verificado', verified: false, allowed: false },
  { name: 'perfil autorizado', allowed: true },
  { name: 'exceção individual negativa', override: false, allowed: false },
  { name: 'admin ativo', admin: true, allowed: true },
]) {
  test(scenario.name, () => {
    const context = {
      useAuth: () => ({ authorizationVersion: 1 }),
      useCallback: (callback) => callback,
      useMemo: (factory) => factory(),
      useUserRole: () => ({ userId: scenario.session === false ? null : 'test', isGestor: !!scenario.admin, vendedor: 'A', vendedores: ['A'], loading: !!scenario.loading, verified: scenario.verified !== false }),
      useQuery: () => ({ isSuccess: !scenario.error, isLoading: !!scenario.loading, data: { access: scenario.missing ? null : { ativo: !scenario.inactive, escopo: 'meus_dados' }, profilePerms: ['acessar', 'visualizar', 'criar', 'editar', 'excluir'].map(acao => ({ modulo: 'prospeccao', acao, permitido: true })), userPerms: scenario.override === false ? ['acessar', 'visualizar', 'criar', 'editar', 'excluir'].map(acao => ({ modulo: 'prospeccao', acao, permitido: false })) : [] } }),
      normalizeVendorName: (value) => value,
      sameVendor: (left, right) => left === right,
    };
    vm.createContext(context);
    vm.runInContext(source + '\n globalThis.result = usePermissions();', context);
    for (const action of ['acessar', 'visualizar', 'criar', 'editar', 'excluir']) assert.equal(context.result.can('prospeccao', action), scenario.allowed);
    if (!context.result.ativo) {
      assert.equal(context.result.canSee('A'), false);
      assert.equal(context.result.podeUsarIA, false);
    }
    if (context.result.ativo && !scenario.admin) assert.equal(context.result.canSee('B'), false);
  });
}

test('central-analise autoriza pela matriz, nunca pelo nome do perfil', () => {
  const edge = readFileSync(new URL('../supabase/functions/central-analise/index.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(edge, /perfil\s*===\s*["'](administrador|gestor)["']/i);
  assert.doesNotMatch(edge, /permission_profiles\(nome\)/);
  assert.match(edge, /"inteligencia", "inteligencia\.central_analise"/);
  assert.match(edge, /permission_profiles\(ativo\)/);
  assert.match(edge, /modulos\.every\(efetiva\)/);
});
