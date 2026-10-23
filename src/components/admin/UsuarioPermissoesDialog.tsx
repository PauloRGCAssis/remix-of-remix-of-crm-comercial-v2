import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Ban, Check, Loader2, Minus } from "lucide-react";
import { toast } from "sonner";
import {
  MODULE_CATALOG,
  PERMISSION_ACTIONS,
  SPECIAL_PERMISSIONS,
  moduleActions,
  type ModuleDef,
  type PermissionAction,
} from "@/lib/modulesCatalog";

const GRID = "grid grid-cols-[minmax(0,1fr)_repeat(5,64px)] items-center gap-2";

/** Estado da exceção individual de um módulo/ação. */
export type EstadoExcecao = "herdar" | "permitir" | "bloquear";

/**
 * Bloqueio individual (permitido = false) aguarda a definição da estratégia de
 * gravação (chave única de user_permissions e regra de tem_permissao no banco).
 */
const BLOQUEIO_DISPONIVEL = false;

const MSG_PERFIL_PENDENTE = "Salve o usuário para editar as exceções com o novo perfil.";

type PermRow = { modulo: string; acao: string; permitido: boolean };

/**
 * Grava a exceção de uma única combinação usuário/módulo/ação.
 * "herdar" remove somente essa exceção. A gravação de "permitir" mantém, por
 * enquanto, o mecanismo anterior (remove e insere), até a estratégia ser aprovada.
 */
async function gravarExcecao(userId: string, modulo: string, acao: string, estado: EstadoExcecao) {
  if (estado === "bloquear" && !BLOQUEIO_DISPONIVEL) {
    throw new Error("Bloqueio individual ainda não disponível.");
  }
  const del = await supabase
    .from("user_permissions")
    .delete()
    .eq("user_id", userId)
    .eq("modulo", modulo)
    .eq("acao", acao);
  if (del.error) throw del.error;
  if (estado === "permitir") {
    const { error } = await supabase
      .from("user_permissions")
      .insert({ user_id: userId, modulo, acao, permitido: true } as never);
    if (error) throw error;
  }
}

