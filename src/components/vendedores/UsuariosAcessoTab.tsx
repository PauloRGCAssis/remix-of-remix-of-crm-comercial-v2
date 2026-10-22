import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useVendors } from "@/hooks/useVendors";

const SEM_VINCULO = "__none__";

interface ProfileRow {
  id: string;
  nome: string | null;
  vendedor: string | null;
}

export function UsuariosAcessoTab() {
  const qc = useQueryClient();
  const { data: vendors } = useVendors();
  const [saving, setSaving] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["usuarios-acesso"],
    queryFn: async () => {
      const [profilesRes, rolesRes] = await Promise.all([
        supabase.from("profiles").select("id, nome, vendedor").order("nome"),
        supabase.from("user_roles").select("user_id, role"),
      ]);
      if (profilesRes.error) throw profilesRes.error;
      if (rolesRes.error) throw rolesRes.error;
      return {
        profiles: (profilesRes.data ?? []) as unknown as ProfileRow[],
        roles: (rolesRes.data ?? []) as { user_id: string; role: string }[],
      };
    },
  });

  const roleByUser = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of data?.roles ?? []) {
      if (r.role === "admin") map.set(r.user_id, "admin");
      else if (!map.has(r.user_id)) map.set(r.user_id, r.role);
    }
    return map;
  }, [data?.roles]);

  const vendorNames = (vendors ?? []).filter((v) => v.ativo && v.nome?.trim()).map((v) => v.nome);

  const setVendedor = useMutation({
    mutationFn: async ({ id, vendedor }: { id: string; vendedor: string | null }) => {
      const { error } = await supabase.from("profiles").update({ vendedor } as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Vínculo atualizado.");
      qc.invalidateQueries({ queryKey: ["usuarios-acesso"] });
      qc.invalidateQueries({ queryKey: ["user-access"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao atualizar vínculo"),
  });

  const setRole = useMutation({
    mutationFn: async ({ id, role }: { id: string; role: "admin" | "member" }) => {
      const del = await supabase.from("user_roles").delete().eq("user_id", id);
      if (del.error) throw del.error;
      const ins = await supabase.from("user_roles").insert({ user_id: id, role } as any);
      if (ins.error) throw ins.error;
    },
    onSuccess: () => {
      toast.success("Permissão atualizada.");
      qc.invalidateQueries({ queryKey: ["usuarios-acesso"] });
      qc.invalidateQueries({ queryKey: ["user-access"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao atualizar permissão"),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-heading">Usuários e permissões</CardTitle>
        <CardDescription>
          Defina quem é gestor (vê tudo) e qual vendedor cada login representa. Vendedores enxergam
          apenas os próprios clientes, prospecções e vendas.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando usuários...
          </div>
        ) : (data?.profiles?.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground py-6">Nenhum usuário cadastrado ainda.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Usuário</TableHead>
                <TableHead>Permissão</TableHead>
                <TableHead>Vendedor vinculado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.profiles ?? []).map((p) => {
                const role = roleByUser.get(p.id) ?? "member";
                return (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">
                      {p.nome || "—"}
                      {role === "admin" && <Badge className="ml-2">Gestor</Badge>}
                    </TableCell>
                    <TableCell>
                      <Select
                        value={role}
                        onValueChange={(v) => {
                          setSaving(p.id);
                          setRole.mutate(
                            { id: p.id, role: v as "admin" | "member" },
                            { onSettled: () => setSaving(null) },
                          );
                        }}
                      >
                        <SelectTrigger className="w-[160px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">Gestor</SelectItem>
                          <SelectItem value="member">Vendedor</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={p.vendedor || SEM_VINCULO}
                        onValueChange={(v) => {
                          setSaving(p.id);
                          setVendedor.mutate(
                            { id: p.id, vendedor: v === SEM_VINCULO ? null : v },
                            { onSettled: () => setSaving(null) },
                          );
                        }}
                      >
                        <SelectTrigger className="w-[220px]">
                          <SelectValue placeholder="Sem vínculo" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={SEM_VINCULO}>Sem vínculo</SelectItem>
                          {vendorNames.map((n) => (
                            <SelectItem key={n} value={n}>
                              {n}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {saving === p.id && (
                        <Loader2 className="inline h-3 w-3 ml-2 animate-spin text-muted-foreground" />
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
