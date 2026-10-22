import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Database, GitCompare, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import type { SaleRow } from "@/hooks/useSalesData";

interface Props {
  analysisSales: SaleRow[];
}

interface AuditRow {
  id?: number;
  codigo_venda: number;
  data: string;
  quantidade?: number;
  descricao: string;
  cnpj_cpf: string | null;
  cliente: string;
  vendedor: string;
  preco_total: number;
}

const TARGETS = [
  {
    id: "prodomo",
    label: "Prodomo Design",
    queryTerms: ["Prodomo"],
    include: ["prodomo design"],
    exclude: [] as string[],
    cnpjs: ["66276759000100"],
  },
  {
    id: "guara",
    label: "Restaurante Guara",
    queryTerms: ["Restaurante Guara", "Restaurante Guará"],
    include: ["restaurante guara"],
    exclude: [] as string[],
    cnpjs: ["40216757000131"],
  },
  {
    id: "tudo-bom",
    label: "Lanchonete Tudo de Bom Lanches",
    queryTerms: ["Tudo de Bom"],
    include: ["tudo de bom", "lanchonete tudo de bom jardim canada"],
    exclude: [] as string[],
    cnpjs: ["06840786609"],
  },
  {
    id: "empada-i",
    label: "Empada de Minas Brasília I - Proximus",
    queryTerms: ["Empada de Minas"],
    include: ["empada de minas brasilia i", "proximus"],
    exclude: ["empada de minas brasilia ii", "empada de minas brasilia iii", "maximus", "meridius"],
    cnpjs: ["47291623000124"],
  },
  {
    id: "empada-ii",
    label: "Empada de Minas Brasília II - Maximus",
    queryTerms: ["Empada de Minas"],
    include: ["empada de minas brasilia ii", "maximus"],
    exclude: ["empada de minas brasilia iii", "meridius"],
    cnpjs: ["40194226000195"],
  },
];

type Target = (typeof TARGETS)[number];

interface AggregatedOrder {
  codigo_venda: number;
  data: string;
  cnpj: string;
  cliente: string;
  valor: number;
}

interface TargetAudit {
  target: Target;
  sigeOrders: Map<number, AggregatedOrder>;
  rawOrders: Map<number, AggregatedOrder>;
  analysisOrders: Map<number, AggregatedOrder>;
}

function digits(value: string | null | undefined): string {
  return String(value ?? "").replace(/\D+/g, "");
}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function rowMatches(row: Pick<AuditRow, "cliente" | "cnpj_cpf">, target: Target, extraCnpjs: Set<string> = new Set()): boolean {
  const clienteNorm = normalize(row.cliente);
  const cnpj = digits(row.cnpj_cpf);
  if (cnpj && (target.cnpjs.includes(cnpj) || extraCnpjs.has(cnpj))) return true;
  if (target.exclude.some((term) => clienteNorm.includes(normalize(term)))) return false;
  return target.include.some((term) => clienteNorm.includes(normalize(term)));
}

function buildOrFilter(target: Target): string {
  const byName = target.queryTerms.map((term) => `cliente.ilike.%${term}%`);
  const byCnpj = target.cnpjs.map((cnpj) => `cnpj_cpf.eq.${cnpj}`);
  return [...byName, ...byCnpj].join(",");
}

function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function formatDateOnly(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR");
}

function lastDate(rows: Iterable<AggregatedOrder>): Date | null {
  return Array.from(rows).reduce<Date | null>((max, row) => {
    const d = new Date(row.data);
    if (!Number.isFinite(d.getTime())) return max;
    return !max || d > max ? d : max;
  }, null);
}

function aggregateOrders(rows: AuditRow[]): Map<number, AggregatedOrder> {
  const map = new Map<number, AggregatedOrder>();
  for (const row of rows) {
    const code = Number(row.codigo_venda);
    if (!Number.isFinite(code) || code <= 0) continue;
    const existing = map.get(code);
    const rowDate = new Date(row.data);
    const existingDate = existing ? new Date(existing.data) : null;
    const shouldReplaceDate = !existing || (Number.isFinite(rowDate.getTime()) && (!existingDate || rowDate > existingDate));
    map.set(code, {
      codigo_venda: code,
      data: shouldReplaceDate ? row.data : existing.data,
      cnpj: existing?.cnpj || digits(row.cnpj_cpf),
      cliente: existing?.cliente && existing.cliente.includes(row.cliente) ? existing.cliente : [existing?.cliente, row.cliente].filter(Boolean).join(" / "),
      valor: (existing?.valor ?? 0) + Number(row.preco_total || 0),
    });
  }
  return map;
}

