import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { normalizeVendorName, sameVendor } from "@/hooks/useUserRole";
import { normalizeClientName } from "@/lib/clientNameNormalization";

/**
 * Camada GLOBAL de escopo de vendedor.
 *
 * Fonte única de verdade para "quais vendedores este login pode acessar?".
 * Todas as telas (filtros, listagens, cadastros, edição, exclusão e relatórios)
 * devem consultar este hook em vez de criar regra própria.
 *
 * A lista vem exatamente do que o administrador configurou em
 * Administração → Usuários (vendedores vinculados + escopo do perfil +
 * escopo de dados personalizado). O banco aplica a mesma regra via
 * `pode_ver_vendedor`, então a tela é apenas a primeira camada.
 *
 * Regras de escopo:
 * - `meus_dados`: vendedores vinculados ao login (sem vínculo = nada);
 * - `vendedores_selecionados`: vinculados + autorizados + do escopo personalizado;
 * - `empresa` / Administrador: todos os vendedores.
 * O escopo personalizado pode ainda restringir CLIENTES (lista de clientes
 * ∪ clientes cujas fichas estão nas regiões listadas). Grupos econômicos
 * ainda não têm vínculo no banco e, se usados, bloqueiam dados de clientes.
 * A restrição de clientes se soma (E) à de vendedores.
 */
/** Chave de comparação de cliente: nome normalizado, sem caixa nem acentos. */
export function chaveCliente(nome?: string | null): string {
  return nome ? normalizeVendorName(normalizeClientName(nome)) : "";
}

export class ForaDoEscopoError extends Error {
  constructor(descricao: string) {
    super(`Registro fora da sua carteira: não é possível gravar ${descricao}.`);
    this.name = "ForaDoEscopoError";
  }
}

export interface VendorScope {
  loading: boolean;
  /** Usuário enxerga todos os vendedores (pode ainda haver restrição de clientes). */
  todos: boolean;
  /** Nenhuma restrição: nem de vendedor, nem de cliente. */
  semRestricao: boolean;
  /** Vendedores autorizados (vazio quando `todos` = true). */
  vendedores: string[];
  /** Preenchimento automático quando há exatamente um vendedor autorizado. */
  vendedorPadrao: string | null;
  /** Filtro travado: só existe uma opção possível. */
  travado: boolean;
  /** O login pode ver/editar/excluir registros deste vendedor? */
  podeVer: (vendedor?: string | null) => boolean;
  /** O escopo personalizado permite este cliente (por nome normalizado)? */
  podeVerCliente: (cliente?: string | null) => boolean;
  /** Restringe uma lista de opções de vendedor às autorizadas. */
  opcoesVendedor: (todosOsVendedores: string[]) => string[];
  /**
   * Filtra pelo vendedor do registro e, quando informado `getCliente`, pela
   * restrição de clientes do escopo personalizado.
   */
  filtrar: <T>(
    rows: T[],
    getVendedor: (row: T) => string | null | undefined,
    getCliente?: (row: T) => string | null | undefined,
  ) => T[];
  /**
   * Barra gravações fora da carteira: cada vendedor informado (atual do
   * registro ou novo) precisa estar no escopo. `null` = registro sem vendedor.
   */
  exigirEscopo: (vendedores: Array<string | null | undefined>, descricao: string) => void;
}

export function useVendorScope(): VendorScope {
  const perms = usePermissions();
  const permitidos = perms.vendedoresPermitidos;
  const todos = permitidos === null;

  const vendedores = useMemo(
    () => (todos ? [] : Array.from(new Set((permitidos ?? []).filter(Boolean)))),
    [todos, permitidos],
  );

  // Clientes das regiões do escopo personalizado (campo `regiao` da ficha).
  const regioes = perms.regioesPermitidas;
  const regioesQuery = useQuery({
    queryKey: ["escopo-regioes", [...(regioes ?? [])].sort()],
    enabled: !!regioes?.length,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_profiles")
        .select("nome, nome_fantasia")
        .in("regiao", regioes ?? []);
      if (error) throw error;
      return (data ?? []) as { nome: string | null; nome_fantasia: string | null }[];
    },
  });

  const clientesPermitidos = perms.clientesPermitidos;
  const gruposBloqueiam = perms.gruposBloqueiam;
  const restricaoClientes = useMemo(() => {
    if (!clientesPermitidos && !regioes && !gruposBloqueiam) return null;
    const nomes = new Set<string>();
    for (const c of clientesPermitidos ?? []) nomes.add(chaveCliente(c));
    // Enquanto as regiões carregam (ou se falharem), nada a mais é liberado.
    for (const p of regioesQuery.data ?? []) {
      if (p.nome) nomes.add(chaveCliente(p.nome));
      if (p.nome_fantasia) nomes.add(chaveCliente(p.nome_fantasia));
    }
    return { bloqueado: gruposBloqueiam, nomes };
  }, [clientesPermitidos, regioes, gruposBloqueiam, regioesQuery.data]);

  const podeVer = useCallback(
    (vendedor?: string | null) => {
      if (todos) return true;
      if (!vendedor) return false;
      const alvo = normalizeVendorName(vendedor);
      return vendedores.some((v) => normalizeVendorName(v) === alvo || sameVendor(v, alvo));
    },
    [todos, vendedores],
  );

  const podeVerCliente = useCallback(
    (cliente?: string | null) => {
      if (!restricaoClientes) return true;
      if (restricaoClientes.bloqueado || !cliente) return false;
      return restricaoClientes.nomes.has(chaveCliente(cliente));
    },
    [restricaoClientes],
  );

  const opcoesVendedor = useCallback(
    (lista: string[]) => {
      if (todos) return lista;
      return lista.filter((v) => podeVer(v));
    },
    [todos, podeVer],
  );

  const filtrar = useCallback(
    <T,>(
      rows: T[],
      getVendedor: (row: T) => string | null | undefined,
      getCliente?: (row: T) => string | null | undefined,
    ) => {
      let out = todos ? rows : rows.filter((r) => podeVer(getVendedor(r)));
      if (getCliente && restricaoClientes) out = out.filter((r) => podeVerCliente(getCliente(r)));
      return out;
    },
    [todos, podeVer, podeVerCliente, restricaoClientes],
  );

  const exigirEscopo = useCallback(
    (lista: Array<string | null | undefined>, descricao: string) => {
      if (todos) return;
      // Registro sem vendedor (legado) não é barrado aqui; atribuir a outro vendedor é.
      if (lista.some((v) => !!v && !podeVer(v))) throw new ForaDoEscopoError(descricao);
    },
    [todos, podeVer],
  );

  return useMemo(() => ({
    loading: perms.loading,
    todos,
    semRestricao: todos && !restricaoClientes,
    vendedores,
    vendedorPadrao: !todos && vendedores.length === 1 ? vendedores[0] : null,
    travado: !todos && vendedores.length <= 1,
    podeVer,
    podeVerCliente,
    opcoesVendedor,
    filtrar,
    exigirEscopo,
  }), [perms.loading, todos, restricaoClientes, vendedores, podeVer, podeVerCliente, opcoesVendedor, filtrar, exigirEscopo]);
}

/** Chave estável para uso em `queryKey` (evita cache cruzado entre logins). */
export function vendorScopeKey(scope: VendorScope): string {
  return scope.todos ? "all" : scope.vendedores.map(normalizeVendorName).sort().join("|") || "none";
}
