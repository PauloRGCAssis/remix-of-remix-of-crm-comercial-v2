import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, RefreshCcw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { SaleRow } from "@/hooks/useSalesData";
import type { ClientAlias } from "@/hooks/useClientAliases";
import { useModuleCrud } from "@/hooks/useModuleCrud";

interface CnpjGroup {
  cnpj: string;
  canonical: string;
  variantes: string[];
  ultimaCompra: string;
  totalPedidos: number;
}

interface Props {
  /** RAW sales rows (without alias resolution) — pass useSalesData() data here, since it still preserves raw cliente strings */
  sales: SaleRow[];
  aliases: ClientAlias[];
}

/**
 * Pick canonical name from variants:
 *  1) prefer name WITHOUT (IM)/(GR) suffix
 *  2) then shortest length
 *  3) then alphabetical
 */
function pickCanonical(variantes: string[]): string {
  return [...variantes].sort((a, b) => {
    const sa = /\((IM|GR)\)\s*$/i.test(a) ? 1 : 0;
    const sb = /\((IM|GR)\)\s*$/i.test(b) ? 1 : 0;
    if (sa !== sb) return sa - sb;
    if (a.length !== b.length) return a.length - b.length;
    return a.localeCompare(b);
  })[0];
}

export function CnpjAuditPanel({ sales, aliases }: Props) {
  const qc = useQueryClient();
  const [running, setRunning] = useState(false);
  // Unificação por CNPJ em lote = agrupar (editar) em Clientes Duplicados.
  const { podeEditar } = useModuleCrud("clientes_duplicados", "clientes duplicados");

  const aliasSet = useMemo(() => new Set(aliases.map(a => a.alias_name)), [aliases]);

  const groups = useMemo<CnpjGroup[]>(() => {
    const byCnpj = new Map<string, { variantes: Set<string>; ultima: string; total: number }>();
    for (const s of sales) {
      const cnpj = (s.cnpj_cpf || "").trim();
      if (!cnpj) continue;
      const entry = byCnpj.get(cnpj) ?? { variantes: new Set<string>(), ultima: "", total: 0 };
      entry.variantes.add(s.cliente);
      entry.total++;
      if (!entry.ultima || new Date(s.data) > new Date(entry.ultima)) entry.ultima = s.data;
      byCnpj.set(cnpj, entry);
    }
    const result: CnpjGroup[] = [];
    byCnpj.forEach((v, cnpj) => {
      if (v.variantes.size > 1) {
        const variantes = Array.from(v.variantes);
        result.push({
          cnpj,
          canonical: pickCanonical(variantes),
          variantes,
          ultimaCompra: v.ultima,
          totalPedidos: v.total,
        });
      }
    });
    return result.sort((a, b) => b.totalPedidos - a.totalPedidos);
  }, [sales]);

  const pendentes = useMemo(() => {
    let n = 0;
    for (const g of groups) {
      for (const v of g.variantes) {
        if (v !== g.canonical && !aliasSet.has(v)) n++;
      }
    }
    return n;
  }, [groups, aliasSet]);

  // Orders without CNPJ linked to a client — can't be auto-grouped
  const ordersWithoutCnpj = useMemo(() => {
    return sales.filter(s => !s.cnpj_cpf || !s.cnpj_cpf.trim()).length;
  }, [sales]);

  async function unifyAll() {
    if (!podeEditar) {
      toast.error("Sem permissão para editar clientes duplicados.");
      return;
    }
    setRunning(true);
    let applied = 0;
    let failed = 0;
    try {
      const rows: Array<{ canonical_name: string; alias_name: string; motivo: string }> = [];
      for (const g of groups) {
        for (const v of g.variantes) {
          if (v === g.canonical) continue;
          if (aliasSet.has(v)) continue;
          rows.push({
            canonical_name: g.canonical,
            alias_name: v,
            motivo: `unificação automática por CNPJ ${g.cnpj}`,
          });
        }
      }
      if (rows.length === 0) {
        toast.info("Todas as variantes por CNPJ já estão unificadas.");
        return;
      }
      // upsert in chunks
      const chunkSize = 100;
      for (let i = 0; i < rows.length; i += chunkSize) {
        const chunk = rows.slice(i, i + chunkSize);
        const { error } = await supabase
          .from("client_aliases" as any)
          .upsert(chunk.map(r => ({ ...r, updated_at: new Date().toISOString() })), { onConflict: "alias_name" });
        if (error) {
          failed += chunk.length;
          console.error(error);
        } else {
          applied += chunk.length;
        }
      }
      await qc.invalidateQueries({ queryKey: ["client-aliases"] });
      await qc.invalidateQueries({ queryKey: ["sales-data"] });
      toast.success(`${applied} variante(s) unificada(s) por CNPJ.${failed ? ` ${failed} falharam.` : ""}`);
    } finally {
      setRunning(false);
    }
  }

  return (
    <Card className="shadow-card border-warning/30">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-heading flex items-center justify-between gap-2 flex-wrap">
          <span className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-warning" />
            Auditoria de Vendas por CNPJ
          </span>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[11px]">
              {groups.length} CNPJs com nomes divergentes
            </Badge>
            {pendentes > 0 && (
              <Badge variant="destructive" className="text-[11px]">{pendentes} variante(s) não unificada(s)</Badge>
            )}
            <Button size="sm" variant="outline" onClick={unifyAll} disabled={running || pendentes === 0 || !podeEditar}>
              <RefreshCcw className={`h-3 w-3 mr-1 ${running ? "animate-spin" : ""}`} />
              Reprocessar pedidos e clientes (por CNPJ)
            </Button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Cruzamento direto na tabela bruta de vendas. Quando o mesmo CNPJ aparece com nomes diferentes
          (ex.: <span className="font-mono">"(IM)"</span>, <span className="font-mono">"(GR)"</span>) o
          sistema unifica automaticamente as vendas no cliente canônico, recalculando última compra,
          dias sem comprar, status e histórico.
        </p>

        {ordersWithoutCnpj > 0 && (
          <div className="flex items-start gap-2 p-2 rounded border border-warning/40 bg-warning/5 text-xs">
            <AlertTriangle className="h-4 w-4 text-warning flex-shrink-0 mt-0.5" />
            <div>
              <strong>{ordersWithoutCnpj.toLocaleString("pt-BR")} pedido(s) importado(s) sem CNPJ.</strong>{" "}
              Esses pedidos só conseguem ser cruzados por nome — se houver variação de digitação no SIGE Cloud,
              eles podem ficar fora da análise. Garanta que a coluna CNPJ esteja preenchida no arquivo de importação.
            </div>
          </div>
        )}

        {groups.length === 0 ? (
          <div className="text-xs text-muted-foreground p-2">
            Nenhum CNPJ com variantes de nome encontrado. Todos os pedidos estão coerentes.
          </div>
        ) : (
          <div className="border rounded max-h-80 overflow-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-muted/60">
                <TableRow>
                  <TableHead className="text-xs">CNPJ</TableHead>
                  <TableHead className="text-xs">Canônico</TableHead>
                  <TableHead className="text-xs">Variantes</TableHead>
                  <TableHead className="text-xs text-right">Pedidos</TableHead>
                  <TableHead className="text-xs">Última</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groups.slice(0, 200).map(g => {
                  const pendingVariants = g.variantes.filter(v => v !== g.canonical && !aliasSet.has(v));
                  return (
                    <TableRow key={g.cnpj}>
                      <TableCell className="text-xs font-mono">{g.cnpj}</TableCell>
                      <TableCell className="text-xs font-medium">{g.canonical}</TableCell>
                      <TableCell className="text-xs">
                        <div className="flex flex-wrap gap-1">
                          {g.variantes.filter(v => v !== g.canonical).map(v => (
                            <Badge
                              key={v}
                              variant={aliasSet.has(v) ? "secondary" : "outline"}
                              className="text-[10px] font-normal"
                            >
                              {v}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-right">{g.totalPedidos}</TableCell>
                      <TableCell className="text-xs">{g.ultimaCompra?.slice(0, 10) || "—"}</TableCell>
                      <TableCell className="text-xs">
                        {pendingVariants.length === 0 ? (
                          <Badge variant="default" className="text-[10px] bg-success/20 text-success border-success/40">Unificado</Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] border-warning/40 text-warning">
                            {pendingVariants.length} pendente(s)
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
