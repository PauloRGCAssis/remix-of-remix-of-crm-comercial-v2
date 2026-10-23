import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode } from 'react';
import { UsuarioPermissoesDialog } from '@/components/admin/UsuarioPermissoesDialog';
import { EditarUsuarioDialog, type UsuarioEdicao } from '@/components/admin/EditarUsuarioDialog';
import type { PermissionProfileRow } from '@/components/admin/PerfilFormDialog';

// Editor real de permissões individuais (e o formulário real "Editar usuário")
// com Supabase simulado: registra cada leitura/gravação com seus filtros.
type Perm = { modulo: string; acao: string; permitido: boolean };
type Op = { table: string; op: string; filtros: Record<string, unknown>; payload?: unknown };
const mocks = vi.hoisted(() => ({
  userPerms: [] as { modulo: string; acao: string; permitido: boolean }[],
  profilePerms: {} as Record<string, { modulo: string; acao: string; permitido: boolean }[]>,
  falhaGravacao: false,
  atraso: null as Promise<void> | null,
  ops: [] as { table: string; op: string; filtros: Record<string, unknown>; payload?: unknown }[],
  invoke: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock('sonner', () => ({ toast: mocks.toast }));
vi.mock('@/integrations/supabase/client', () => {
  function from(table: string) {
    const registro: Op = { table, op: 'select', filtros: {} };
    const resultado = () => {
      if (registro.op !== 'select') {
        mocks.ops.push(registro);
        return { data: null, error: mocks.falhaGravacao ? { message: 'falha simulada de gravação' } : null };
      }
      if (table === 'user_permissions') return { data: mocks.userPerms, error: null };
      if (table === 'profile_permissions') return { data: mocks.profilePerms[String(registro.filtros.profile_id)] ?? [], error: null };
      return { data: [], error: null };
    };
    const query = {
      select: () => query,
      eq: (coluna: string, valor: unknown) => { registro.filtros[coluna] = valor; return query; },
      delete: () => { registro.op = 'delete'; return query; },
      insert: (payload: unknown) => { registro.op = 'insert'; registro.payload = payload; return query; },
      upsert: (payload: unknown) => { registro.op = 'upsert'; registro.payload = payload; return query; },
      update: (payload: unknown) => { registro.op = 'update'; registro.payload = payload; return query; },
      then: (resolve: (v: unknown) => unknown) => {
        const espera = registro.op !== 'select' && mocks.atraso ? mocks.atraso : Promise.resolve();
        return espera.then(() => resultado()).then(resolve);
      },
    };
    return query;
  }
  return { supabase: { from, functions: { invoke: mocks.invoke } } };
});

// Polyfills do jsdom para menus/seleções do Radix.
Element.prototype.hasPointerCapture ??= () => false;
Element.prototype.releasePointerCapture ??= () => {};
Element.prototype.scrollIntoView ??= () => {};

const USUARIO = 'usuario-ficticio';
const permite = (modulo: string, acao = 'acessar'): Perm => ({ modulo, acao, permitido: true });
const bloqueia = (modulo: string, acao = 'acessar'): Perm => ({ modulo, acao, permitido: false });
const gravacoes = () => mocks.ops.filter((o) => o.table === 'user_permissions' || o.table === 'profile_permissions');

function comQuery(children: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
function abrirEditor(props: { perfilPendente?: boolean; isAdmin?: boolean; profileId?: string | null } = {}) {
  return render(
    comQuery(
      <UsuarioPermissoesDialog open onOpenChange={() => {}} userId={USUARIO} userNome="Fictício" profileId="perfil-a" {...props} />,
    ),
  );
}
// O editor renderiza ~150 menus; na suíte completa (paralela) o jsdom leva vários segundos.
const ESPERA = { timeout: 10000 };
vi.setConfig({ testTimeout: 20000 });
const celula = (rotulo: string) => screen.findByRole('button', { name: new RegExp(`^${rotulo}:`) }, ESPERA);
/** Espera os dados carregarem (célula habilitada) antes de abrir o menu. */
async function abrirMenu(rotulo: string) {
  const gatilho = await celula(rotulo);
  await waitFor(() => expect(gatilho).toBeEnabled(), ESPERA);
  fireEvent.keyDown(gatilho, { key: 'Enter' });
}
async function escolher(rotulo: string, opcao: RegExp) {
  await abrirMenu(rotulo);
  fireEvent.click(await screen.findByRole('menuitemradio', { name: opcao }));
}
async function esperaEstado(rotulo: string, estado: RegExp) {
  await waitFor(async () => expect(await celula(rotulo)).toHaveAccessibleName(estado), ESPERA);
}

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  mocks.userPerms = [];
  mocks.profilePerms = { 'perfil-a': [permite('prospeccao')], 'perfil-b': [] };
  mocks.falhaGravacao = false;
  mocks.atraso = null;
  mocks.ops = [];
  mocks.invoke.mockResolvedValue({ data: { ok: true }, error: null });
});

describe('editor de permissões individuais — estados exibidos', () => {
  it('mostra herança do perfil, liberação e bloqueio individuais de forma distinta', async () => {
    mocks.userPerms = [permite('importar'), bloqueia('metas')];
    abrirEditor();
    await esperaEstado('Prospecção — Acessar', /herda do perfil \(permitido\)/);
    await esperaEstado('Relatórios — Acessar', /herda do perfil \(negado\)/);
    await esperaEstado('Importar Planilha — Acessar', /liberado individualmente/);
    await esperaEstado('Metas Comerciais — Acessar', /bloqueado individualmente/);
  });
  it('permissões especiais usam os mesmos três estados', async () => {
    mocks.userPerms = [bloqueia('especial.exportar_excel')];
    abrirEditor();
    await esperaEstado('Exportar Excel', /bloqueado individualmente/);
    await esperaEstado('Exportar PDF', /herda do perfil \(negado\)/);
  });
  it('informa que as exceções são gravadas imediatamente', async () => {
    abrirEditor();
    expect(await screen.findByText('As exceções individuais são gravadas imediatamente.')).toBeInTheDocument();
  });
  it('avisa quando o usuário é administrador técnico', async () => {
    abrirEditor({ isAdmin: true });
    expect(await screen.findByText('Administrador técnico: acesso total, as exceções individuais não se aplicam.')).toBeInTheDocument();
  });
});

describe('editor de permissões individuais — gravação', () => {
  it('permitir grava somente a combinação deste usuário, sem tocar no perfil', async () => {
    abrirEditor();
    await escolher('Importar Planilha — Acessar', /Permitir individualmente/);
    await waitFor(() => expect(mocks.toast.success).toHaveBeenCalledTimes(1));
    const ops = gravacoes();
    expect(ops.every((o) => o.table === 'user_permissions')).toBe(true);
    expect(ops.find((o) => o.op === 'delete')?.filtros).toEqual({ user_id: USUARIO, modulo: 'importar', acao: 'acessar' });
    expect(ops.find((o) => o.op === 'insert')?.payload).toEqual({ user_id: USUARIO, modulo: 'importar', acao: 'acessar', permitido: true });
  });
  it('herdar remove somente a exceção correspondente', async () => {
    mocks.userPerms = [permite('importar'), permite('metas')];
    abrirEditor();
    await escolher('Importar Planilha — Acessar', /Herdar do perfil/);
    await waitFor(() => expect(mocks.toast.success).toHaveBeenCalledTimes(1));
    expect(gravacoes()).toEqual([
      { table: 'user_permissions', op: 'delete', filtros: { user_id: USUARIO, modulo: 'importar', acao: 'acessar' } },
    ]);
  });
  it('bloqueio individual fica indisponível até a estratégia de gravação ser aprovada', async () => {
    abrirEditor();
    await abrirMenu('Importar Planilha — Acessar');
    const bloquear = await screen.findByRole('menuitemradio', { name: /Bloquear individualmente/ });
    expect(bloquear).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(bloquear);
    expect(gravacoes()).toEqual([]);
  });
  it('falha de gravação exibe erro e não confirma sucesso', async () => {
    mocks.falhaGravacao = true;
    abrirEditor();
    await escolher('Importar Planilha — Acessar', /Permitir individualmente/);
    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalledWith('falha simulada de gravação'));
    expect(mocks.toast.success).not.toHaveBeenCalled();
  });
  it('controles ficam travados enquanto uma gravação está em andamento', async () => {
    let liberar: () => void = () => {};
    mocks.atraso = new Promise<void>((r) => { liberar = r; });
    abrirEditor();
    await escolher('Importar Planilha — Acessar', /Permitir individualmente/);
    await waitFor(async () => expect(await celula('Prospecção — Acessar')).toBeDisabled());
    liberar();
    await waitFor(() => expect(mocks.toast.success).toHaveBeenCalledTimes(1), ESPERA);
  });
});

describe('editor de permissões individuais — perfil pendente', () => {
  it('fica somente para consulta, com a prévia do perfil selecionado', async () => {
    mocks.userPerms = [permite('importar')];
    abrirEditor({ perfilPendente: true, profileId: 'perfil-b' });
    expect(await screen.findByText(/Prévia das permissões do perfil selecionado/)).toBeInTheDocument();
    expect(screen.getByText('Salve o usuário para editar as exceções com o novo perfil.')).toBeInTheDocument();
    // Exceção carregada: a célula está desabilitada pelo perfil pendente, não pelo carregamento.
    await esperaEstado('Importar Planilha — Acessar', /liberado individualmente/);
    await esperaEstado('Prospecção — Acessar', /herda do perfil \(negado\)/); // prévia do perfil-b
    const prospeccao = await celula('Prospecção — Acessar');
    expect(prospeccao).toBeDisabled();
    fireEvent.keyDown(prospeccao, { key: 'Enter' });
    expect(screen.queryByRole('menuitemradio')).not.toBeInTheDocument();
    expect(gravacoes()).toEqual([]);
  });
  it('menu aberto antes de o perfil ficar pendente não grava', async () => {
    const view = abrirEditor();
    await abrirMenu('Importar Planilha — Acessar');
    const permitir = await screen.findByRole('menuitemradio', { name: /Permitir individualmente/ });
    view.rerender(
      comQuery(<UsuarioPermissoesDialog open onOpenChange={() => {}} userId={USUARIO} profileId="perfil-b" perfilPendente />),
    );
    fireEvent.click(permitir);
    expect(gravacoes()).toEqual([]);
    expect(mocks.toast.success).not.toHaveBeenCalled();
  });
});

describe('Editar usuário + permissões individuais', () => {
  const perfil = (id: string, nome: string): PermissionProfileRow => ({
    id, nome, descricao: null, is_system: true, ativo: true, escopo_padrao: 'meus_dados',
  });
  const perfis = [perfil('perfil-a', 'Perfil Comercial A'), perfil('perfil-b', 'Perfil Comercial B')];
  const usuario: UsuarioEdicao = {
    id: USUARIO, nome: 'Fictício', email: 'ficticio@exemplo.invalid', vendedor: null, vendedores: [],
    profile_id: 'perfil-a', escopo: 'meus_dados', scope_id: null, vendedores_autorizados: [], ativo: true, admin: false,
  };
  const abrirFormulario = () =>
    render(
      comQuery(
        <EditarUsuarioDialog usuario={usuario} onOpenChange={() => {}} vendorNames={[]} permProfiles={perfis} escopos={[]} onSaved={() => {}} />,
      ),
    );
  async function trocarPerfil(nome: string) {
    const gatilho = screen.getAllByRole('combobox').find((el) => el.textContent?.includes('Perfil Comercial A'))!;
    fireEvent.keyDown(gatilho, { key: 'Enter' });
    fireEvent.click(await screen.findByRole('option', { name: nome }));
    await waitFor(() => expect(gatilho).toHaveTextContent(nome));
  }

  it('perfil trocado e não salvo: editor só consulta e cancelar não altera exceções', async () => {
    mocks.userPerms = [bloqueia('metas')];
    abrirFormulario();
    await trocarPerfil('Perfil Comercial B');
    fireEvent.click(screen.getByRole('button', { name: /Permissões individuais/ }));
    const editor = await screen.findByRole('dialog', { name: /Permissões individuais/ });
    expect(within(editor).getByText(/As alterações de perfil só terão efeito depois de salvar/)).toBeInTheDocument();
    await esperaEstado('Metas Comerciais — Acessar', /bloqueado individualmente/);
    expect(await within(editor).findByRole('button', { name: /^Metas Comerciais — Acessar:/ })).toBeDisabled();
    fireEvent.click(within(editor).getByRole('button', { name: 'Concluir' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(gravacoes()).toEqual([]);
    expect(mocks.invoke).not.toHaveBeenCalled();
  });
  it('perfil salvo: edição individual funciona normalmente', async () => {
    abrirFormulario();
    fireEvent.click(screen.getByRole('button', { name: /Permissões individuais/ }));
    const editor = await screen.findByRole('dialog', { name: /Permissões individuais/ });
    expect(within(editor).getByText('As exceções individuais são gravadas imediatamente.')).toBeInTheDocument();
    await escolher('Importar Planilha — Acessar', /Permitir individualmente/);
    await waitFor(() => expect(mocks.toast.success).toHaveBeenCalledTimes(1));
    expect(gravacoes().every((o) => (o.filtros.user_id ?? (o.payload as { user_id?: string })?.user_id) === USUARIO)).toBe(true);
  });
  it('salvar a troca de perfil não envia nem apaga exceções individuais', async () => {
    mocks.userPerms = [bloqueia('metas')];
    abrirFormulario();
    await trocarPerfil('Perfil Comercial B');
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledTimes(1));
    expect(mocks.invoke).toHaveBeenCalledWith('admin-users', { body: expect.objectContaining({ action: 'update', profile_id: 'perfil-b' }) });
    expect(gravacoes()).toEqual([]);
  });
});
