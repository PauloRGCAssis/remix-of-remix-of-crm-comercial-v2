import { forwardRef } from "react";
import type { AcertoResult } from "@/lib/commissionCalc";
import { bonifCategoria } from "@/lib/commissionCalc";
import type { ComissaoEquipeResult } from "@/lib/comissaoEquipe";
import type { MetaLine } from "@/lib/commissionExport";
import { AcertoResumoDocument, type OutroCredito } from "./AcertoResumoDocument";

const fmt = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

interface Props {
  acerto: AcertoResult;
  yearMonth: string;
  pctPadrao: number;
  metas: MetaLine[];
  participaPremiacao?: boolean;
  metasAcumulativas?: boolean;
  ajudaCusto?: number;
  outrosCreditos?: OutroCredito[];
  comissaoEquipe?: ComissaoEquipeResult | null;
  tiposDescontoFaturamento: string[];
  tiposDescontoComissao: string[];
  variant?: "screen" | "document";
}

/**
 * PDF/Visualização "Completo": Resumo DRE + todas as tabelas detalhadas.
 * Usa exatamente os mesmos valores calculados que a tela e o PDF Resumo.
 */
export const AcertoCompletoDocument = forwardRef<HTMLDivElement, Props>(function AcertoCompletoDocument(
  {
    acerto,
    yearMonth,
    pctPadrao,
    metas,
    participaPremiacao,
    metasAcumulativas,
    ajudaCusto,
    outrosCreditos,
    comissaoEquipe = null,
    tiposDescontoFaturamento,
    tiposDescontoComissao,
    variant = "document",
  },
  ref
) {
  const isDoc = variant === "document";
  const rootStyle = isDoc ? { width: "794px", padding: "40px", background: "#ffffff", color: "#000" } : undefined;
  const rootClass = isDoc
    ? "mx-auto shadow-lg rounded-lg"
    : "bg-card text-foreground rounded-lg";

  const fatSet = new Set(tiposDescontoFaturamento);
  const comSet = new Set(tiposDescontoComissao);

  return (
    <div ref={ref} className={rootClass} style={rootStyle} data-pdf-source="acerto-completo">
      {/* Resumo (mesmo componente do PDF Resumo) */}
      <AcertoResumoDocument
        acerto={acerto}
        yearMonth={yearMonth}
        pctPadrao={pctPadrao}
        metas={metas}
        participaPremiacao={participaPremiacao}
        metasAcumulativas={metasAcumulativas}
        ajudaCusto={ajudaCusto}
        outrosCreditos={outrosCreditos}
        comissaoEquipe={comissaoEquipe}
        tiposDescontoFaturamento={tiposDescontoFaturamento}
        variant={variant}
      />

      {/* 1. Detalhamento de Vendas */}
      <Section title="1. Detalhamento de Vendas" isDoc={isDoc}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <Th>Data</Th>
              <Th>Cliente</Th>
              <Th>Produto</Th>
              <Th align="right">Qtd</Th>
              <Th align="right">Preço venda</Th>
              <Th align="right">Preço venda total</Th>
              <Th align="right">Com. %</Th>
              <Th align="right">Valor comissão</Th>
            </tr>
          </thead>
          <tbody>
            {acerto.vendasRows.map((r) => {
              const pct = r.pctComissao ?? pctPadrao;
              return (
                <tr key={r.id}>
                  <Td>{r.data ?? "—"}</Td>
                  <Td>{r.cliente}</Td>
                  <Td>{r.produto ?? "—"}</Td>
                  <Td align="right">{r.quantidade ?? "—"}</Td>
                  <Td align="right">{r.precoUnit != null ? fmt(r.precoUnit) : "—"}</Td>
                  <Td align="right">{fmt(r.valor)}</Td>
                  <Td align="right">{pct}%</Td>
                  <Td align="right">{fmt(r.valor * (pct / 100))}</Td>
                </tr>
              );
            })}
            <tr style={{ background: "#f3f4f6", fontWeight: 600 }}>
              <Td colSpan={5}>TOTAL</Td>
              <Td align="right">{fmt(acerto.faturamentoBruto)}</Td>
              <Td></Td>
              <Td align="right">{fmt(acerto.comissaoBruta + acerto.cortesia + acerto.descontoClienteTotal)}</Td>
            </tr>
          </tbody>
        </table>
      </Section>

      {/* 2. Bonificações */}
      <Section title="2. Bonificações" isDoc={isDoc}>
        {acerto.bonificacoesRows.length === 0 ? (
          <p style={{ fontSize: 11, color: "#6b7280" }}>Sem bonificações.</p>
        ) : (
          <table style={tableStyle}>
            <thead>
              <tr>
                <Th>Data</Th>
                <Th>Cliente</Th>
                <Th>Produto</Th>
                <Th>Categoria</Th>
                <Th align="right">Preço venda total</Th>
                <Th align="right">Custo</Th>
                <Th align="center">Desc. Fat.</Th>
                <Th align="center">Desc. Com.</Th>
              </tr>
            </thead>
            <tbody>
              {acerto.bonificacoesRows.map((r) => {
                const cat = bonifCategoria(r);
                return (
                  <tr key={r.id}>
                    <Td>{r.data ?? "—"}</Td>
                    <Td>{r.cliente}</Td>
                    <Td>{r.produto ?? "—"}</Td>
                    <Td>{cat}</Td>
                    <Td align="right">{r.precoVendaTotal != null ? fmt(r.precoVendaTotal) : "—"}</Td>
                    <Td align="right">{fmt(Number(r.custo ?? 0))}</Td>
                    <Td align="center">{fatSet.has(cat) ? "SIM" : "—"}</Td>
                    <Td align="center">{comSet.has(cat) ? "SIM" : "—"}</Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Section>

      {/* 3. Resumo por tipo de bonificação */}
      <Section title="3. Resumo por Tipo de Bonificação" isDoc={isDoc}>
        {acerto.bonificacoesResumoPorTipo.length === 0 ? (
          <p style={{ fontSize: 11, color: "#6b7280" }}>Sem bonificações.</p>
        ) : (
          <table style={tableStyle}>
            <thead>
              <tr>
                <Th>Categoria</Th>
                <Th align="right">Qtd. linhas</Th>
                <Th align="right">Total (Custo)</Th>
                <Th align="center">Desc. Fat.</Th>
                <Th align="center">Desc. Com.</Th>
              </tr>
            </thead>
            <tbody>
              {acerto.bonificacoesResumoPorTipo.map((b) => (
                <tr key={b.categoria}>
                  <Td>{b.categoria}</Td>
                  <Td align="right">{b.count}</Td>
                  <Td align="right">{fmt(b.total)}</Td>
                  <Td align="center">{fatSet.has(b.categoria) ? "SIM" : "—"}</Td>
                  <Td align="center">{comSet.has(b.categoria) ? "SIM" : "—"}</Td>
                </tr>
              ))}
              <tr style={{ background: "#f3f4f6", fontWeight: 600 }}>
                <Td colSpan={2}>TOTAL</Td>
                <Td align="right">
                  {fmt(acerto.bonificacoesResumoPorTipo.reduce((s, b) => s + b.total, 0))}
                </Td>
                <Td></Td>
                <Td></Td>
              </tr>
            </tbody>
          </table>
        )}
      </Section>

      {/* 4. Descontos de comissão por cliente */}
      <Section title="4. Descontos de Comissão por Cliente" isDoc={isDoc}>
        {acerto.descontosCliente.length === 0 ? (
          <p style={{ fontSize: 11, color: "#6b7280" }}>Sem descontos por cliente.</p>
        ) : (
          <table style={tableStyle}>
            <thead>
              <tr>
                <Th>Cliente</Th>
                <Th align="right">% Padrão</Th>
                <Th align="right">% Acordado</Th>
                <Th align="right">Diferença</Th>
                <Th align="right">Faturamento</Th>
                <Th align="right">Valor descontado</Th>
              </tr>
            </thead>
            <tbody>
              {acerto.descontosCliente.map((d) => (
                <tr key={d.cliente}>
                  <Td>{d.cliente}</Td>
                  <Td align="right">{d.pctPadrao}%</Td>
                  <Td align="right">{d.pctAcordado}%</Td>
                  <Td align="right">{d.pctDesconto.toFixed(1)}%</Td>
                  <Td align="right">{fmt(d.faturamentoCliente)}</Td>
                  <Td align="right">{fmt(d.valorDescontado)}</Td>
                </tr>
              ))}
              <tr style={{ background: "#f3f4f6", fontWeight: 600 }}>
                <Td colSpan={5}>TOTAL DESCONTADO</Td>
                <Td align="right">{fmt(acerto.descontoClienteTotal)}</Td>
              </tr>
            </tbody>
          </table>
        )}
      </Section>

      {/* 5. Descontos Manuais */}
      <Section title="5. Descontos Manuais" isDoc={isDoc}>
        {acerto.ajustesManuais.length === 0 ? (
          <p style={{ fontSize: 11, color: "#6b7280" }}>Sem descontos manuais.</p>
        ) : (
          <table style={tableStyle}>
            <thead>
              <tr>
                <Th>Descrição</Th>
                <Th>Cliente</Th>
                <Th>Observação</Th>
                <Th align="right">Valor</Th>
              </tr>
            </thead>
            <tbody>
              {acerto.ajustesManuais.map((a) => (
                <tr key={a.id}>
                  <Td>{a.descricao || "—"}</Td>
                  <Td>{a.cliente || "—"}</Td>
                  <Td>{a.observacao || "—"}</Td>
                  <Td align="right">{fmt(a.valor)}</Td>
                </tr>
              ))}
              <tr style={{ background: "#f3f4f6", fontWeight: 600 }}>
                <Td colSpan={3}>TOTAL</Td>
                <Td align="right">{fmt(acerto.ajustesManuaisTotal)}</Td>
              </tr>
            </tbody>
          </table>
        )}
      </Section>

      {/* 6. Ajuda de custo + outros créditos */}
      <Section title="6. Ajuda de Custo e Outros Créditos" isDoc={isDoc}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <Th>Descrição</Th>
              <Th align="right">Valor</Th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <Td>Ajuda de Custo</Td>
              <Td align="right">{fmt(Number(ajudaCusto ?? 0))}</Td>
            </tr>
            {comissaoEquipe && (
              <tr>
                <Td>{`Comissão Equipe (${comissaoEquipe.pct}%) — base ${fmt(comissaoEquipe.base)}`}</Td>
                <Td align="right">{fmt(comissaoEquipe.valor)}</Td>
              </tr>
            )}
            {(outrosCreditos ?? []).map((c) => (
              <tr key={c.id}>
                <Td>{c.descricao || "Outro crédito"}</Td>
                <Td align="right">{fmt(Number(c.valor ?? 0))}</Td>
              </tr>
            ))}
            <tr style={{ background: "#f3f4f6", fontWeight: 600 }}>
              <Td>TOTAL CRÉDITOS</Td>
              <Td align="right">
                {fmt(
                  Number(ajudaCusto ?? 0) +
                    Number(comissaoEquipe?.valor ?? 0) +
                    (outrosCreditos ?? []).reduce((s, c) => s + Number(c.valor ?? 0), 0)
                )}
              </Td>
            </tr>
          </tbody>
        </table>
      </Section>

      {isDoc && (
        <div style={{ marginTop: 24, paddingTop: 12, borderTop: "1px solid #e5e7eb", fontSize: 9, color: "#6b7280", display: "flex", justifyContent: "space-between" }}>
          <span>Documento completo — Pagamento Vendedores</span>
          <span>{new Date().toLocaleString("pt-BR")}</span>
        </div>
      )}
    </div>
  );
});

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 10,
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
};

function Section({ title, children, isDoc }: { title: string; children: React.ReactNode; isDoc: boolean }) {
  return (
    <div style={{ marginTop: 20, pageBreakInside: "auto" }}>
      <div
        style={{
          fontFamily: "system-ui, sans-serif",
          fontWeight: 700,
          fontSize: isDoc ? 13 : 14,
          borderBottom: "2px solid #111",
          paddingBottom: 4,
          marginBottom: 8,
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

function Th({ children, align }: { children: React.ReactNode; align?: "left" | "right" | "center" }) {
  return (
    <th
      style={{
        textAlign: align ?? "left",
        borderBottom: "1px solid #111",
        padding: "4px 6px",
        fontSize: 10,
        fontFamily: "system-ui, sans-serif",
        background: "#f9fafb",
      }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align,
  colSpan,
}: {
  children?: React.ReactNode;
  align?: "left" | "right" | "center";
  colSpan?: number;
}) {
  return (
    <td
      colSpan={colSpan}
      style={{
        textAlign: align ?? "left",
        borderBottom: "1px solid #e5e7eb",
        padding: "3px 6px",
        verticalAlign: "top",
      }}
    >
      {children}
    </td>
  );
}
