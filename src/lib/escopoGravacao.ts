import { supabase } from "@/integrations/supabase/client";
import { ForaDoEscopoError, type VendorScope } from "@/hooks/useVendorScope";

type TabelaComVendedor =
  | "client_profiles"
  | "bonificacao_cadastro"
  | "commercial_actions"
  | "degustacoes"
  | "order_schedule_clients";

/**
 * Confere, antes de gravar, se os registros alvo e o vendedor novo estão na
 * carteira do login. O vendedor ATUAL é lido do banco (não do cache da tela):
 * registro que o login não consegue ler conta como fora do escopo.
 *
 * `campoCliente` + `podeVerRegistro`: módulos com registros legados sem
 * vendedor (Ações, Degustações, Agenda de Pedidos) usam a mesma regra da
 * listagem (`useClientScope.podeVerRegistro`).
 * Sem restrição alguma (empresa), não há leitura extra.
 */
export async function exigirEscopoRegistros(
  scope: Pick<VendorScope, "todos" | "semRestricao" | "exigirEscopo">,
  descricao: string,
  alvo: {
    tabela?: TabelaComVendedor;
    ids?: Array<string | number>;
    novosVendedores?: Array<string | null | undefined>;
    campoCliente?: "cliente" | "nome";
    podeVerRegistro?: (vendedor: string | null, cliente: string | null) => boolean;
  },
): Promise<void> {
  if (scope.semRestricao) return;
  const novos = alvo.novosVendedores ?? [];
  const ids = Array.from(new Set((alvo.ids ?? []).filter((id) => id !== undefined && id !== null && id !== "")));
  let atuais: Array<string | null> = [];
  if (alvo.tabela && ids.length) {
    const colunas = alvo.campoCliente ? `id, vendedor, ${alvo.campoCliente}` : "id, vendedor";
    const { data, error } = await supabase.from(alvo.tabela).select(colunas).in("id", ids as string[]);
    if (error) throw error;
    const linhas = (data ?? []) as unknown as Array<Record<string, string | number | null>>;
    if (linhas.length < ids.length) throw new ForaDoEscopoError(descricao);
    if (alvo.podeVerRegistro && alvo.campoCliente) {
      const ver = alvo.podeVerRegistro;
      const campo = alvo.campoCliente;
      if (linhas.some((l) => !ver((l.vendedor as string | null) ?? null, (l[campo] as string | null) ?? null))) {
        throw new ForaDoEscopoError(descricao);
      }
    }
    atuais = linhas.map((l) => (l.vendedor as string | null) ?? null);
  }
  scope.exigirEscopo([...atuais, ...novos], descricao);
}