/** Permissões individuais (exceções) de um usuário em relação ao perfil dele. */
export function UsuarioPermissoesDialog({
  open,
  onOpenChange,
  userId,
  userNome,
  profileId = null,
  perfilPendente = false,
  isAdmin = false,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  userId: string | null;
  userNome?: string;
  /** Perfil selecionado no formulário — base da prévia da herança. */
  profileId?: string | null;
  /** Perfil selecionado difere do salvo: o editor fica somente para consulta. */
  perfilPendente?: boolean;
  /** Role técnica `admin` salva: acesso total, exceções não se aplicam. */
  isAdmin?: boolean;
}) {
  const qc = useQueryClient();

  const { data: perms, isLoading, isError } = useQuery({
    queryKey: ["user-permissions-admin", userId],
    enabled: !!userId && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_permissions")
        .select("modulo, acao, permitido")
        .eq("user_id", userId!);
      if (error) throw error;
      return (data ?? []) as PermRow[];
    },
  });

  const perfilQuery = useQuery({
    queryKey: ["profile-permissions", profileId],
    enabled: !!profileId && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profile_permissions")
        .select("modulo, acao, permitido")
        .eq("profile_id", profileId!);
      if (error) throw error;
      return (data ?? []) as PermRow[];
    },
  });

  const individuais = useMemo(() => {
    const m = new Map<string, boolean>();
    for (const p of perms ?? []) m.set(`${p.modulo}:${p.acao}`, p.permitido);
    return m;
  }, [perms]);

  const herdadas = useMemo(() => {
    const m = new Map<string, boolean>();
    for (const p of perfilQuery.data ?? []) m.set(`${p.modulo}:${p.acao}`, p.permitido);
    return m;
  }, [perfilQuery.data]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["user-permissions-admin", userId] });
    qc.invalidateQueries({ queryKey: ["user-permissions"] });
  };

  const salvar = useMutation({
    mutationFn: async ({ modulo, acao, estado }: { modulo: string; acao: string; estado: EstadoExcecao }) => {
      if (!userId) throw new Error("Usuário inválido.");
      // Proteção também na gravação, não apenas nos controles desabilitados.
      if (perfilPendente) throw new Error(MSG_PERFIL_PENDENTE);
      await gravarExcecao(userId, modulo, acao, estado);
    },
    onSuccess: () => {
      invalidate();
      toast.success("Permissão individual gravada.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const carregando = isLoading || (!!profileId && perfilQuery.isLoading);
  const somenteLeitura = perfilPendente || isError || carregando || salvar.isPending || !userId;

  function renderCelula(modulo: string, acao: string, rotulo: string) {
    const chave = `${modulo}:${acao}`;
    const individual = individuais.get(chave);
    const estado: EstadoExcecao = individual === undefined ? "herdar" : individual ? "permitir" : "bloquear";
    const efetiva = individual ?? herdadas.get(chave) === true;
    const descricao =
      estado === "herdar"
        ? `herda do perfil (${efetiva ? "permitido" : "negado"})`
        : estado === "permitir"
          ? "liberado individualmente"
          : "bloqueado individualmente";
    const Icone = estado === "bloquear" ? Ban : efetiva ? Check : Minus;
    const cor =
      estado === "permitir" ? "text-success" : estado === "bloquear" ? "text-destructive" : "text-muted-foreground";

    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild disabled={somenteLeitura}>
          <Button
            variant="ghost"
            size="sm"
            className={`h-8 w-full flex-col gap-0 px-1 ${cor}`}
            aria-label={`${rotulo}: ${descricao}`}
            title={`${rotulo}: ${descricao}`}
          >
            <Icone className="h-3.5 w-3.5" />
            <span className="text-[10px] leading-none">
              {estado === "herdar" ? "perfil" : estado === "permitir" ? "liberado" : "bloqueado"}
            </span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center">
          <DropdownMenuRadioGroup
            value={estado}
            onValueChange={(v) => {
              if (somenteLeitura || v === estado) return;
              salvar.mutate({ modulo, acao, estado: v as EstadoExcecao });
            }}
          >
            <DropdownMenuRadioItem value="herdar">
              Herdar do perfil ({herdadas.get(chave) === true ? "permitido" : "negado"})
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="permitir">Permitir individualmente</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="bloquear" disabled={!BLOQUEIO_DISPONIVEL}>
              Bloquear individualmente{BLOQUEIO_DISPONIVEL ? "" : " (indisponível)"}
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  function renderRow(m: ModuleDef, depth = 0) {
    const acoes = moduleActions(m);
    return (
      <div key={m.key}>
        <div className={`${GRID} py-1.5 border-b border-border/40`}>
          <span className="text-sm truncate" style={{ paddingLeft: depth * 14 }} title={m.label}>
            {m.label}
          </span>
          {PERMISSION_ACTIONS.map((a) => (
            <div key={a.key} className="flex justify-center">
              {acoes.includes(a.key as PermissionAction) ? (
                renderCelula(m.key, a.key, `${m.label} — ${a.label}`)
              ) : (
                <span className="text-xs text-muted-foreground">—</span>
              )}
            </div>
          ))}
        </div>
        {m.children?.map((c) => renderRow(c, depth + 1))}
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading">
            Permissões individuais {userNome ? `— ${userNome}` : ""}
          </DialogTitle>
          <DialogDescription>
            Exceções deste usuário em relação ao perfil: herdar, permitir ou bloquear cada ação.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1 text-xs">
          {isAdmin && (
            <p role="note" className="text-muted-foreground">
              Administrador técnico: acesso total, as exceções individuais não se aplicam.
            </p>
          )}
          {perfilPendente ? (
            <div role="note" className="rounded-md border border-warning/50 p-2 text-warning">
              <p>
                Prévia das permissões do perfil selecionado. As alterações de perfil só terão efeito
                depois de salvar o usuário.
              </p>
              <p>{MSG_PERFIL_PENDENTE}</p>
            </div>
          ) : (
            <p role="note" className="text-muted-foreground">
              As exceções individuais são gravadas imediatamente.
            </p>
          )}
          {(isError || perfilQuery.isError) && (
            <p role="alert" className="text-destructive">
              Não foi possível carregar as permissões. Feche e abra novamente.
            </p>
          )}
        </div>

        {(salvar.isPending || carregando) && (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        )}

        <div className={`${GRID} pb-2 border-b text-[11px] uppercase text-muted-foreground`}>
          <span>Módulo</span>
          {PERMISSION_ACTIONS.map((a) => (
            <span key={a.key} className="text-center">
              {a.label}
            </span>
          ))}
        </div>
        <div>{MODULE_CATALOG.map((m) => renderRow(m))}</div>

        <div>
          <p className="text-sm font-medium mb-2">Permissões especiais</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {SPECIAL_PERMISSIONS.map((s) => (
              <div key={s.key} className="flex items-center gap-2 text-sm">
                <div className="w-16 shrink-0">
                  {renderCelula(s.key, "acessar", s.label)}
                </div>
                {s.label}
              </div>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Concluir</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
