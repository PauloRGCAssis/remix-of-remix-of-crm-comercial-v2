import { forwardRef } from "react";

/**
 * Relatório imprimível do Plano de Ação.
 *
 * IMPORTANTE: este componente NÃO calcula nada. Recebe exatamente os mesmos
 * valores já exibidos na tela (MetasAcaoPanel), garantindo que tela,
 * visualização, impressão e PDF nunca divirjam.
 *
 * Usa apenas estilos inline (sem classes Tailwind) para funcionar também
 * dentro de janela de impressão e no html2canvas.
 */

export interface PlanoAcaoReportMeta {
  nome: string;
  meta: number;
  realizado: number;
  falta: number;
  pctAtingido: number;
  batido: boolean;
  projetaBate: boolean;
  projecaoFechamento: number;
  excedenteProjetado: number;
  pctExcedenteProjetado: number;
  deficitProjetado: number;
  necessarioUnidade: number;
  pedidosUnidade: number;
}

export interface PlanoAcaoReportData {
  vendedorLabel: string;
  periodoLabel: string;
  faturamento: number;
  projecao: number;
  mediaDiariaAtual: number;
  ticketMedio: number;
  diasDecorridos: number;
  diasRestantes: number;
  unidadesRestantes: number;
  unidadeSingular: string;
  unidadePlural: string;
  isPorRotas: boolean;
  notaCalendario: string;
  explicacao: string;
  proximasDatas: string[];
  metas: PlanoAcaoReportMeta[];
  geradoEm: string;
}

const R$ = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });

const S = {
  page: {
    width: "780px",
    margin: "0 auto",
    background: "#ffffff",
    color: "#1f2937",
    fontFamily: "'DM Sans', Arial, Helvetica, sans-serif",
    padding: "24px",
    boxSizing: "border-box" as const,
  },
  h1: { fontSize: "19px", margin: 0, fontWeight: 700, color: "#7c4a03" },
  sub: { fontSize: "12px", margin: "2px 0 0", color: "#4b5563" },
  headerBox: {
    borderBottom: "2px solid #d97706",
    paddingBottom: "10px",
    marginBottom: "14px",
  },
  infoGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: "8px",
    marginBottom: "16px",
  },
  infoCell: {
    border: "1px solid #e5e7eb",
    borderRadius: "6px",
    padding: "8px",
    background: "#fafaf9",
  },
  infoLabel: { fontSize: "9px", textTransform: "uppercase" as const, color: "#6b7280", margin: 0 },
  infoValue: { fontSize: "13px", fontWeight: 700, margin: "2px 0 0", color: "#111827" },
  card: {
    border: "1px solid #e5e7eb",
    borderRadius: "8px",
    padding: "12px",
    marginBottom: "10px",
    pageBreakInside: "avoid" as const,
    breakInside: "avoid" as const,
  },
  cardTitle: { fontSize: "14px", fontWeight: 700, margin: 0, color: "#7c4a03" },
  row: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "6px", marginTop: "8px" },
  small: { fontSize: "11px", color: "#4b5563", margin: 0 },
  destaque: {
    marginTop: "8px",
    border: "1px solid #d97706",
    background: "#fffbeb",
    borderRadius: "8px",
    padding: "10px",
    textAlign: "center" as const,
  },
};

