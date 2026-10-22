import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  aplicarSincronizacao,
  planejarSincronizacao,
  type CampoCadastral,
  type DadosCadastraisInput,
  type OrigemSincronizacao,
  type PlanoSincronizacao,
  type ResolucaoConflito,
} from "@/lib/clientCentralRegistry";

/**
 * Regra central do CRM: "cadastre uma vez, use em todo o CRM".
 * Qualquer tela pode chamar `sincronizar` depois de salvar seu registro.
 */
export function useCadastroCentralSync() {
  const qc = useQueryClient();
  const [plano, setPlano] = useState<PlanoSincronizacao | null>(null);
  const [origem, setOrigem] = useState<OrigemSincronizacao | null>(null);
  const [open, setOpen] = useState(false);

  const invalidar = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["client_profiles"] });
    qc.invalidateQueries({ queryKey: ["client_directory"] });
    qc.invalidateQueries({ queryKey: ["client_address_staging"] });
  }, [qc]);

  const executar = useCallback(
    async (
      p: PlanoSincronizacao,
      o: OrigemSincronizacao,
      resolucoes: Partial<Record<CampoCadastral, ResolucaoConflito>>,
    ) => {
      try {
        const r = await aplicarSincronizacao(p, resolucoes, o);
        invalidar();
        if (r.fichaCriada) {
          toast.success(`Cadastro de ${p.cliente} criado com os dados informados.`);
        } else if (r.camposPreenchidos.length || r.enderecosAdicionados) {
          toast.success(
            `Cadastro de ${p.cliente} atualizado${
              r.camposPreenchidos.length ? `: ${r.camposPreenchidos.join(", ")}` : ""
            }.`,
          );
        }
      } catch (e: any) {
        toast.error(`Não foi possível atualizar o cadastro central: ${e?.message ?? e}`);
      }
    },
    [invalidar],
  );

  /** Preenche o cadastro central com os dados informados na tela. */
  const sincronizar = useCallback(
    async (dados: DadosCadastraisInput, o: OrigemSincronizacao) => {
      try {
        const p = await planejarSincronizacao(dados);
        if (!p) return;
        if (p.conflitos.length > 0) {
          setPlano(p);
          setOrigem(o);
          setOpen(true);
          return;
        }
        await executar(p, o, {});
      } catch (e: any) {
        toast.error(`Não foi possível verificar o cadastro central: ${e?.message ?? e}`);
      }
    },
    [executar],
  );

  const dialogProps = {
    open,
    plano,
    onOpenChange: (o: boolean) => {
      setOpen(o);
      if (!o) setPlano(null);
    },
    onConfirm: async (resolucoes: Partial<Record<CampoCadastral, ResolucaoConflito>>) => {
      if (plano && origem) await executar(plano, origem, resolucoes);
      setOpen(false);
      setPlano(null);
    },
  };

  return { sincronizar, dialogProps };
}
