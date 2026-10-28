import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';

const source = stripTypeScriptTypes(readFileSync(new URL('../supabase/functions/import-sales/index.ts', import.meta.url), 'utf8').replace(/^import .*;\r?\n/gm, ''));
for (const scenario of [
  { name: 'sem autenticação', token: false, status: 401 },
  { name: 'token inválido', invalid: true, status: 401 },
  { name: 'sem user_access', missing: true, status: 403 },
  { name: 'inativo', inactive: true, status: 403 },
  { name: 'administrador inativo', inactive: true, admin: true, status: 403 },
  { name: 'sem permissão', status: 403 },
  { name: 'exceção individual nega perfil', individual: false, inherited: true, status: 403 },
  { name: 'exceção individual permite', individual: true, status: 400 },
  { name: 'perfil permite', inherited: true, status: 400 },
  { name: 'administrador ativo', admin: true, status: 400 },
  // Falha ao consultar o acesso: nega com 503 (serviço indisponível), nunca libera.
  { name: 'falha na consulta', failure: true, status: 503 },
]) {
  test(scenario.name, async () => {
    let handler;
    const client = {
      auth: { getUser: async () => ({ data: { user: scenario.invalid ? null : { id: 'fictitious' } }, error: null }) },
      from(table) {
        assert.notEqual(table, 'sales_raw_rows', 'nenhuma operação comercial antes da validação');
        const result = table === 'user_access'
          ? { data: scenario.missing ? null : { ativo: !scenario.inactive, profile_id: 'profile' }, error: scenario.failure ? {} : null }
          : table === 'user_roles'
          ? { data: scenario.admin ? [{ role: 'admin' }] : [], error: null }
          : { data: (table === 'user_permissions' ? scenario.individual : scenario.inherited) === undefined ? null : { permitido: table === 'user_permissions' ? scenario.individual : scenario.inherited }, error: null };
        const query = { select() { return query; }, eq() { return query; }, maybeSingle: async () => result, then(resolve) { return Promise.resolve(result).then(resolve); } };
        return query;
      },
    };
    vm.runInNewContext(source, { createClient: () => client, Deno: { env: { get: () => 'test' }, serve(callback) { handler = callback; } }, Response, console });
    const response = await handler(new Request('https://example.invalid', { method: 'POST', headers: scenario.token === false ? {} : { Authorization: 'Bearer fictitious' }, body: JSON.stringify({ rows: [] }) }));
    assert.equal(response.status, scenario.status);
  });
}
