import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';

// Handler real de admin-users com cliente Supabase simulado: somente o
// Administrador ativo (has_role admin) pode alterar usuários e roles.
const source = stripTypeScriptTypes(readFileSync(new URL('../supabase/functions/admin-users/index.ts', import.meta.url), 'utf8').replace(/^import .*;\r?\n/gm, ''));
const ADMIN_WRITES = ['user_roles', 'user_access', 'user_permissions', 'profiles'];
for (const scenario of [
  { name: 'sem autenticação', token: false, status: 401 },
  { name: 'token inválido', invalid: true, status: 401 },
  { name: 'gestor ativo sem role admin tenta promover usuário', status: 403 },
  { name: 'perfil Administrador sem role admin', status: 403 },
  { name: 'administrador inativo', admin: true, inactive: true, status: 403 },
  { name: 'usuário sem cadastro de acesso', admin: true, missing: true, status: 403 },
  { name: 'falha ao consultar acesso', admin: true, accessFailure: true, status: 503 },
  { name: 'falha ao consultar role', roleFailure: true, status: 503 },
  { name: 'administrador ativo', admin: true, status: 200 },
]) {
  test(scenario.name, async () => {
    let handler;
    const writes = [];
    const query = (table) => {
      const result = table === 'user_access'
        ? { data: scenario.missing ? null : { ativo: !scenario.inactive }, error: scenario.accessFailure ? {} : null }
        : { data: null, error: null };
      const write = (op) => () => { writes.push(`${table}:${op}`); return q; };
      const q = {
        select() { return q; }, eq() { return q; },
        insert: write('insert'), upsert: write('upsert'), update: write('update'), delete: write('delete'),
        maybeSingle: async () => result,
        then(resolve) { return Promise.resolve(result).then(resolve); },
      };
      return q;
    };
    const client = {
      auth: {
        getUser: async () => ({ data: { user: scenario.invalid ? null : { id: 'chamador-ficticio' } }, error: null }),
        admin: { updateUserById: async () => { writes.push('auth:update'); return { error: null }; } },
      },
      rpc: async (name, args) => {
        assert.equal(name, 'has_role');
        assert.equal(args._user_id, 'chamador-ficticio');
        assert.equal(args._role, 'admin');
        return { data: scenario.roleFailure ? null : !!scenario.admin, error: scenario.roleFailure ? {} : null };
      },
      from: query,
    };
    vm.runInNewContext(source, { createClient: () => client, Deno: { env: { get: () => 'test' }, serve(callback) { handler = callback; } }, Response, crypto, console });
    const response = await handler(new Request('https://example.invalid', {
      method: 'POST',
      headers: scenario.token === false ? {} : { Authorization: 'Bearer ficticio' },
      body: JSON.stringify({ action: 'update', user_id: 'alvo-ficticio', nome: 'Alvo', email: 'alvo@exemplo.invalid', profile_id: 'perfil-novo', admin: true }),
    }));
    assert.equal(response.status, scenario.status);
    const adminWrites = writes.filter((w) => w === 'auth:update' || ADMIN_WRITES.some((t) => w.startsWith(`${t}:`)));
    if (scenario.status === 200) {
      assert.ok(adminWrites.includes('user_roles:upsert'), 'administrador ativo concede a role solicitada');
      assert.ok(adminWrites.includes('user_access:upsert'), 'troca de perfil gravada em user_access');
      assert.ok(!adminWrites.some((w) => w.startsWith('user_permissions:')), 'troca de perfil preserva exceções individuais');
    }
    else assert.deepEqual(adminWrites, [], 'nenhuma alteração de usuário ou role antes da autorização');
  });
}
