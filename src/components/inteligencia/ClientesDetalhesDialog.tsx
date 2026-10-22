import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FileSpreadsheet, X, Search } from "lucide-react";
import type { SaleRow } from "@/hooks/useSalesData";
import { cleanProductName, shortVendedorName } from "@/hooks/useSalesData";
import { useClientProfiles } from "@/hooks/useClientProfiles";
import { normalizeClientName } from "@/lib/clientNameNormalization";
import { formatProductDisplay } from "@/lib/productDisplay";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tipo: "novos" | "perdidos";
  clientes: string[]; // canonical names
  baseSales: SaleRow[]; // already filtered by current page filters
  canonCliente: (raw: string) => string;
  inicio: string;
  fim: string;
  cStart: string;
  cEnd: string;
}

const R$ = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (s: string) => {
  if (!s) return "—";
  const d = s.slice(0, 10);
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
};

function normKey(s: string) {
  return normalizeClientName(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function ClientesDetalhesDialog({
  open, onOpenChange, tipo, clientes, baseSales, canonCliente, inicio, fim, cStart, cEnd,
}: Props) {
  const [busca, setBusca] = useState("");
  const { data: profiles = [] } = useClientProfiles();

  const profileByKey = useMemo(() => {
    const m = new Map<string, { cidade?: string; bairro?: string; vendedor?: string }>();
    for (const p of profiles as any[]) {
      const k = normKey(p.nome ?? "");
      if (k) m.set(k, { cidade: p.cidade, bairro: p.bairro, vendedor: p.vendedor });
      const kf = normKey(p.nome_fantasia ?? "");
      if (kf && !m.has(kf)) m.set(kf, { cidade: p.cidade, bairro: p.bairro, vendedor: p.vendedor });
    }
    return m;
  }, [profiles]);

  const rows = useMemo(() => {
    const set = new Set(clientes);
    const atual = new Map<string, { fat: number; first: string; last: string; vendedores: Map<string, number>; produtos: Map<string, number> }>();
    const comp = new Map<string, typeof atual extends Map<any, infer V> ? V : never>();
    const ensure = (m: Map<string, any>, c: string) => {
      let e = m.get(c);
      if (!e) { e = { fat: 0, first: "", last: "", vendedores: new Map(), produtos: new Map() }; m.set(c, e); }
      return e;
    };
    for (const r of baseSales) {
      const c = canonCliente(r.cliente);
      if (!set.has(c)) continue;
      const d = String(r.data).slice(0, 10);
      const target = (inicio && fim && d >= inicio && d <= fim)
        ? atual
        : (cStart && cEnd && d >= cStart && d <= cEnd) ? comp : null;
      if (!target) continue;
      const e = ensure(target, c);
      const valor = Number(r.preco_total) || 0;
      e.fat += valor;
      if (!e.first || d < e.first) e.first = d;
      if (!e.last || d > e.last) e.last = d;
      const v = shortVendedorName(r.vendedor);
      e.vendedores.set(v, (e.vendedores.get(v) ?? 0) + valor);
      const p = cleanProductName(r.descricao);
      if (p) e.produtos.set(p, (e.produtos.get(p) ?? 0) + valor);
    }

    const top = (m: Map<string, number>) => {
      let best = ""; let bv = -1;
      m.forEach((v, k) => { if (v > bv) { bv = v; best = k; } });
      return best;
    };

    const hoje = new Date();
    const out = clientes.map((c) => {
      const a = atual.get(c);
      const k = comp.get(c);
      const prof = profileByKey.get(normKey(c));
      if (tipo === "novos") {
        return {
          cliente: c,
          vendedor: a ? top(a.vendedores) : (prof?.vendedor ?? "—"),
          primeiraCompra: a?.first ?? "",
          valorPrimeiraCompra: a?.fat ?? 0,
          cidade: prof?.cidade ?? "",
          bairro: prof?.bairro ?? "",
        };
      } else {
        const ult = k?.last ?? "";
        let dias: number | null = null;
        if (ult) {
          const t = new Date(ult + "T00:00:00").getTime();
          dias = Math.max(0, Math.round((hoje.getTime() - t) / 86400000));
        }
        return {
          cliente: c,
          vendedor: k ? top(k.vendedores) : (prof?.vendedor ?? "—"),
          ultimaCompra: ult,
          valorPeriodoAnterior: k?.fat ?? 0,
          diasSemComprar: dias,
          produtoPrincipal: k ? top(k.produtos) : "—",
          cidade: prof?.cidade ?? "",
          bairro: prof?.bairro ?? "",
        } as any;
      }
    });
    return out;
  }, [clientes, baseSales, canonCliente, inicio, fim, cStart, cEnd, tipo, profileByKey]);

  const filtered = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r: any) =>
      String(r.cliente).toLowerCase().includes(q) ||
      String(r.vendedor ?? "").toLowerCase().includes(q) ||
      String(r.cidade ?? "").toLowerCase().includes(q) ||
      String(r.bairro ?? "").toLowerCase().includes(q),
    );
  }, [rows, busca]);

  const exportExcel = () => {
    const data = (filtered as any[]).map((r) => {
      if (tipo === "novos") {
        return {
          Cliente: r.cliente,
          Vendedor: r.vendedor,
          "Data da 1ª compra": r.primeiraCompra ? fmtDate(r.primeiraCompra) : "—",
          "Valor da 1ª compra (no período)": r.valorPrimeiraCompra,
          Cidade: r.cidade || "—",
          Bairro: r.bairro || "—",
        };
      }
      return {
        Cliente: r.cliente,
        Vendedor: r.vendedor,
        "Última compra": r.ultimaCompra ? fmtDate(r.ultimaCompra) : "—",
        "Valor no período anterior": r.valorPeriodoAnterior,
        "Dias sem comprar": r.diasSemComprar ?? "—",
        "Produto principal anterior": formatProductDisplay(r.produtoPrincipal) || "—",
        Cidade: r.cidade || "—",
        Bairro: r.bairro || "—",
      };
    });
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, tipo === "novos" ? "Clientes novos" : "Clientes perdidos");
    const today = new Date();
    const fname = `${tipo === "novos" ? "clientes_novos" : "clientes_perdidos"}_${String(today.getDate()).padStart(2, "0")}-${String(today.getMonth() + 1).padStart(2, "0")}-${today.getFullYear()}.xlsx`;
    XLSX.writeFile(wb, fname);
  };

  const titulo = tipo === "novos" ? "Clientes novos no período" : "Clientes que deixaram de comprar no período";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>{titulo} ({clientes.length})</DialogTitle>
          <DialogDescription>
            {tipo === "novos"
              ? "Clientes que compraram no período atual e não compravam no período comparado."
              : "Clientes que compraram no período comparado e não compraram no período atual."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="h-4 w-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar cliente, vendedor, cidade, bairro…"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="pl-8 h-9"
            />
          </div>
          <Button variant="outline" size="sm" onClick={exportExcel} className="border-amber-500/40 text-amber-700">
            <FileSpreadsheet className="h-4 w-4 mr-1" /> Exportar Excel
          </Button>
        </div>

        <div className="max-h-[55vh] overflow-auto border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Vendedor</TableHead>
                {tipo === "novos" ? (
                  <>
                    <TableHead>Data da 1ª compra</TableHead>
                    <TableHead className="text-right">Valor 1ª compra</TableHead>
                  </>
                ) : (
                  <>
                    <TableHead>Última compra</TableHead>
                    <TableHead className="text-right">Valor período anterior</TableHead>
                    <TableHead className="text-right">Dias sem comprar</TableHead>
                    <TableHead>Produto principal</TableHead>
                  </>
                )}
                <TableHead>Cidade / Bairro</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={tipo === "novos" ? 5 : 7} className="text-center text-muted-foreground py-6">
                    Nenhum cliente encontrado.
                  </TableCell>
                </TableRow>
              )}
              {(filtered as any[]).map((r, i) => (
                <TableRow key={i}>
                  <TableCell className="font-medium">{r.cliente}</TableCell>
                  <TableCell>{r.vendedor || "—"}</TableCell>
                  {tipo === "novos" ? (
                    <>
                      <TableCell>{r.primeiraCompra ? fmtDate(r.primeiraCompra) : "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{R$(r.valorPrimeiraCompra)}</TableCell>
                    </>
                  ) : (
                    <>
                      <TableCell>{r.ultimaCompra ? fmtDate(r.ultimaCompra) : "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{R$(r.valorPeriodoAnterior)}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.diasSemComprar ?? "—"}</TableCell>
                      <TableCell className="truncate max-w-[200px]" title={formatProductDisplay(r.produtoPrincipal)}>{formatProductDisplay(r.produtoPrincipal) || "—"}</TableCell>
                    </>
                  )}
                  <TableCell className="text-xs text-muted-foreground">
                    {(r.cidade || r.bairro) ? `${r.cidade || "—"}${r.bairro ? ` / ${r.bairro}` : ""}` : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            <X className="h-4 w-4 mr-1" /> Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
