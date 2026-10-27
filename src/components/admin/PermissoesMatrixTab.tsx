import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Copy, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  MODULE_CATALOG,
  PERMISSION_ACTIONS,
  SPECIAL_PERMISSIONS,
  DEFAULT_PROFILE_MODULES,
  DEFAULT_PROFILE_SPECIALS,
  flattenModules,
  moduleActions,
  type ModuleDef,
  type PermissionAction,
} from "@/lib/modulesCatalog";
import {
  PerfilFormDialog,
  ESCOPO_OPTIONS,
  type PermissionProfileRow,
} from "./PerfilFormDialog";

const GRID = "grid grid-cols-[minmax(0,1fr)_repeat(5,72px)] items-center gap-2";

export function PermissoesMatrixTab() {
  const qc = useQueryClient();
  const [profileId, setProfileId] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editando, setEditando] = useState<PermissionProfileRow | null>(null);
  const [duplicando, setDuplicando] = useState<PermissionProfileRow | null>(null);

  const { data: profiles } = useQuery({
    queryKey: ["permission-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("permission_profiles").select("*").order("nome");
      if (error) throw error;
      return (data ?? []) as unknown as PermissionProfileRow[];
    },
  });

  const { data: usageRows } = useQuery({
    queryKey: ["permission-profiles-usage"],
    queryFn: async () => {
      const { data, error } = await supabase.from("user_access").select("profile_id");
      if (error) throw error;
      return (data ?? []) as { profile_id: string | null }[];
    },
  });

  const usage = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of usageRows ?? []) {
      if (r.profile_id) m.set(r.profile_id, (m.get(r.profile_id) ?? 0) + 1);
    }
    return m;
  }, [usageRows]);

  const selectedId = profileId || profiles?.[0]?.id || "";
  const selected = profiles?.find((p) => p.id === selectedId) ?? null;

  const refreshProfiles = () => {
    qc.invalidateQueries({ queryKey: ["permission-profiles"] });
    qc.invalidateQueries({ queryKey: ["permission-profiles-usage"] });
    qc.invalidateQueries({ queryKey: ["admin-usuarios"] });
    qc.invalidateQueries({ queryKey: ["user-permissions"] });
  };

  const { data: perms, isLoading } = useQuery({
    queryKey: ["profile-permissions", selectedId],
    enabled: !!selectedId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profile_permissions")
        .select("modulo, acao, permitido")
        .eq("profile_id", selectedId);
      if (error) throw error;
      return (data ?? []) as { modulo: string; acao: string; permitido: boolean }[];
    },
  });

  const granted = useMemo(() => {
    const s = new Set<string>();
    for (const p of perms ?? []) if (p.permitido) s.add(`${p.modulo}:${p.acao}`);
    return s;
  }, [perms]);

  const toggle = useMutation({
    mutationFn: async ({ modulo, acao, valor }: { modulo: string; acao: string; valor: boolean }) => {
      if (!selectedId) return;
      if (valor) {
        const { error } = await supabase
          .from("profile_permissions")
          .upsert({ profile_id: selectedId, modulo, acao, permitido: true } as never, {
            onConflict: "profile_id,modulo,acao",
          });
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("profile_permissions")
          .delete()
          .eq("profile_id", selectedId)
          .eq("modulo", modulo)
          .eq("acao", acao);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["profile-permissions", selectedId] });
      qc.invalidateQueries({ queryKey: ["user-permissions"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setAtivo = useMutation({
    mutationFn: async ({ id, ativo }: { id: string; ativo: boolean }) => {
      const { error } = await supabase
        .from("permission_profiles")
        .update({ ativo } as never)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Status do perfil atualizado.");
      refreshProfiles();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setEscopoPadrao = useMutation({
    mutationFn: async ({ id, escopo }: { id: string; escopo: string }) => {
      const { error } = await supabase
        .from("permission_profiles")
        .update({ escopo_padrao: escopo } as never)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Escopo padrão atualizado.");
      refreshProfiles();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function excluirPerfil(p: PermissionProfileRow) {
    const vinculados = usage.get(p.id) ?? 0;
    if (p.is_system) return toast.error("Perfis padrão do sistema não podem ser excluídos.");
    if (vinculados > 0) {
      return toast.error(
        `Este perfil está vinculado a ${vinculados} usuário(s). Inative-o em vez de excluir.`,
      );
    }
    if (!window.confirm(`Excluir definitivamente o perfil "${p.nome}"?`)) return;
    const { error } = await supabase.from("permission_profiles").delete().eq("id", p.id);
    if (error) return toast.error(error.message);
    if (selectedId === p.id) setProfileId("");
    toast.success("Perfil excluído.");
    refreshProfiles();
  }

  async function applyBulk(keys: { modulo: string; acao: string }[], valor: boolean) {
    if (!selectedId) return;
    setSaving(true);
    try {
      if (valor) {
        const rows = keys.map((k) => ({
          profile_id: selectedId,
          modulo: k.modulo,
          acao: k.acao,
          permitido: true,
        }));
        const { error } = await supabase
          .from("profile_permissions")
          .upsert(rows as never, { onConflict: "profile_id,modulo,acao" });
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("profile_permissions")
          .delete()
          .eq("profile_id", selectedId);
        if (error) throw error;
      }
      qc.invalidateQueries({ queryKey: ["profile-permissions", selectedId] });
      qc.invalidateQueries({ queryKey: ["user-permissions"] });
      toast.success("Permissões atualizadas.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const todasChaves = useMemo(() => {
    const out: { modulo: string; acao: string }[] = [];
    for (const m of flattenModules()) {
      for (const a of moduleActions(m)) out.push({ modulo: m.key, acao: a });
    }
    for (const s of SPECIAL_PERMISSIONS) out.push({ modulo: s.key, acao: "acessar" });
    return out;
  }, []);

  function aplicarPadrao() {
    if (!selected) return;
    // O padrão vale só para os perfis do sistema: um perfil personalizado
    // chamado "Administrador" ou "Gestor" não herda privilégios pelo nome.
    const mods = selected.is_system ? DEFAULT_PROFILE_MODULES[selected.nome] : undefined;
    if (!mods) {
      toast.info("Este perfil personalizado não possui padrão. Marque as permissões manualmente.");
      return;
    }
    const specials = DEFAULT_PROFILE_SPECIALS[selected.nome] ?? [];
    const keys: { modulo: string; acao: string }[] = [];
    for (const m of flattenModules()) {
      const permitido = mods === "all" || (Array.isArray(mods) && mods.includes(m.key));
      if (permitido) for (const a of moduleActions(m)) keys.push({ modulo: m.key, acao: a });
    }
    for (const s of specials) keys.push({ modulo: s, acao: "acessar" });
    void (async () => {
      await supabase.from("profile_permissions").delete().eq("profile_id", selectedId);
      await applyBulk(keys, true);
    })();
  }

  function renderRow(m: ModuleDef, depth = 0) {
    const acoes = moduleActions(m);
    return (
      <div key={m.key}>
        <div className={`${GRID} py-1.5 border-b border-border/40`}>
          <span className="text-sm truncate" style={{ paddingLeft: depth * 16 }} title={m.label}>
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
    <div className="space-y-4">
      <PerfilFormDialog
        open={formOpen}
        onOpenChange={(v) => {
          setFormOpen(v);
          if (!v) {
            setEditando(null);
            setDuplicando(null);
          }
        }}
        perfil={editando}
        duplicarDe={duplicando}
        onSaved={(id) => {
          setProfileId(id);
          refreshProfiles();
        }}
      />

      <Card>
        <CardHeader className="pb-3 flex-row items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="text-base">Perfis de acesso</CardTitle>
            <CardDescription>
              Crie quantos perfis personalizados precisar. Perfis ativos aparecem no cadastro de usuários.
            </CardDescription>
          </div>
          <Button
            size="sm"
            onClick={() => {
              setEditando(null);
              setDuplicando(null);
              setFormOpen(true);
            }}
          >
            <Plus className="h-4 w-4 mr-2" />
            Novo perfil
          </Button>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Perfil</TableHead>
                <TableHead>Escopo padrão de dados</TableHead>
                <TableHead className="text-center">Usuários</TableHead>
                <TableHead className="text-center">Ativo</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(profiles ?? []).map((p) => {
                const vinculados = usage.get(p.id) ?? 0;
                return (
                  <TableRow
                    key={p.id}
                    className={p.id === selectedId ? "bg-muted/50" : undefined}
                    onClick={() => setProfileId(p.id)}
                  >
                    <TableCell className="font-medium">
                      {p.nome}
                      {p.is_system && (
                        <Badge variant="secondary" className="ml-2 text-[10px]">
                          Padrão
                        </Badge>
                      )}
                      {p.descricao && (
                        <div className="text-xs text-muted-foreground">{p.descricao}</div>
                      )}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Select
                        value={p.escopo_padrao ?? "meus_dados"}
                        onValueChange={(v) => setEscopoPadrao.mutate({ id: p.id, escopo: v })}
                      >
                        <SelectTrigger className="w-52">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ESCOPO_OPTIONS.map((o) => (
                            <SelectItem key={o.value} value={o.value}>
                              {o.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-center text-sm">{vinculados}</TableCell>
                    <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                      <Switch
                        checked={p.ativo ?? true}
                        onCheckedChange={(v) => setAtivo.mutate({ id: p.id, ativo: v })}
                      />
                    </TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          title="Editar perfil"
                          onClick={() => {
                            setDuplicando(null);
                            setEditando(p);
                            setFormOpen(true);
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          title="Duplicar perfil"
                          onClick={() => {
                            setEditando(null);
                            setDuplicando(p);
                            setFormOpen(true);
                          }}
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          title={
                            vinculados > 0 || p.is_system
                              ? "Perfil vinculado a usuários ou padrão do sistema: use Inativar"
                              : "Excluir perfil"
                          }
                          disabled={vinculados > 0 || p.is_system}
                          onClick={() => excluirPerfil(p)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            Permissões {selected ? `— ${selected.nome}` : ""}
          </CardTitle>
          <CardDescription>
            Marque o que o perfil pode fazer em cada aba e sub-aba do sistema.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          <Select value={selectedId} onValueChange={setProfileId}>
            <SelectTrigger className="w-56">
              <SelectValue placeholder="Selecione o perfil" />
            </SelectTrigger>
            <SelectContent>
              {(profiles ?? []).map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" onClick={() => applyBulk(todasChaves, true)} disabled={saving}>
            Selecionar tudo
          </Button>
          <Button size="sm" variant="outline" onClick={() => applyBulk([], false)} disabled={saving}>
            Remover tudo
          </Button>
          <Button size="sm" variant="secondary" onClick={aplicarPadrao} disabled={saving || !selected}>
            Aplicar padrão do perfil
          </Button>
          {(saving || isLoading) && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Módulos e sub-abas</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <div className={`${GRID} pb-2 border-b text-[11px] uppercase text-muted-foreground`}>
            <span>Módulo</span>
            {PERMISSION_ACTIONS.map((a) => (
              <span key={a.key} className="text-center">
                {a.label}
              </span>
            ))}
          </div>
          {MODULE_CATALOG.map((m) => renderRow(m))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Permissões especiais</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2">
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
        </CardContent>
      </Card>
    </div>
  );
}
