import React, { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TrendingUp, TrendingDown, Minus, ChevronDown, ChevronRight } from "lucide-react";
import { useSalesData } from "@/hooks/useSalesData";
import { useClientProfiles } from "@/hooks/useClientProfiles";
import { useDegustacoes } from "@/hooks/useDegustacoes";
import { useCustoProdutos } from "@/hooks/useCustoProdutos";
import { useBonificacaoRows } from "@/hooks/useBonificacoes";

import { computeAcaoResultado, type AcaoResultado, type DegustacaoVinculada } from "@/lib/acaoResultado";
import { diasRestantes, type CommercialAction } from "@/hooks/useCommercialActions";
import { STATUS_CLASS } from "@/components/acoes/ClienteAcoesComerciais";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell, CartesianGrid } from "recharts";

const money = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const kgFmt = (n: number) => `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} kg`;
const pctFmt = (v: number | null) => (v == null ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`);
const signed = (v: number, f: (n: number) => string) => `${v >= 0 ? "+" : "-"}${f(Math.abs(v))}`;
const int = (n: number) => String(Math.round(n));
const dec = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const dataBr = (iso: string) => iso.split("-").reverse().join("/");

export function useAcaoResultado(action: CommercialAction | null): {
  resultado: AcaoResultado | null;
  loading: boolean;
} {
  const { data: sales = [], isLoading } = useSalesData();
  const { data: profiles = [] } = useClientProfiles();
  const { list } = useDegustacoes();
  const { index: custoProdutos } = useCustoProdutos();
  const { data: bonifRows = [] } = useBonificacaoRows();
  const degustacoes = list.data ?? [];

  const resultado = useMemo(() => {
    if (!action) return null;
    const profile = profiles.find((p) => p.id === action.client_profile_id);
    const vinculadas: DegustacaoVinculada[] = action.possui_degustacoes
      ? degustacoes
          .filter((d) => (action.degustacao_ids ?? []).includes(d.id))
          .map((d) => ({
            id: d.id,
            cliente: d.cliente,
            data: d.data,
            promotora: d.promotora,
            promotoras: d.promotoras,
            produtos: (d.produtos ?? []).map((p) => ({
              produto_id: p.produto_id,
              nome: p.nome,
              quantidade: Number(p.quantidade) || 0,
            })),
          }))
      : [];
    return computeAcaoResultado(action, sales, {
      cnpj: profile?.cnpj ?? null,
      extraNames: [profile?.nome ?? "", profile?.nome_fantasia ?? ""].filter(Boolean),
      degustacoes: vinculadas,
      custoProdutos,
      bonificacoesConcedidas: bonifRows.map((b) => ({
        cliente: b.cliente,
        cnpj_cpf: b.cnpj_cpf ?? null,
        data: b.data ?? null,
        produto: b.produto,
        quantidade: Number(b.quantidade) || 0,
        custo: Number(b.custo) || 0,
      })),
    });
  }, [action, sales, profiles, degustacoes, custoProdutos, bonifRows]);

  return { resultado, loading: isLoading };
}


function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-md border border-border p-3">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-lg font-bold font-heading mt-0.5">{value}</p>
      {hint && <p className="text-[11px] text-muted-foreground mt-0.5">{hint}</p>}
    </div>
  );
}

function Delta({ value, children }: { value: number | null; children: React.ReactNode }) {
  const tone =
    value == null || Math.abs(value) < 0.01
      ? "text-muted-foreground"
      : value > 0
        ? "text-success"
        : "text-destructive";
  const Icon = value == null || Math.abs(value) < 0.01 ? Minus : value > 0 ? TrendingUp : TrendingDown;
  return (
    <span className={`inline-flex items-center gap-1 font-medium ${tone}`}>
      <Icon className="h-3.5 w-3.5" />
      {children}
    </span>
  );
}

interface Props {
  action: CommercialAction;
  compact?: boolean;
}

export function AcaoResultadoPanel({ action, compact = false }: Props) {
  const { resultado, loading } = useAcaoResultado(action);
  const [auditOpen, setAuditOpen] = useState(false);

  if (loading || !resultado) {
    return <p className="text-sm text-muted-foreground">Calculando resultado a partir das vendas…</p>;
  }

  const {
    durante,
    comparativos,
    referencia,
    roi,
    conclusao,
    serieMensal,
    auditoria,
    degustacoes,
    vinculo,
    bonificacaoPercentual,
  } = resultado;
  const dias = diasRestantes(action.data_fim);
  const encerrada = action.status === "Encerrada" || action.status === "Cancelada";
  const tomClass =
    conclusao.tom === "positivo"
      ? "border-success/40 bg-success/5"
      : conclusao.tom === "negativo"
        ? "border-destructive/40 bg-destructive/5"
        : "border-border bg-muted/40";

  return (
    <div className="space-y-4">
      <section className="space-y-2">
        <p className="text-sm font-semibold">Resultado da Ação</p>
        <div className={`grid gap-2 ${compact ? "grid-cols-2 md:grid-cols-3" : "grid-cols-2 md:grid-cols-3 lg:grid-cols-6"}`}>
          <Stat label="Faturamento" value={money(durante.faturamento)} hint={`${durante.dias} dia(s) de ação`} />
          <Stat label="Kg vendidos" value={kgFmt(durante.kg)} />
          <Stat label="Pedidos" value={int(durante.pedidos)} hint="Códigos de venda distintos" />
          <Stat label="Itens/linhas vendidos" value={int(durante.itens)} />
          <Stat label="Ticket médio" value={money(durante.ticketMedio)} hint="Por pedido" />
          <div className="rounded-md border border-border p-3">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Status</p>
            <Badge variant="outline" className={`mt-1 ${STATUS_CLASS[action.status]}`}>{action.status}</Badge>
            <p className="text-[11px] text-muted-foreground mt-1">
              {encerrada ? "Ação finalizada" : dias < 0 ? "Vencida" : `${dias} dia(s) restantes`}
            </p>
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Vendas localizadas por{" "}
          {vinculo.tipo === "cnpj" ? "CNPJ/CPF do cliente" : vinculo.tipo === "nome" ? "nome do cliente" : "—"}
          {vinculo.tipo !== "nenhum" ? ` (${vinculo.valor})` : ""}. Valores somados diretamente da planilha
          importada, sem ajustes.
        </p>
      </section>

      <section className="space-y-2">
        <p className="text-sm font-semibold">Comparativo automático</p>
        <div className="sheet-table overflow-x-auto rounded-md border border-border">
          <table className="w-full text-xs">
            <thead className="bg-muted">
              <tr className="text-left">
                <th className="px-2 py-1.5 font-medium">Período</th>
                <th className="px-2 py-1.5 font-medium text-right">Faturamento</th>
                <th className="px-2 py-1.5 font-medium text-right">Kg</th>
                <th className="px-2 py-1.5 font-medium text-right">Pedidos</th>
                <th className="px-2 py-1.5 font-medium text-right">Preço médio/kg</th>
                <th className="px-2 py-1.5 font-medium text-right">Ticket médio</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-border bg-primary/5">
                <td className="px-2 py-1.5 font-medium">Durante a ação</td>
                <td className="px-2 py-1.5 text-right">{money(durante.faturamento)}</td>
                <td className="px-2 py-1.5 text-right">{kgFmt(durante.kg)}</td>
                <td className="px-2 py-1.5 text-right">{int(durante.pedidos)}</td>
                <td className="px-2 py-1.5 text-right">{money(durante.precoMedioKg)}</td>
                <td className="px-2 py-1.5 text-right">{money(durante.ticketMedio)}</td>
              </tr>
              {comparativos.map((c) => (
                <tr key={c.label} className="border-t border-border">
                  <td className="px-2 py-1.5">
                    {c.label}
                    {c.base && (
                      <span className="text-muted-foreground">
                        {" "}
                        ({dataBr(c.base.inicio)} a {dataBr(c.base.fim)})
                      </span>
                    )}
                  </td>
                  {c.base ? (
                    <>
                      <td className="px-2 py-1.5 text-right">{money(c.base.faturamento)}</td>
                      <td className="px-2 py-1.5 text-right">{kgFmt(c.base.kg)}</td>
                      <td className="px-2 py-1.5 text-right">
                        {c.media ? dec(c.base.pedidos) : int(c.base.pedidos)}
                      </td>
                      <td className="px-2 py-1.5 text-right">{money(c.base.precoMedioKg)}</td>
                      <td className="px-2 py-1.5 text-right">{money(c.base.ticketMedio)}</td>
                    </>
                  ) : (
                    <td className="px-2 py-1.5 text-muted-foreground" colSpan={5}>
                      Sem histórico neste período.
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Meses completos, sem ajuste proporcional. Nas médias, "Média de pedidos" pode ter casa decimal.
        </p>
      </section>

      <section className="space-y-2">
        <p className="text-sm font-semibold">
          Indicadores{referencia ? ` — vs. ${referencia.label.toLowerCase()}` : ""}
        </p>
        {referencia ? (
          <div className="grid gap-2 grid-cols-2 md:grid-cols-4">
            <Card className="p-3">
              <p className="text-[11px] uppercase text-muted-foreground">Crescimento %</p>
              <Delta value={referencia.pctFaturamento}>{pctFmt(referencia.pctFaturamento)}</Delta>
            </Card>
            <Card className="p-3">
              <p className="text-[11px] uppercase text-muted-foreground">Faturamento</p>
              <Delta value={referencia.deltaFaturamento}>{signed(referencia.deltaFaturamento, money)}</Delta>
            </Card>
            <Card className="p-3">
              <p className="text-[11px] uppercase text-muted-foreground">Volume</p>
              <Delta value={referencia.deltaKg}>{signed(referencia.deltaKg, kgFmt)}</Delta>
            </Card>
            <Card className="p-3">
              <p className="text-[11px] uppercase text-muted-foreground">
                {referencia.media ? "Média de pedidos" : "Pedidos"}
              </p>
              <Delta value={referencia.deltaPedidos}>
                {signed(referencia.deltaPedidos, (n) =>
                  referencia.media ? `${dec(n)} pedidos` : `${int(n)} pedidos`,
                )}
              </Delta>
            </Card>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Sem base histórica suficiente para comparar.</p>
        )}
      </section>

      {degustacoes.length > 0 && (
        <section className="space-y-2">
          <p className="text-sm font-semibold">Degustações vinculadas</p>
          <div className="sheet-table overflow-x-auto rounded-md border border-border">
            <table className="w-full text-xs">
              <thead className="bg-muted">
                <tr className="text-left">
                  <th className="px-2 py-1.5 font-medium">Data</th>
                  <th className="px-2 py-1.5 font-medium">Loja</th>
                  <th className="px-2 py-1.5 font-medium">Promotoras</th>
                  <th className="px-2 py-1.5 font-medium">Produtos</th>
                  <th className="px-2 py-1.5 font-medium text-right">Kg</th>
                  <th className="px-2 py-1.5 font-medium text-right">Custo produtos</th>
                  <th className="px-2 py-1.5 font-medium text-right">Promotoras (R$)</th>
                  <th className="px-2 py-1.5 font-medium text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {degustacoes.map((d) => (
                  <React.Fragment key={d.id}>
                    <tr className="border-t border-border">
                      <td className="px-2 py-1.5 whitespace-nowrap">{dataBr(d.data)}</td>
                      <td className="px-2 py-1.5">{d.loja}</td>
                      <td className="px-2 py-1.5">
                        {d.promotoras.length ? (
                          <div className="space-y-0.5">
                            {d.promotoras.map((p, i) => (
                              <div key={i} className="whitespace-nowrap">
                                {p.nome || `Promotora ${i + 1}`} — {money(p.valor)}
                              </div>
                            ))}
                            {d.promotoras.length > 1 && (
                              <div className="text-[11px] text-muted-foreground">
                                {d.promotoras.length} promotoras
                              </div>
                            )}
                          </div>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-2 py-1.5 max-w-[280px] truncate" title={d.produtos}>{d.produtos || "—"}</td>
                      <td className="px-2 py-1.5 text-right">{kgFmt(d.kg)}</td>
                      <td className="px-2 py-1.5 text-right">{money(d.custoProdutos)}</td>
                      <td className="px-2 py-1.5 text-right">{money(d.custoPromotora)}</td>
                      <td className="px-2 py-1.5 text-right font-medium">{money(d.total)}</td>
                    </tr>
                    {d.itens.map((i, idx) => (
                      <tr key={`${d.id}-${idx}`} className="text-[11px] text-muted-foreground">
                        <td />
                        <td className="px-2 pb-1" colSpan={3}>
                          ↳ {i.nome}
                          {i.custoKg == null ? " — sem custo cadastrado" : ` — ${money(i.custoKg)}/kg`}
                        </td>
                        <td className="px-2 pb-1 text-right">{kgFmt(i.quantidade)}</td>
                        <td className="px-2 pb-1 text-right">{i.custoKg == null ? "—" : money(i.total)}</td>
                        <td colSpan={2} />
                      </tr>
                    ))}
                  </React.Fragment>
                ))}

              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="space-y-2">
        <p className="text-sm font-semibold">Investimento e ROI</p>
        <div className="grid gap-2 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
          <Stat label="Investimento" value={money(roi.investimento)} />
          <Stat
            label="Bonificação (R$)"
            value={money(roi.bonificacao)}
            hint={roi.bonificacaoKg ? `${kgFmt(roi.bonificacaoKg)} × custo médio` : undefined}
          />
          <Stat
            label="Custo produtos degustados"
            value={money(roi.custoDegustacoes)}
            hint={
              roi.kgDegustados
                ? `${kgFmt(roi.kgDegustados)} · ${roi.custoMedioKg == null ? "—" : `${money(roi.custoMedioKg)}/kg`}`
                : undefined
            }
          />
          <Stat label="Promotoras" value={money(roi.custoPromotoras)} />
          <Stat label="Outros custos" value={money(roi.outrosCustos)} />
          <Stat label="Investimento total" value={money(roi.custo)} hint="Soma de todos os custos" />
        </div>
        <div className="grid gap-2 grid-cols-2 md:grid-cols-3">
          <Stat label="Faturamento no período" value={money(roi.resultado)} />
          <Stat label="Retorno (ganho de faturamento)" value={signed(roi.retorno, money)} hint="Vs. referência" />
          <div className="rounded-md border border-border p-3">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">ROI</p>
            <p className="text-lg font-bold font-heading mt-0.5">
              <Delta value={roi.roi}>{pctFmt(roi.roi)}</Delta>
            </p>
          </div>
        </div>
        {roi.custoIncompleto && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-[11px] text-destructive">
            <p className="font-medium">Custo da degustação incompleto</p>
            {roi.produtosSemCusto.map((p) => (
              <p key={p}>Produto sem custo cadastrado: {p}</p>
            ))}
            <p className="mt-1">O investimento total está incompleto até o custo ser cadastrado.</p>
          </div>
        )}

      </section>

      {bonificacaoPercentual && (
        <section className="space-y-2">
          <p className="text-sm font-semibold">
            Bonificação percentual ({dec(bonificacaoPercentual.percentual)}% do volume vendido)
          </p>
          <div className="grid gap-2 grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
            <Stat label="Volume vendido" value={kgFmt(bonificacaoPercentual.kgVendidos)} />
            <Stat label="Bonificação prevista" value={kgFmt(bonificacaoPercentual.kgPrevisto)} />
            <Stat
              label="Bonificação concedida"
              value={
                bonificacaoPercentual.kgConcedido == null
                  ? "—"
                  : kgFmt(bonificacaoPercentual.kgConcedido)
              }
              hint="Planilha de bonificações"
            />
            <div className="rounded-md border border-border p-3">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Divergência</p>
              <p className="text-lg font-bold font-heading mt-0.5">
                {bonificacaoPercentual.diferencaKg == null ? (
                  "—"
                ) : (
                  <Delta value={bonificacaoPercentual.diferencaKg}>
                    {signed(bonificacaoPercentual.diferencaKg, kgFmt)}
                  </Delta>
                )}
              </p>
            </div>
            <Stat
              label="Custo da bonificação"
              value={money(
                bonificacaoPercentual.custoConcedido > 0
                  ? bonificacaoPercentual.custoConcedido
                  : bonificacaoPercentual.custoPrevisto,
              )}
              hint={
                bonificacaoPercentual.custoKg == null
                  ? "sem custo cadastrado"
                  : `${money(bonificacaoPercentual.custoKg)}/kg`
              }
            />
          </div>
          {bonificacaoPercentual.produtos.length > 0 && (
            <div className="text-[11px] text-muted-foreground">
              {bonificacaoPercentual.produtos.map((p) => (
                <p key={p}>↳ {p}</p>
              ))}
            </div>
          )}
          {bonificacaoPercentual.produtosSemCusto.length > 0 && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-[11px] text-destructive">
              <p className="font-medium">Produtos sem custo cadastrado</p>
              {bonificacaoPercentual.produtosSemCusto.slice(0, 6).map((p) => (
                <p key={p}>↳ {p}</p>
              ))}
            </div>
          )}
        </section>
      )}

      <section className="space-y-2">
        <p className="text-sm font-semibold">Conclusão automática</p>
        <div className={`rounded-md border p-3 text-sm ${tomClass}`}>{conclusao.texto}</div>
      </section>

      <section className="space-y-2">
        <Button variant="outline" size="sm" onClick={() => setAuditOpen((v) => !v)}>
          {auditOpen ? <ChevronDown className="h-4 w-4 mr-1" /> : <ChevronRight className="h-4 w-4 mr-1" />}
          Auditoria — {auditoria.length} linha(s) usada(s) no cálculo
        </Button>
        {auditOpen && (
          <div className="sheet-table max-h-80 overflow-auto rounded-md border border-border">
            <table className="w-full text-xs">
              <thead className="bg-muted sticky top-0">
                <tr className="text-left">
                  <th className="px-2 py-1.5 font-medium">Código Venda</th>
                  <th className="px-2 py-1.5 font-medium">Data</th>
                  <th className="px-2 py-1.5 font-medium">Cliente</th>
                  <th className="px-2 py-1.5 font-medium">CNPJ/CPF</th>
                  <th className="px-2 py-1.5 font-medium">Produto</th>
                  <th className="px-2 py-1.5 font-medium text-right">Quantidade</th>
                  <th className="px-2 py-1.5 font-medium text-right">Preço Venda Total</th>
                </tr>
              </thead>
              <tbody>
                {auditoria.map((r) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="px-2 py-1.5">{r.codigo_venda}</td>
                    <td className="px-2 py-1.5 whitespace-nowrap">{dataBr(r.data)}</td>
                    <td className="px-2 py-1.5">{r.cliente}</td>
                    <td className="px-2 py-1.5">{r.cnpj_cpf ?? "—"}</td>
                    <td className="px-2 py-1.5">{r.descricao}</td>
                    <td className="px-2 py-1.5 text-right">{r.quantidade}</td>
                    <td className="px-2 py-1.5 text-right">{money(r.preco_total)}</td>
                  </tr>
                ))}
                {auditoria.length === 0 && (
                  <tr>
                    <td className="px-2 py-3 text-muted-foreground" colSpan={7}>
                      Nenhuma venda encontrada no período para este cliente.
                    </td>
                  </tr>
                )}
              </tbody>
              <tfoot className="bg-muted/60">
                <tr className="border-t border-border font-medium">
                  <td className="px-2 py-1.5" colSpan={5}>
                    Total — {int(durante.pedidos)} pedido(s), {auditoria.length} item(ns)
                  </td>
                  <td className="px-2 py-1.5 text-right">{dec(durante.kg)}</td>
                  <td className="px-2 py-1.5 text-right">{money(durante.faturamento)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      {serieMensal.length > 0 && (
        <section className="space-y-2">
          <p className="text-sm font-semibold">Evolução do faturamento (antes, durante e depois)</p>
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={serieMensal} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`} />
                <Tooltip formatter={(v: any) => money(Number(v))} />
                <Bar dataKey="faturamento" radius={[4, 4, 0, 0]}>
                  {serieMensal.map((d) => (
                    <Cell
                      key={d.mes}
                      className={
                        d.fase === "durante"
                          ? "fill-primary"
                          : d.fase === "antes"
                            ? "fill-muted-foreground/50"
                            : "fill-accent"
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}
    </div>
  );
}
