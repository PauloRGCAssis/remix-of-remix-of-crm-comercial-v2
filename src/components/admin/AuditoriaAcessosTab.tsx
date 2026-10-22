import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";

const TODOS = "__all__";

const EVENTOS: { value: string; label: string }[] = [
  { value: "login", label: "Login" },
  { value: "logout", label: "Logout" },
  { value: "pagina", label: "Página acessada" },
  { value: "exportacao", label: "Exportação" },
  { value: "importacao", label: "Importação" },
  { value: "permissao", label: "Alteração de permissão" },
];

interface AuditRow {
  id: string;
  usuario_nome: string | null;
  evento: string;
  modulo: string | null;
  detalhe: string | null;
  created_at: string;
}

export function AuditoriaAcessosTab() {
  const [evento, setEvento] = useState(TODOS);
  const [inicio, setInicio] = useState("");
  const [fim, setFim] = useState("");
  const [busca, setBusca] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["access-audit", evento, inicio, fim],
    queryFn: async () => {
      let q = supabase
        .from("access_audit_log")
        .select("id, usuario_nome, evento, modulo, detalhe, created_at")
        .order("created_at", { ascending: false })
        .limit(500);
      if (evento !== TODOS) q = q.eq("evento", evento);
      if (inicio) q = q.gte("created_at", new Date(`${inicio}T00:00:00`).toISOString());
      if (fim) q = q.lte("created_at", new Date(`${fim}T23:59:59`).toISOString());
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as AuditRow[];
    },
  });

  const rows = useMemo(() => {
    const term = busca.trim().toLowerCase();
    if (!term) return data ?? [];
    return (data ?? []).filter((r) =>
      [r.usuario_nome, r.evento, r.modulo, r.detalhe]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(term)),
    );
  }, [data, busca]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Auditoria de acessos</CardTitle>
        <CardDescription>
          Registro de logins, páginas visitadas, exportações, importações e mudanças de permissão.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Select value={evento} onValueChange={setEvento}>
            <SelectTrigger className="w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS}>Todos os eventos</SelectItem>
              {EVENTOS.map((e) => (
                <SelectItem key={e.value} value={e.value}>
                  {e.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} className="w-40" />
          <Input type="date" value={fim} onChange={(e) => setFim(e.target.value)} className="w-40" />
          <Input
            placeholder="Buscar usuário, módulo..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="w-56"
          />
        </div>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data/hora</TableHead>
                  <TableHead>Usuário</TableHead>
                  <TableHead>Evento</TableHead>
                  <TableHead>Módulo</TableHead>
                  <TableHead>Detalhe</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap text-xs">
                      {new Date(r.created_at).toLocaleString("pt-BR")}
                    </TableCell>
                    <TableCell>{r.usuario_nome || "—"}</TableCell>
                    <TableCell>{EVENTOS.find((e) => e.value === r.evento)?.label ?? r.evento}</TableCell>
                    <TableCell>{r.modulo || "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.detalhe || "—"}</TableCell>
                  </TableRow>
                ))}
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-6">
                      Nenhum evento registrado no período.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
