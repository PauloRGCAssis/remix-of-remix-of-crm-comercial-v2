import { useMemo, useState } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  MODULE_CATALOG,
  PERMISSION_ACTIONS,
  SPECIAL_PERMISSIONS,
  flattenModules,
  moduleActions,
  type ModuleDef,
  type PermissionAction,
} from "@/lib/modulesCatalog";

const GRID = "grid grid-cols-[minmax(0,1fr)_repeat(5,64px)] items-center gap-2";

/**
 * Configuração de permissões de um perfil em modal — usada logo após criar um
 * perfil dentro da tela de Usuários, sem sair do cadastro.
 */
export function PerfilPermissoesDialog({
  open,
  onOpenChange,
  profileId,
  profileNome,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  profileId: string | null;
  profileNome?: string;
}) {
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);

  const { data: perms, isLoading } = useQuery({
    queryKey: ["profile-permissions", profileId],
    enabled: !!profileId && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profile_permissions")
        .select("modulo, acao, permitido")
        .eq("profile_id", profileId!);
      if (error) throw error;
      return (data ?? []) as { modulo: string; acao: string; permitido: boolean }[];
    },
  });

  const granted = useMemo(() => {
    const s = new Set<string>();
    for (const p of perms ?? []) if (p.permitido) s.add(`${p.modulo}:${p.acao}`);
    return s;
  }, [perms]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["profile-permissions", profileId] });
    qc.invalidateQueries({ queryKey: ["user-permissions"] });
  };

  const toggle = useMutation({
    mutationFn: async ({ modulo, acao, valor }: { modulo: string; acao: string; valor: boolean }) => {
      if (!profileId) return;
      if (valor) {
        const { error } = await supabase
          .from("profile_permissions")
          .upsert({ profile_id: profileId, modulo, acao, permitido: true } as never, {
            onConflict: "profile_id,modulo,acao",
          });
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("profile_permissions")
          .delete()
          .eq("profile_id", profileId)
          .eq("modulo", modulo)
          .eq("acao", acao);
        if (error) throw error;
      }
    },
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  async function marcarTudo(valor: boolean) {
    if (!profileId) return;
    setSaving(true);
    try {
      if (valor) {
        const rows: { profile_id: string; modulo: string; acao: string; permitido: boolean }[] = [];
        for (const m of flattenModules())
          for (const a of moduleActions(m))
            rows.push({ profile_id: profileId, modulo: m.key, acao: a, permitido: true });
        for (const s of SPECIAL_PERMISSIONS)
          rows.push({ profile_id: profileId, modulo: s.key, acao: "acessar", permitido: true });
        const { error } = await supabase
          .from("profile_permissions")
          .upsert(rows as never, { onConflict: "profile_id,modulo,acao" });
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("profile_permissions")
          .delete()
          .eq("profile_id", profileId);
        if (error) throw error;
      }
      invalidate();
      toast.success("Permissões atualizadas.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
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
                <Checkbox
                  checked={granted.has(`${m.key}:${a.key}`)}
                  onCheckedChange={(v) =>
                    toggle.mutate({ modulo: m.key, acao: a.key, valor: v === true })
                  }
                />
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
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading">
            Permissões {profileNome ? `— ${profileNome}` : ""}
          </DialogTitle>
          <DialogDescription>
            Marque as abas, sub-abas e ações liberadas para este perfil.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => marcarTudo(true)} disabled={saving}>
            Selecionar tudo
          </Button>
          <Button size="sm" variant="outline" onClick={() => marcarTudo(false)} disabled={saving}>
            Remover tudo
          </Button>
          {(saving || isLoading) && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>

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
              <label key={s.key} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={granted.has(`${s.key}:acessar`)}
                  onCheckedChange={(v) =>
                    toggle.mutate({ modulo: s.key, acao: "acessar", valor: v === true })
                  }
                />
                {s.label}
              </label>
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