function yesNo(value: boolean) {
  return value ? (
    <Badge variant="secondary" className="text-[10px] gap-1"><CheckCircle2 className="h-3 w-3" /> Sim</Badge>
  ) : (
    <Badge variant="outline" className="text-[10px] gap-1"><XCircle className="h-3 w-3" /> Não</Badge>
  );
}

function exclusionReason(inSige: boolean, inRaw: boolean, considered: boolean): string {
  if (considered) return "—";
  if (inSige && !inRaw) return "Existe no SIGE/sales, mas não existe em sales_raw_rows.";
  if (!inSige && inRaw) return "Existe em sales_raw_rows, mas não entrou na Análise de Clientes.";
  if (inSige && inRaw) return "Existe nas fontes, mas não foi considerado pela consulta da Análise.";
  return "Não localizado nas fontes consultadas.";
}

export function ClientAnalysisAuditPanel({ analysisSales }: Props) {
  const sourcesQuery = useQuery({
    queryKey: ["client-analysis-source-audit", "required-targets", "v2"],
    queryFn: async () => {
      const entries = await Promise.all(
        TARGETS.map(async (target) => {
          const filter = buildOrFilter(target);
          const [sige, raw] = await Promise.all([
            supabase
              .from("sales")
              .select("id, codigo_venda, data, quantidade, descricao, cnpj_cpf, cliente, vendedor, preco_total")
              .or(filter)
              .order("data", { ascending: true }),
            supabase
              .from("sales_raw_rows" as any)
              .select("id, codigo_venda, data, quantidade, descricao, cnpj_cpf, cliente, vendedor, preco_venda_total, preco_total")
              .eq("active", true)
              .or(filter)
              .order("data", { ascending: true }),
          ]);
          if (sige.error) throw sige.error;
          if (raw.error) throw raw.error;
          const sigeRows = (((sige.data ?? []) as unknown) as AuditRow[]).filter((row) => rowMatches(row, target));
          const rawRows = (((raw.data ?? []) as unknown) as any[]).map((row) => ({
            ...row,
            preco_total: Number(row.preco_venda_total ?? row.preco_total ?? 0),
          })) as AuditRow[];
          return [target.id, { target, sigeRows, rawRows: rawRows.filter((row) => rowMatches(row, target)) }] as const;
        }),
      );
      return new Map(entries);
    },
    staleTime: 0,
    gcTime: 0,
  });

  const audits = useMemo<TargetAudit[]>(() => {
    return TARGETS.map((target) => {
      const source = sourcesQuery.data?.get(target.id);
      const knownCnpjs = new Set<string>([
        ...target.cnpjs,
        ...((source?.sigeRows ?? []).map((row) => digits(row.cnpj_cpf)).filter(Boolean)),
        ...((source?.rawRows ?? []).map((row) => digits(row.cnpj_cpf)).filter(Boolean)),
      ]);
      const analysisRows = analysisSales
        .filter((row) => rowMatches(row, target, knownCnpjs))
        .map((row) => ({
          id: row.id,
          codigo_venda: row.codigo_venda,
          data: row.data,
          quantidade: row.quantidade,
          descricao: row.descricao,
          cnpj_cpf: row.cnpj_cpf,
          cliente: row.cliente,
          vendedor: row.vendedor,
          preco_total: row.preco_total,
        }));

      return {
        target,
        sigeOrders: aggregateOrders(source?.sigeRows ?? []),
        rawOrders: aggregateOrders(source?.rawRows ?? []),
        analysisOrders: aggregateOrders(analysisRows),
      };
    });
  }, [analysisSales, sourcesQuery.data]);

  return (
    <Card className="border-warning/40 shadow-card">
      <CardHeader className="pb-3">
        <CardTitle className="font-heading text-base flex items-center gap-2">
          <GitCompare className="h-4 w-4 text-warning" />
          Auditoria técnica — pedidos ignorados pela Análise de Clientes
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border border-warning/40 bg-warning/5 p-3 text-sm">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-warning mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold">Ponto investigado</p>
              <p className="text-muted-foreground">
                A comparação abaixo mede, para cada cliente solicitado: pedidos no SIGE/tabela <span className="font-mono">sales</span>, pedidos em <span className="font-mono">sales_raw_rows</span> e pedidos efetivamente lidos pela Análise via <span className="font-mono">useSalesData()</span>.
              </p>
              {sourcesQuery.error && <p className="mt-1 text-destructive">Falha ao consultar fontes: {(sourcesQuery.error as Error).message}</p>}
            </div>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {audits.map((audit) => {
            const missing = Array.from(audit.rawOrders.keys()).filter((code) => !audit.analysisOrders.has(code)).length
              + Array.from(audit.sigeOrders.keys()).filter((code) => !audit.rawOrders.has(code)).length;
            return (
              <div key={audit.target.id} className="rounded-lg border bg-muted/20 p-3">
                <p className="text-[10px] uppercase text-muted-foreground">{audit.target.label}</p>
                <p className="text-sm font-semibold">SIGE {audit.sigeOrders.size} · Raw {audit.rawOrders.size} · Análise {audit.analysisOrders.size}</p>
                <p className="text-xs text-muted-foreground">Última raw: {formatDateOnly(lastDate(audit.rawOrders.values()))}</p>
                <p className={missing > 0 ? "text-xs text-destructive font-medium" : "text-xs text-success font-medium"}>
                  {missing > 0 ? `${missing} diferença(s)` : "Sem descarte nesta consulta"}
                </p>
              </div>
            );
          })}
        </div>

        <div className="rounded-lg border overflow-auto max-h-[560px]">
          <Table>
            <TableHeader className="sticky top-0 bg-background z-10">
              <TableRow>
                <TableHead className="text-xs min-w-56">Cliente</TableHead>
                <TableHead className="text-xs">Código Pedido</TableHead>
                <TableHead className="text-xs">Data Pedido</TableHead>
                <TableHead className="text-xs">CNPJ</TableHead>
                <TableHead className="text-xs text-right">Valor</TableHead>
                <TableHead className="text-xs">Existe no SIGE?</TableHead>
                <TableHead className="text-xs">Existe em sales_raw_rows?</TableHead>
                <TableHead className="text-xs">Foi considerado?</TableHead>
                <TableHead className="text-xs min-w-72">Motivo da exclusão</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {audits.flatMap((audit) => {
                const codes = Array.from(new Set([
                  ...audit.sigeOrders.keys(),
                  ...audit.rawOrders.keys(),
                  ...audit.analysisOrders.keys(),
                ])).sort((a, b) => {
                  const da = new Date((audit.rawOrders.get(a) ?? audit.sigeOrders.get(a) ?? audit.analysisOrders.get(a))?.data ?? 0).getTime();
                  const db = new Date((audit.rawOrders.get(b) ?? audit.sigeOrders.get(b) ?? audit.analysisOrders.get(b))?.data ?? 0).getTime();
                  return db - da || b - a;
                });

                return codes.map((code) => {
                  const sige = audit.sigeOrders.has(code);
                  const raw = audit.rawOrders.has(code);
                  const considered = audit.analysisOrders.has(code);
                  const order = audit.rawOrders.get(code) ?? audit.sigeOrders.get(code) ?? audit.analysisOrders.get(code)!;
                  return (
                    <TableRow key={`${audit.target.id}-${code}`} className={!considered ? "bg-destructive/5" : undefined}>
                      <TableCell className="text-xs font-medium">{audit.target.label}</TableCell>
                      <TableCell className="text-xs font-mono">{code}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap">{formatDateTime(order.data)}</TableCell>
                      <TableCell className="text-xs font-mono">{order.cnpj || "—"}</TableCell>
                      <TableCell className="text-xs text-right whitespace-nowrap">R$ {order.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap">{yesNo(sige)}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap">{yesNo(raw)}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap">{yesNo(considered)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {!considered && <Database className="h-3 w-3 inline mr-1" />}
                        {exclusionReason(sige, raw, considered)}
                      </TableCell>
                    </TableRow>
                  );
                });
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}