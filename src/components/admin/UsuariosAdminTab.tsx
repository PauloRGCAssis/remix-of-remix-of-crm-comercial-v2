import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Copy, KeyRound, Loader2, MoreHorizontal, Pencil, Power, UserPlus } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { useVendors } from "@/hooks/useVendors";
import { useDataScopes, type DataScopeRow } from "@/hooks/useDataScopes";
import type { DataScope } from "@/hooks/usePermissions";
import { NovoUsuarioDialog, type BaseUsuarioCopia } from "./NovoUsuarioDialog";
import { VendorFormDialog } from "@/components/vendedores/VendorFormDialog";
import { PerfilFormDialog, type PermissionProfileRow } from "./PerfilFormDialog";
import { PerfilPermissoesDialog } from "./PerfilPermissoesDialog";
import { EscopoFormDialog } from "./EscopoFormDialog";
import { VendedorSelectBusca } from "./VendedorSelectBusca";
import { EditarUsuarioDialog, type UsuarioEdicao } from "./EditarUsuarioDialog";

const SEM_PERFIL = "__no_profile__";
export const NOVO_VENDEDOR = "__new_vendor__";
export const NOVO_PERFIL = "__new_profile__";
export const NOVO_ESCOPO = "__new_scope__";

export const ESCOPOS_PADRAO: { value: DataScope; label: string }[] = [
  { value: "meus_dados", label: "Somente meus dados" },
  { value: "vendedores_selecionados", label: "Vendedores selecionados" },
  { value: "empresa", label: "Toda a empresa" },
];

interface ProfileRow {
  id: string;
  nome: string | null;
  vendedor: string | null;
  vendedores: string[] | null;
  email: string | null;
  senha_definida: boolean | null;
  must_change_password: boolean | null;
}

/** Lista de vendedores vinculados, com retrocompatibilidade ao campo único. */
function vendedoresDoUsuario(p: { vendedor: string | null; vendedores: string[] | null }): string[] {
  if (p.vendedores?.length) return p.vendedores;
  return p.vendedor ? [p.vendedor] : [];
}

interface AccessRow {
  user_id: string;
  profile_id: string | null;
  ativo: boolean;
  escopo: DataScope;
  vendedores_autorizados: string[];
  scope_id: string | null;
}