export const PlanoAcaoReport = forwardRef<HTMLDivElement, { data: PlanoAcaoReportData }>(
  ({ data }, ref) => {
    return (
      <div ref={ref} style={S.page}>
        <div style={S.headerBox}>
          <h1 style={S.h1}>Pão de Queijo Ti Delso — Plano de Ação Comercial</h1>
          <p style={S.sub}>
            Vendedor: <strong>{data.vendedorLabel}</strong> · Período de referência:{" "}
            <strong>{data.periodoLabel}</strong>
          </p>
          <p style={S.sub}>Gerado em {data.geradoEm}</p>
        </div>

        <div style={S.infoGrid}>
          <div style={S.infoCell}>
            <p style={S.infoLabel}>Faturamento realizado</p>
            <p style={S.infoValue}>{R$(data.faturamento)}</p>
          </div>
          <div style={S.infoCell}>
            <p style={S.infoLabel}>Projeção atual</p>
            <p style={S.infoValue}>{R$(data.projecao)}</p>
          </div>
          <div style={S.infoCell}>
            <p style={S.infoLabel}>Venda média diária atual</p>
            <p style={S.infoValue}>{R$(data.mediaDiariaAtual)}</p>
          </div>
          <div style={S.infoCell}>
            <p style={S.infoLabel}>Ticket médio atual</p>
            <p style={S.infoValue}>{R$(data.ticketMedio)}</p>
          </div>
        </div>

        <p style={{ ...S.small, marginBottom: "12px" }}>
          {data.diasDecorridos} dias úteis decorridos · {data.diasRestantes} restantes ·{" "}
          {data.unidadesRestantes} {data.unidadesRestantes === 1 ? data.unidadeSingular : data.unidadePlural}{" "}
          {data.isPorRotas ? "de rota restantes" : "operacionais restantes"}
          {data.isPorRotas && data.proximasDatas.length > 0
            ? ` · Próximas rotas: ${data.proximasDatas.join(", ")}`
            : ""}
        </p>

        <h2 style={{ fontSize: "14px", margin: "0 0 8px", color: "#111827" }}>
          {data.isPorRotas ? "Plano de Ação — Meta por rota" : "Plano de Ação — Meta diária por objetivo"}
        </h2>

        {data.metas.map((m) => (
          <div key={m.nome} style={S.card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <p style={S.cardTitle}>{m.nome}</p>
              <span style={{ fontSize: "11px", fontWeight: 700, color: m.batido ? "#15803d" : "#6b7280" }}>
                {m.batido ? "✓ Batida" : m.projetaBate ? "Projeção bate" : "Projeção não bate"}
              </span>
            </div>

            <div style={S.row}>
              <div style={S.infoCell}>
                <p style={S.infoLabel}>Meta</p>
                <p style={S.infoValue}>{R$(m.meta)}</p>
              </div>
              <div style={S.infoCell}>
                <p style={S.infoLabel}>Realizado</p>
                <p style={S.infoValue}>{R$(m.realizado)}</p>
              </div>
              <div style={S.infoCell}>
                <p style={S.infoLabel}>Falta</p>
                <p style={S.infoValue}>{m.batido ? "—" : R$(m.falta)}</p>
              </div>
              <div style={S.infoCell}>
                <p style={S.infoLabel}>% atingido</p>
                <p style={S.infoValue}>{m.pctAtingido.toFixed(0)}%</p>
              </div>
            </div>

            {!m.batido && m.projetaBate && (
              <div style={{ ...S.destaque, border: "1px solid #15803d", background: "#f0fdf4" }}>
                <p style={{ ...S.infoLabel, color: "#15803d" }}>Mantendo o ritmo atual, a meta é atingida</p>
                <p style={{ fontSize: "20px", fontWeight: 700, color: "#15803d", margin: "2px 0" }}>
                  ✓ {R$(m.projecaoFechamento)}
                </p>
                <p style={S.small}>
                  projeção de fechamento · acima da meta em <strong>{R$(m.excedenteProjetado)}</strong> (
                  {m.pctExcedenteProjetado.toFixed(1)}%) · {data.notaCalendario}
                </p>
              </div>
            )}

            {!m.batido && !m.projetaBate && (
              <div style={S.destaque}>
                <p style={{ ...S.infoLabel, color: "#b45309" }}>Você precisa faturar por {data.unidadeSingular}</p>
                <p style={{ fontSize: "22px", fontWeight: 700, color: "#b45309", margin: "2px 0" }}>
                  {R$(m.necessarioUnidade)}
                </p>
                <p style={S.small}>
                  nas próximas <strong>{data.unidadesRestantes}</strong>{" "}
                  {data.isPorRotas ? data.unidadePlural : "dias operacionais"} · {data.notaCalendario}
                </p>
              </div>
            )}

            <ul style={{ margin: "8px 0 0", paddingLeft: "16px", fontSize: "11px", color: "#374151" }}>
              {m.pedidosUnidade > 0 && (
                <li>
                  Aproximadamente <strong>{m.pedidosUnidade} pedidos/{data.unidadeSingular}</strong>
                </li>
              )}
              <li>Ticket médio atual: <strong>{R$(data.ticketMedio)}</strong></li>
              <li>Venda média atual por {data.unidadeSingular}: <strong>{R$(data.mediaDiariaAtual)}</strong></li>
              <li>Necessário por {data.unidadeSingular}: <strong>{R$(m.necessarioUnidade)}</strong></li>
              <li>Projeção de fechamento: <strong>{R$(m.projecaoFechamento)}</strong></li>
              <li>
                {m.projetaBate
                  ? <>Projetado acima da meta: <strong>{R$(m.excedenteProjetado)}</strong></>
                  : <>Diferença projetada até a meta: <strong>{R$(m.deficitProjetado)}</strong></>}
              </li>
              <li>
                {data.isPorRotas ? "Rotas restantes" : "Dias operacionais restantes"}:{" "}
                <strong>{data.unidadesRestantes}</strong>
              </li>
            </ul>


            {!m.batido && !m.projetaBate && (
              <p style={{ ...S.small, marginTop: "6px", background: "#f5f5f4", padding: "6px", borderRadius: "6px" }}>
                Para atingir a <strong>{m.nome}</strong>, é necessário faturar aproximadamente{" "}
                <strong>{R$(m.necessarioUnidade)}</strong> por {data.unidadeSingular} durante as próximas{" "}
                <strong>
                  {data.unidadesRestantes} {data.unidadePlural}
                </strong>
                {m.pedidosUnidade > 0 ? (
                  <>
                    . Mantendo o ticket médio atual de <strong>{R$(data.ticketMedio)}</strong>, isso representa cerca de{" "}
                    <strong>
                      {m.pedidosUnidade} pedidos por {data.unidadeSingular}
                    </strong>
                    .
                  </>
                ) : (
                  "."
                )}
              </p>
            )}
          </div>
        ))}

        <p style={{ ...S.small, marginTop: "10px", fontStyle: "italic" }}>{data.explicacao}</p>
      </div>
    );
  },
);
PlanoAcaoReport.displayName = "PlanoAcaoReport";
