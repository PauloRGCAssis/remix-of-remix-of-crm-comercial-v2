import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import VendedoresPage from '@/pages/VendedoresPage';
import { EditarUsuarioDialog, type UsuarioEdicao } from '@/components/admin/EditarUsuarioDialog';
import type { PermissionProfileRow } from '@/components/admin/PerfilFormDialog';

// Página Vendedores real (abas) e formulário real "Editar usuário".
// Componentes de dados das abas são substituídos por marcadores (dados fictícios).
const mocks = vi.hoisted(() => ({
  role: { isAdmin: false },
  montouUsuariosAcesso: vi.fn(),
  invoke: vi.fn(),
}));

vi.mock('@/hooks/useUserRole', async (original) => ({
  ...(await original<typeof import('@/hooks/useUserRole')>()),
  useUserRole: () => mocks.role,
}));
vi.mock('@/hooks/useSalesData', async (original) => ({
  ...(await original<typeof import('@/hooks/useSalesData')>()),
  useSalesData: () => ({
    isLoading: false,
    data: [{ data: '2026-02-10', cliente: 'CLIENTE FICTÍCIO', vendedor: 'VENDEDOR A', quantidade: 10, preco_total: 100 }],
  }),
}));
vi.mock('@/components/AppLayout', () => ({ AppLayout: ({ children }: { children: JSX.Element }) => <main>{children}</main> }));
vi.mock('@/components/vendedores/UsuariosAcessoTab', () => ({
  UsuariosAcessoTab: () => {
    mocks.montouUsuariosAcesso();
    return <p>controles de roles</p>;
  },
}));
vi.mock('@/components/vendedores/VendorsManagementTab', () => ({ VendorsManagementTab: () => <p>cadastro de vendedores</p> }));
vi.mock('@/components/vendedores/ClassificacaoClientesSettings', () => ({ ClassificacaoClientesSettings: () => <p>configurações comerciais</p> }));
vi.mock('@/components/admin/UsuarioPermissoesDialog', () => ({ UsuarioPermissoesDialog: () => null }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: mocks.invoke } } }));

const ABA_SALVA = 'ti-delso:persistent-ui:vendedores:activeTab';

// O gráfico (recharts) usa ResizeObserver, ausente no jsdom.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// localStorage em memória: independe do Web Storage nativo do Node 25+, que encobre o do jsdom.
const armazenamento = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => armazenamento.get(k) ?? null,
  setItem: (k: string, v: string) => void armazenamento.set(k, String(v)),
  removeItem: (k: string) => void armazenamento.delete(k),
  clear: () => armazenamento.clear(),
});

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  mocks.role.isAdmin = false;
  window.localStorage.removeItem(ABA_SALVA);
  mocks.invoke.mockResolvedValue({ data: { ok: true }, error: null });
});

describe('página Vendedores — aba "Usuários e acesso"', () => {
  it('gestor acessa Vendedores sem montar controles administrativos', () => {
    render(<VendedoresPage />);
    expect(screen.getByRole('tab', { name: 'Desempenho' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Cadastro' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Configurações' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Usuários e acesso' })).not.toBeInTheDocument();
    expect(mocks.montouUsuariosAcesso).not.toHaveBeenCalled();
  });
  it('aba "usuarios" salva no navegador não monta os controles para o gestor', () => {
    window.localStorage.setItem(ABA_SALVA, JSON.stringify('usuarios'));
    render(<VendedoresPage />);
    expect(screen.getByRole('tab', { name: 'Desempenho' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByText('controles de roles')).not.toBeInTheDocument();
    expect(mocks.montouUsuariosAcesso).not.toHaveBeenCalled();
  });
  it('gestor continua usando Cadastro e Configurações', () => {
    render(<VendedoresPage />);
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Cadastro' }));
    expect(screen.getByText('cadastro de vendedores')).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Configurações' }));
    expect(screen.getByText('configurações comerciais')).toBeInTheDocument();
    expect(mocks.montouUsuariosAcesso).not.toHaveBeenCalled();
  });
  it('administrador continua acessando "Usuários e acesso"', () => {
    mocks.role.isAdmin = true;
    render(<VendedoresPage />);
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Usuários e acesso' }));
    expect(screen.getByText('controles de roles')).toBeInTheDocument();
    expect(mocks.montouUsuariosAcesso).toHaveBeenCalled();
  });
});

describe('Editar usuário — divergência entre perfil e role', () => {
  const perfil = (id: string, nome: string): PermissionProfileRow => ({
    id, nome, descricao: null, is_system: true, ativo: true, escopo_padrao: 'meus_dados',
  });
  const perfis = [perfil('p-admin', 'Administrador'), perfil('p-gestor', 'Gestor')];
  const usuario = (patch: Partial<UsuarioEdicao>): UsuarioEdicao => ({
    id: 'usuario-ficticio', nome: 'Usuário Fictício', email: 'ficticio@exemplo.invalid', vendedor: null,
    vendedores: [], profile_id: 'p-admin', escopo: 'meus_dados', scope_id: null,
    vendedores_autorizados: [], ativo: true, admin: false, ...patch,
  });
  const abrir = (u: UsuarioEdicao) =>
    render(
      <EditarUsuarioDialog usuario={u} onOpenChange={() => {}} vendorNames={[]} permProfiles={perfis} escopos={[]} onSaved={() => {}} />,
    );
  const AVISO = /não concede acesso administrativo/;

  it('avisa quando o perfil é Administrador e a role está desligada', () => {
    abrir(usuario({}));
    expect(screen.getByRole('note')).toHaveTextContent(AVISO);
  });
  it('não avisa quando a role administrativa está ligada', () => {
    abrir(usuario({ admin: true }));
    expect(screen.queryByText(AVISO)).not.toBeInTheDocument();
  });
  it('não avisa para outros perfis', () => {
    abrir(usuario({ profile_id: 'p-gestor' }));
    expect(screen.queryByText(AVISO)).not.toBeInTheDocument();
  });
  it('aviso não bloqueia o salvamento nem sincroniza a role automaticamente', async () => {
    abrir(usuario({}));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledTimes(1));
    expect(mocks.invoke).toHaveBeenCalledWith('admin-users', {
      body: expect.objectContaining({ action: 'update', profile_id: 'p-admin', admin: false }),
    });
  });
});
