import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Target, Plus, Trash2, X } from "lucide-react";
import { MultiSelectFiltro } from "./MultiSelectFiltro";
import { useSalesData, shortVendedorName } from "@/hooks/useSalesData";
import { normalizeClientName } from "@/lib/clientNameNormalization";

const R$ = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0, maximumFractionDigits: 0 });

type Faixa = { cresc: number; bonus: number };
const dayKey = (d: Date) => d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();

export function MetaClienteTab({ vendedorFiltro }: { vendedorFiltro?: string }) {
  const { data: sales } = useSalesData();
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const lastDay = new Date(year, month + 1, 0).getDate();

  const [diasRestantes, setDiasRestantes] = useState(Math.max(1, lastDay - today.getDate()));
  const [periodo, setPeriodo] = useState("3");
  const [base, setBase] = useState<"fat" | "kg">("fat");
  const [clientesSel, setClientesSel] = useState<string[]>([]);
  const [vendedoresSel, setVendedoresSel] = useState<string[]>([]);
  const [metaManual, setMetaManual] = useState<Record<string, number>>({});
  const [faixas, setFaixas] = useState<Faixa[]>([
    { cresc: 20, bonus: 5 },
    { cresc: 50, bonus: 10 },
    { cresc: 100, bonus: 15 },
    { cresc: 150, bonus: 20 },
  ]);
  const [faixaSel, setFaixaSel] = useState(1);
  const [crescCliente, setCrescCliente] = useState<Record<string, number>>({});
  const [bonusPctCliente, setBonusPctCliente] = useState<Record<string, number>>({});

  const vendShort = vendedorFiltro ? shortVendedorName(vendedorFiltro) : "";

  const linhas = useMemo(() => {
    if (!sales) return [];
    const nMeses = Number(periodo);
    const n = Math.max(1, Math.min(31, diasRestantes));
    // Janelas: últimos N dias de cada mês analisado (mesma condição de dias restantes)
    const janelas: [number, number][] = [];
    for (let i = 1; i <= nMeses; i++) {
      const y = new Date(year, month - i, 1).getFullYear();
      const m = new Date(year, month - i, 1).getMonth();
      const ld = new Date(y, m + 1, 0).getDate();
      const ini = Math.max(1, ld - n + 1);
      janelas.push([y * 10000 + (m + 1) * 100 + ini, y * 10000 + (m + 1) * 100 + ld]);
    }
    const corte30 = new Date(today.getTime() - 30 * 86400000);
    const map = new Map<string, { nome: string; vendedor: string; soma: number; somaR: number; somaKg: number; ativo: boolean; ultima: number }>();
    for (const s of sales) {
      const vend = shortVendedorName(s.vendedor);
      if (vendShort && vend !== vendShort) continue;
      const d = new Date(s.data);
      const key = normalizeClientName(s.cliente);
      let e = map.get(key);
      if (!e) { e = { nome: s.cliente, vendedor: vend, soma: 0, somaR: 0, somaKg: 0, ativo: false, ultima: 0 }; map.set(key, e); }
      const t = d.getTime();
      if (t > e.ultima) { e.ultima = t; e.vendedor = vend; }
      if (d >= corte30 && d <= today) e.ativo = true;
      const k = dayKey(d);
      if (janelas.some(([a, b]) => k >= a && k <= b)) {
        const r = Number(s.preco_total) || 0, q = Number(s.quantidade) || 0;
        e.somaR += r; e.somaKg += q; e.soma += base === "kg" ? q : r;
      }
    }
    return [...map.entries()]
      .filter(([, e]) => e.ativo)
      .map(([key, e]) => {
        const media = e.soma / nMeses;
        return { key, nome: e.nome, vendedor: e.vendedor, media };
      })
      .sort((a, b) => b.media - a.media);
  }, [sales, periodo, diasRestantes, vendShort, year, month, base]);

  const isKg = base === "kg";
  const arred = (v: number) => (isKg ? Math.ceil(v - 1e-9) : Math.round(v));
  const fmtU = (v: number) => isKg ? `${Math.round(v).toLocaleString("pt-BR")} kg` : R$(v);
  const U = isKg ? "kg" : "R$";
  const faixaPadrao = faixas[Math.min(faixaSel, faixas.length - 1)] ?? { cresc: 0, bonus: 0 };
  const linhasEf = linhas.map((l) => {
    const cresc = crescCliente[l.key] ?? faixaPadrao.cresc;
    const bonusPct = bonusPctCliente[l.key] ?? faixaPadrao.bonus;
    const manual = metaManual[l.key] != null;
    const meta = manual ? metaManual[l.key] : arred(l.media * (1 + cresc / 100));
    const crescEf = manual && l.media > 0 ? (meta / l.media - 1) * 100 : cresc;
    const bonus = arred((meta * bonusPct) / 100);
    return { ...l, meta, cresc: crescEf, bonusPct, bonus, total: meta + bonus, manual,
      overCresc: crescCliente[l.key] != null || manual, overBonus: bonusPctCliente[l.key] != null };
  });
  const vendedorOpcoes = [...new Set(linhas.map((l) => l.vendedor))].sort().map((v) => ({ value: v, label: v }));
  const porVendedor = linhasEf.filter((l) => !vendedoresSel.length || vendedoresSel.includes(l.vendedor));
  const clienteOpcoes = porVendedor.map((l) => ({ value: l.key, label: l.nome, sub: l.vendedor }));
  const visiveis = porVendedor.filter((l) => !clientesSel.length || clientesSel.includes(l.key));
  const totalMeta = visiveis.reduce((s, l) => s + l.meta, 0);
  const totalMedia = visiveis.reduce((s, l) => s + l.media, 0);
  const totalBonus = visiveis.reduce((s, l) => s + l.bonus, 0);
  const totalEntregue = totalMeta + totalBonus;
  const setRec = (fn: typeof setCrescCliente, key: string, v: number | null) =>
    fn((p) => { const n = { ...p }; if (v == null || isNaN(v)) delete n[key]; else n[key] = v; return n; });
  const setMeta = (key: string, v: number | null) =>
    setMetaManual((p) => { const n = { ...p }; if (v == null || isNaN(v)) delete n[key]; else n[key] = arred(Math.max(0, v)); return n; });
  const setCresc = (key: string, v: number | null) => { setMeta(key, null); setRec(setCrescCliente, key, v); };
  const nomeDe = (k: string) => linhas.find((l) => l.key === k)?.nome ?? k;

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="p-3 grid grid-cols-2 md:grid-cols-6 gap-3 items-end">
          <label className="text-xs space-y-1"><span className="text-muted-foreground">Meta baseada em</span>
            <Select value={base} onValueChange={(v) => { setBase(v as "fat" | "kg"); setMetaManual({}); }}><SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="fat">Faturamento (R$)</SelectItem><SelectItem value="kg">Volume (kg)</SelectItem></SelectContent></Select></label>
          <label className="text-xs space-y-1"><span className="text-muted-foreground">Dias restantes</span>
            <Input type="number" min={1} max={31} className="h-8" value={diasRestantes} onChange={(e) => setDiasRestantes(Number(e.target.value) || 1)} /></label>
          <label className="text-xs space-y-1"><span className="text-muted-foreground">Período de análise</span>
            <Select value={periodo} onValueChange={setPeriodo}><SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
              <SelectContent>{["1", "3", "6", "12"].map((p) => <SelectItem key={p} value={p}>Últimos {p} {p === "1" ? "mês" : "meses"}</SelectItem>)}</SelectContent></Select></label>
          <label className="text-xs space-y-1"><span className="text-muted-foreground">Faixa padrão</span>
            <Select value={String(Math.min(faixaSel, faixas.length - 1))} onValueChange={(v) => setFaixaSel(Number(v))}><SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
              <SelectContent>{faixas.map((f, i) => <SelectItem key={i} value={String(i)}>+{f.cresc}% → {f.bonus}% bonif.</SelectItem>)}</SelectContent></Select></label>
          <div className="text-xs space-y-1"><span className="text-muted-foreground">Vendedor</span>
            <MultiSelectFiltro placeholderTodos="Todos os vendedores" opcoes={vendedorOpcoes} selecionados={vendedoresSel} onChange={setVendedoresSel} buscaPlaceholder="Buscar vendedor..." /></div>
          <div className="text-xs space-y-1"><span className="text-muted-foreground">Buscar cliente</span>
            <MultiSelectFiltro placeholderTodos="Todos os clientes" opcoes={clienteOpcoes} selecionados={clientesSel} onChange={setClientesSel} buscaPlaceholder="Digite parte do nome..." maxNomes={1} /></div>
          {clientesSel.length > 0 && (
            <div className="col-span-2 md:col-span-6 flex flex-wrap gap-1">
              {clientesSel.map((k) => (
                <Badge key={k} variant="secondary" className="gap-1 text-[11px]">{nomeDe(k)}
                  <button type="button" onClick={() => setClientesSel(clientesSel.filter((x) => x !== k))}><X className="h-3 w-3" /></button></Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          ["Clientes ativos (30d)", String(visiveis.length)],
          [`Base histórica total (${U})`, fmtU(totalMedia)],
          [`Total metas (${U})`, fmtU(totalMeta)],
          [`Bonificação total (${U})`, fmtU(totalBonus)],
          [`Total entregue (${U})`, fmtU(totalEntregue)],
        ].map(([l, v]) => (
          <Card key={l}><CardContent className="p-3"><p className="text-[11px] text-muted-foreground">{l}</p><p className="text-lg font-semibold">{v}</p></CardContent></Card>
        ))}
      </div>
      <Card>
        <CardHeader className="py-2 px-3"><CardTitle className="text-sm">Faixas de Crescimento e Bonificação</CardTitle></CardHeader>
        <CardContent className="px-3 pb-3 space-y-2">
          {faixas.map((f, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2 text-xs">
              <span>Crescimento exigido +</span>
              <Input type="number" className="h-7 w-20" value={f.cresc} onChange={(e) => setFaixas(faixas.map((x, j) => j === i ? { ...x, cresc: Number(e.target.value) || 0 } : x))} />
              <span>% → Bonificação de</span>
              <Input type="number" className="h-7 w-20" value={f.bonus} onChange={(e) => setFaixas(faixas.map((x, j) => j === i ? { ...x, bonus: Number(e.target.value) || 0 } : x))} />
              <span>% sobre o pedido</span>
              <Button size="icon" variant="ghost" className="h-7 w-7" disabled={faixas.length <= 1} onClick={() => { setFaixas(faixas.filter((_, j) => j !== i)); if (faixaSel >= i && faixaSel > 0) setFaixaSel(faixaSel - 1); }}><Trash2 className="h-3.5 w-3.5" /></Button>
            </div>
          ))}
          <Button size="sm" variant="outline" className="h-7" onClick={() => setFaixas([...faixas, { cresc: 50, bonus: 10 }])}><Plus className="h-3.5 w-3.5 mr-1" />Faixa</Button>
          <p className="text-[11px] text-muted-foreground">
            A bonificação é calculada sobre o pedido que atinge a meta (não sobre a média). Ex.: base 20 kg, +50% → meta 30 kg; 10% de 30 kg = 3 kg; total entregue 33 kg.
            {isKg && " Em kg, meta e bonificação são arredondadas para cima (pacotes de 1 kg)."} Crescimento % e Bonificação % podem ser alterados por cliente na tabela.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0 max-h-[600px] overflow-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-muted z-10">
              <tr className="text-left">
                <th className="p-2 sticky left-0 z-20 bg-muted border-r border-border">Cliente</th><th className="p-2">Vendedor</th>
                <th className="p-2 text-right">Base histórica ({U}, {diasRestantes}d finais)</th>
                <th className="p-2 text-right">Crescimento exigido (%)</th>
                <th className="p-2 text-right">Meta ({U})</th>
                <th className="p-2 text-right">Bonificação (%)</th>
                <th className="p-2 text-right">Bonificação ({U})</th>
                <th className="p-2 text-right">Total entregue ({U})</th>
              </tr>
            </thead>
            <tbody>
              {visiveis.map((l) => (
                <tr key={l.key} className="border-t hover:bg-muted/40">
                  <td className="p-2 font-medium sticky left-0 z-[5] bg-card border-r border-border">{l.nome}{l.media === 0 && <Badge variant="outline" className="ml-1 text-[10px]">sem histórico</Badge>}</td>
                  <td className="p-2">{l.vendedor}</td>
                  <td className="p-2 text-right whitespace-nowrap">{fmtU(l.media)}</td>
                  <td className="p-2 text-right whitespace-nowrap">
                    <Input type="number" className={`h-7 w-20 inline-flex text-right ${l.overCresc ? "border-warning" : ""}`} value={Number(l.cresc.toFixed(1))}
                      onChange={(e) => setCresc(l.key, e.target.value === "" ? null : Number(e.target.value))} /><span className="text-[10px] text-muted-foreground ml-1">%</span>
                    {l.overCresc && <button type="button" title="Voltar à faixa padrão" className="ml-1" onClick={() => setCresc(l.key, null)}><X className="h-3 w-3 text-muted-foreground" /></button>}
                  </td>
                  <td className="p-2 text-right font-semibold whitespace-nowrap"><Target className={`h-3 w-3 inline mr-1 ${l.manual ? "text-warning" : "text-primary"}`} />
                    <Input type="number" className="h-7 w-24 inline-flex text-right" value={Math.round(l.meta)}
                      onChange={(e) => setMeta(l.key, e.target.value === "" ? null : Number(e.target.value))} /><span className="text-[10px] text-muted-foreground ml-1">{U}</span></td>
                  <td className="p-2 text-right whitespace-nowrap">
                    <Input type="number" className={`h-7 w-20 inline-flex text-right ${l.overBonus ? "border-warning" : ""}`} value={l.bonusPct}
                      onChange={(e) => setRec(setBonusPctCliente, l.key, e.target.value === "" ? null : Number(e.target.value))} /><span className="text-[10px] text-muted-foreground ml-1">%</span>
                    {l.overBonus && <button type="button" title="Voltar à faixa padrão" className="ml-1" onClick={() => setRec(setBonusPctCliente, l.key, null)}><X className="h-3 w-3 text-muted-foreground" /></button>}
                  </td>
                  <td className="p-2 text-right whitespace-nowrap">{fmtU(l.bonus)}</td>
                  <td className="p-2 text-right font-semibold whitespace-nowrap">{fmtU(l.total)}</td>
                </tr>
              ))}
              {visiveis.length === 0 && <tr><td colSpan={8} className="p-4 text-center text-muted-foreground">Nenhum cliente ativo nos últimos 30 dias.</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