export function UsuariosAdminTab() {
  const qc = useQueryClient();
  const { data: vendors } = useVendors();
  const { data: escopos } = useDataScopes();
  const [busy, setBusy] = useState<string | null>(null);
  const [novoOpen, setNovoOpen] = useState(false);
  const [baseCopia, setBaseCopia] = useState<BaseUsuarioCopia | null>(null);
  const [emEdicao, setEmEdicao] = useState<UsuarioEdicao | null>(null);

  // Cadastro rápido dentro da própria tela de usuários.
  const [vendorDialog, setVendorDialog] = useState<string | null>(null);
  const [perfilDialog, setPerfilDialog] = useState<string | null>(null);
  const [escopoDialog, setEscopoDialog] = useState<string | null>(null);
  const [permsDialog, setPermsDialog] = useState<{ id: string; nome?: string } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-usuarios"],
    queryFn: async () => {
      const [profilesRes, rolesRes, accessRes, permProfilesRes] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, nome, vendedor, vendedores, email, senha_definida, must_change_password")
          .order("nome"),
        supabase.from("user_roles").select("user_id, role"),
        supabase.from("user_access").select("*"),
        supabase.from("permission_profiles").select("id, nome, descricao, is_system, ativo, escopo_padrao").order("nome"),
      ]);
      if (profilesRes.error) throw profilesRes.error;
      if (rolesRes.error) throw rolesRes.error;
      if (accessRes.error) throw accessRes.error;
      if (permProfilesRes.error) throw permProfilesRes.error;
      return {
        profiles: (profilesRes.data ?? []) as unknown as ProfileRow[],
        roles: (rolesRes.data ?? []) as { user_id: string; role: string }[],
        access: (accessRes.data ?? []) as unknown as AccessRow[],
        permProfiles: (permProfilesRes.data ?? []) as unknown as PermissionProfileRow[],
      };
    },
  });

  const accessByUser = useMemo(() => {
    const m = new Map<string, AccessRow>();
    for (const a of data?.access ?? []) m.set(a.user_id, a);
    return m;
  }, [data?.access]);

  const isAdmin = (id: string) =>
    (data?.roles ?? []).some((r) => r.user_id === id && r.role === "admin");

  const vendorNames = (vendors ?? []).filter((v) => v.ativo && v.nome?.trim()).map((v) => v.nome);
  const escoposAtivos = (escopos ?? []).filter((e) => e.ativo);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["admin-usuarios"] });
    qc.invalidateQueries({ queryKey: ["user-permissions"] });
    qc.invalidateQueries({ queryKey: ["user-access"] });
    qc.invalidateQueries({ queryKey: ["data-scopes-usage"] });
  };

  const saveAccess = useMutation({
    mutationFn: async ({ userId, patch }: { userId: string; patch: Partial<AccessRow> }) => {
      const current = accessByUser.get(userId);
      const row = {
        user_id: userId,
        profile_id: current?.profile_id ?? null,
        ativo: current?.ativo ?? true,
        escopo: current?.escopo ?? "meus_dados",
        vendedores_autorizados: current?.vendedores_autorizados ?? [],
        scope_id: current?.scope_id ?? null,
        ...patch,
      };
      const { error } = await supabase
        .from("user_access")
        .upsert(row as never, { onConflict: "user_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Acesso atualizado.");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setVendedor = useMutation({
    mutationFn: async ({ id, vendedores }: { id: string; vendedores: string[] }) => {
      const { error } = await supabase
        .from("profiles")
        .update({ vendedor: vendedores[0] ?? null, vendedores } as never)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Vínculo atualizado.");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setAdmin = useMutation({
    mutationFn: async ({ id, admin }: { id: string; admin: boolean }) => {
      if (admin) {
        const { error } = await supabase
          .from("user_roles")
          .upsert({ user_id: id, role: "admin" } as never, { onConflict: "user_id,role" });
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("user_roles")
          .delete()
          .eq("user_id", id)
          .eq("role", "admin");
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Papel atualizado.");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function aplicarPerfil(userId: string, profileId: string) {
    const alvo = (data?.permProfiles ?? []).find((pp) => pp.id === profileId);
    saveAccess.mutate({
      userId,
      patch: {
        profile_id: profileId,
        ...(alvo?.escopo_padrao ? { escopo: alvo.escopo_padrao as DataScope, scope_id: null } : {}),
      },
    });
  }

  function aplicarEscopo(userId: string, escopo: DataScopeRow) {
    saveAccess.mutate({
      userId,
      patch: {
        scope_id: escopo.id,
        escopo: escopo.base as DataScope,
        vendedores_autorizados: escopo.vendedores ?? [],
      },
    });
  }

  const liberarPrimeiroAcesso = async (p: ProfileRow) => {
    setBusy(p.id);
    const { data: res, error } = await supabase.functions.invoke("admin-users", {
      body: { action: "liberar_primeiro_acesso", user_id: p.id },
    });
    setBusy(null);
    const err = error?.message ?? (res as { error?: string } | null)?.error;
    if (err) return toast.error(err);
    refresh();
    toast.success(
      `${p.nome || p.email} pode criar uma nova senha em "Primeiro acesso" na tela de login.`,
      { duration: 12000 },
    );
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3 flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="text-base">Usuários</CardTitle>
          <CardDescription>
            Autorize logins por e-mail, vincule a um vendedor e defina perfil e escopo de dados.
            Vendedores, perfis e escopos podem ser criados aqui mesmo, sem sair da tela.
          </CardDescription>
        </div>
        <Button
          size="sm"
          onClick={() => {
            setBaseCopia(null);
            setNovoOpen(true);
          }}
        >
          <UserPlus className="h-4 w-4 mr-2" />
          Novo usuário
        </Button>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <NovoUsuarioDialog
          open={novoOpen}
          onOpenChange={setNovoOpen}
          vendorNames={vendorNames}
          permProfiles={data?.permProfiles ?? []}
          escopos={escoposAtivos}
          onCreated={refresh}
          base={baseCopia}
        />

        <EditarUsuarioDialog
          usuario={emEdicao}
          onOpenChange={(v) => !v && setEmEdicao(null)}
          vendorNames={vendorNames}
          permProfiles={data?.permProfiles ?? []}
          escopos={escoposAtivos}
          onSaved={refresh}
          onCriarVendedor={() => emEdicao && setVendorDialog(emEdicao.id)}
        />

        {/* Cadastros rápidos disparados pelos seletores da tabela */}
        <VendorFormDialog
          open={!!vendorDialog}
          onOpenChange={(v) => !v && setVendorDialog(null)}
          onSaved={(_id, nome) => {
            if (vendorDialog) {
              const alvo = (data?.profiles ?? []).find((x) => x.id === vendorDialog);
              const atuais = alvo ? vendedoresDoUsuario(alvo) : [];
              setVendedor.mutate({
                id: vendorDialog,
                vendedores: Array.from(new Set([...atuais, nome])),
              });
            }
            setVendorDialog(null);
          }}
        />
        <PerfilFormDialog
          open={!!perfilDialog}
          onOpenChange={(v) => !v && setPerfilDialog(null)}
          onSaved={(id) => {
            if (perfilDialog) aplicarPerfil(perfilDialog, id);
            setPerfilDialog(null);
            qc.invalidateQueries({ queryKey: ["permission-profiles"] });
            refresh();
            setPermsDialog({ id });
          }}
        />
        <PerfilPermissoesDialog
          open={!!permsDialog}
          onOpenChange={(v) => !v && setPermsDialog(null)}
          profileId={permsDialog?.id ?? null}
          profileNome={permsDialog?.nome}
        />
        <EscopoFormDialog
          open={!!escopoDialog}
          onOpenChange={(v) => !v && setEscopoDialog(null)}
          onSaved={async (id) => {
            const alvo = escopoDialog;
            setEscopoDialog(null);
            const { data: novo } = await supabase
              .from("data_scopes" as never)
              .select("*")
              .eq("id", id)
              .maybeSingle();
            if (alvo && novo) aplicarEscopo(alvo, novo as unknown as DataScopeRow);
            qc.invalidateQueries({ queryKey: ["data-scopes"] });
          }}
        />

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Usuário</TableHead>
              <TableHead>Vendedor</TableHead>
              <TableHead>Perfil</TableHead>
              <TableHead>Escopo de dados</TableHead>
              <TableHead>Vendedores autorizados</TableHead>
              <TableHead className="text-center">Ativo</TableHead>
              <TableHead className="text-center">Administrador</TableHead>
              <TableHead className="text-center">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(data?.profiles ?? []).map((p) => {
              const acc = accessByUser.get(p.id);
              const admin = isAdmin(p.id);
              const escopo: DataScope = acc?.escopo ?? "meus_dados";
              const scopeId = acc?.scope_id ?? null;
              const escopoValue = scopeId ? `scope:${scopeId}` : escopo;
              const escopoPersonalizado = escoposAtivos.find((e) => e.id === scopeId) ?? null;
              const autorizados = acc?.vendedores_autorizados ?? [];
              return (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">
                    {p.nome || "—"}
                    {admin && (
                      <Badge variant="secondary" className="ml-2 text-[10px]">
                        Admin
                      </Badge>
                    )}
                    {!p.senha_definida && (
                      <Badge variant="outline" className="ml-2 text-[10px]">
                        Aguardando 1º acesso
                      </Badge>
                    )}
                    <div className="text-xs text-muted-foreground">{p.email || "—"}</div>
                  </TableCell>
                  <TableCell>
                    <div className="w-44">
                      <VendedorSelectBusca
                        values={vendedoresDoUsuario(p)}
                        onChange={(v) => setVendedor.mutate({ id: p.id, vendedores: v })}
                        vendorNames={vendorNames}
                        onCriarNovo={() => setVendorDialog(p.id)}
                      />
                    </div>
                  </TableCell>

                  <TableCell>
                    <Select
                      value={acc?.profile_id || SEM_PERFIL}
                      onValueChange={(v) => {
                        if (v === NOVO_PERFIL) return setPerfilDialog(p.id);
                        if (v === SEM_PERFIL) {
                          saveAccess.mutate({ userId: p.id, patch: { profile_id: null } });
                          return;
                        }
                        aplicarPerfil(p.id, v);
                      }}
                    >
                      <SelectTrigger className="w-40">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={SEM_PERFIL}>Sem perfil</SelectItem>
                        {(data?.permProfiles ?? [])
                          .filter((pp) => pp.ativo !== false || pp.id === acc?.profile_id)
                          .map((pp) => (
                            <SelectItem key={pp.id} value={pp.id}>
                              {pp.nome}
                              {pp.ativo === false ? " (inativo)" : ""}
                            </SelectItem>
                          ))}
                        <SelectSeparator />
                        <SelectItem value={NOVO_PERFIL}>+ Cadastrar novo perfil</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Select
                      value={escopoValue}
                      onValueChange={(v) => {
                        if (v === NOVO_ESCOPO) return setEscopoDialog(p.id);
                        if (v.startsWith("scope:")) {
                          const alvo = escoposAtivos.find((e) => e.id === v.slice(6));
                          if (alvo) aplicarEscopo(p.id, alvo);
                          return;
                        }
                        saveAccess.mutate({
                          userId: p.id,
                          patch: { escopo: v as DataScope, scope_id: null },
                        });
                      }}
                    >
                      <SelectTrigger className="w-52">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ESCOPOS_PADRAO.map((e) => (
                          <SelectItem key={e.value} value={e.value}>
                            {e.label}
                          </SelectItem>
                        ))}
                        {escoposAtivos.length > 0 && <SelectSeparator />}
                        {escoposAtivos.map((e) => (
                          <SelectItem key={e.id} value={`scope:${e.id}`}>
                            {e.nome}
                          </SelectItem>
                        ))}
                        <SelectSeparator />
                        <SelectItem value={NOVO_ESCOPO}>+ Criar novo escopo</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={escopo !== "vendedores_selecionados" || !!escopoPersonalizado}
                          title={
                            escopoPersonalizado
                              ? "Definido pelo escopo personalizado"
                              : undefined
                          }
                        >
                          {autorizados.length ? `${autorizados.length} selecionado(s)` : "Selecionar"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-56 max-h-72 overflow-y-auto space-y-1">
                        {vendorNames.map((n) => (
                          <label key={n} className="flex items-center gap-2 text-sm">
                            <Checkbox
                              checked={autorizados.includes(n)}
                              onCheckedChange={(v) => {
                                const next = v === true
                                  ? Array.from(new Set([...autorizados, n]))
                                  : autorizados.filter((x) => x !== n);
                                saveAccess.mutate({
                                  userId: p.id,
                                  patch: { vendedores_autorizados: next },
                                });
                              }}
                            />
                            {n}
                          </label>
                        ))}
                      </PopoverContent>
                    </Popover>
                  </TableCell>
                  <TableCell className="text-center">
                    <Switch
                      checked={acc?.ativo ?? true}
                      onCheckedChange={(v) => saveAccess.mutate({ userId: p.id, patch: { ativo: v } })}
                    />
                  </TableCell>
                  <TableCell className="text-center">
                    <Switch
                      checked={admin}
                      disabled={busy === p.id}
                      onCheckedChange={(v) => {
                        setBusy(p.id);
                        setAdmin.mutate({ id: p.id, admin: v }, { onSettled: () => setBusy(null) });
                      }}
                    />
                  </TableCell>
                  <TableCell className="text-center">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" disabled={busy === p.id}>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-56">
                        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                          {p.nome || p.email}
                        </DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onSelect={() =>
                            setEmEdicao({
                              id: p.id,
                              nome: p.nome || "",
                              email: p.email || "",
                              vendedor: p.vendedor,
                              vendedores: vendedoresDoUsuario(p),
                              profile_id: acc?.profile_id ?? null,
                              escopo,
                              scope_id: scopeId,
                              vendedores_autorizados: autorizados,
                              ativo: acc?.ativo ?? true,
                              admin,
                            })
                          }
                        >
                          <Pencil className="h-3.5 w-3.5 mr-2" />
                          Editar usuário
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() => {
                            setBaseCopia({
                              id: p.id,
                              nome: p.nome || p.email || "usuário",
                              profile_id: acc?.profile_id ?? null,
                              escopo,
                              scope_id: scopeId,
                              vendedores_autorizados: autorizados,
                            });
                            setNovoOpen(true);
                          }}
                        >
                          <Copy className="h-3.5 w-3.5 mr-2" />
                          Copiar usuário
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => liberarPrimeiroAcesso(p)}>
                          <KeyRound className="h-3.5 w-3.5 mr-2" />
                          Redefinir acesso
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() =>
                            saveAccess.mutate({
                              userId: p.id,
                              patch: { ativo: !(acc?.ativo ?? true) },
                            })
                          }
                        >
                          <Power className="h-3.5 w-3.5 mr-2" />
                          {(acc?.ativo ?? true) ? "Inativar" : "Ativar"}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
