import { forwardRef } from "react";
import { Check, X } from "lucide-react";
import type { AcertoResult } from "@/lib/commissionCalc";
import type { ComissaoEquipeResult } from "@/lib/comissaoEquipe";
import type { MetaLine } from "@/lib/commissionExport";


const fmt = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export interface OutroCredito {
  id: string;
  descricao: string;
  valor: number;
}

interface Props {
  acerto: AcertoResult;
  yearMonth: string;
  pctPadrao: number;
  metas: MetaLine[];
  realizadoMetas?: number;
  /** Quando false, oculta todo o bloco de METAS/premiações da DRE. */
  participaPremiacao?: boolean;
  /** Rótulo informativo: metas acumulativas SIM/NÃO */
  metasAcumulativas?: boolean;
  /** Valor de ajuda de custo — soma na comissão líquida */
  ajudaCusto?: number;
  /** Créditos manuais adicionais — somam na comissão líquida */
  outrosCreditos?: OutroCredito[];
  /** Comissão Equipe (1%) calculada automaticamente — soma na comissão líquida */
  comissaoEquipe?: ComissaoEquipeResult | null;
  /** Categorias marcadas em "Descontar do faturamento" — usadas apenas para detalhar a linha de bonificações */
  tiposDescontoFaturamento?: string[];
  /** "screen" = versão compacta usada na sidebar; "document" = versão A4 usada na visualização/PDF */
  variant?: "screen" | "document";
}


export const AcertoResumoDocument = forwardRef<HTMLDivElement, Props>(function AcertoResumoDocument(
  { acerto, yearMonth, pctPadrao, metas, realizadoMetas, participaPremiacao = true, metasAcumulativas = false, ajudaCusto = 0, outrosCreditos = [], comissaoEquipe = null, tiposDescontoFaturamento, variant = "screen" },
  ref
) {
  const isDoc = variant === "document";
  const fatSet = new Set(tiposDescontoFaturamento ?? []);
  const bonifDetalhe = acerto.bonificacoesResumoPorTipo
    .filter((b) => fatSet.has(b.categoria) && b.total !== 0);
  // Fundo branco explícito para captura consistente pelo html2canvas
  const rootClass = isDoc
    ? "bg-white text-black border-2 border-primary/60 shadow-lg rounded-lg mx-auto"
    : "bg-card text-foreground border-2 border-primary/50 shadow-lg rounded-lg";
  const rootStyle = isDoc ? { width: "794px", minHeight: "1123px", padding: "40px" } : undefined;

  return (
    <div ref={ref} className={rootClass} style={rootStyle} data-pdf-source="acerto-resumo">
      {/* Cabeçalho */}
      <div className={`pb-3 border-b ${isDoc ? "mb-4" : "bg-muted/30 px-4 py-3 rounded-t-lg"}`}>
        <div className={`text-center font-heading font-bold ${isDoc ? "text-2xl" : "text-lg"}`}>
          RESUMO — {acerto.vendedor.toUpperCase()}
        </div>
        <div className={`text-center text-xs ${isDoc ? "text-gray-600" : "text-muted-foreground"}`}>
          Referência {yearMonth}
        </div>
      </div>

      {/* Corpo DRE */}
      <div className={isDoc ? "pt-2" : "pt-4 px-4 pb-4"}>
        <div className="space-y-0 font-mono text-sm">
          <DreLine label="FATURAMENTO BRUTO" value={acerto.faturamentoBruto} isDoc={isDoc} />
          <DreLine label="(−) BONIFICAÇÕES" value={-acerto.bonificacoesDescontadas} negative isDoc={isDoc} />
          {bonifDetalhe.map((b) => (
            <div
              key={b.categoria}
              className="flex items-center justify-between py-0.5 pl-5 text-[11px]"
              style={{ color: isDoc ? "#6b7280" : undefined }}
            >
              <span className={`font-sans ${isDoc ? "" : "text-muted-foreground"}`}>↳ {b.categoria}</span>
              <span className={isDoc ? "" : "text-muted-foreground"}>{fmt(-b.total)}</span>
            </div>
          ))}
          <DreDivider />
          <DreLine label="(=) FATURAMENTO LÍQUIDO" value={acerto.faturamentoLiquido} bold highlight isDoc={isDoc} />
          <div className="h-2" />
          <DreLine label={`COMISSÃO BRUTA (${pctPadrao}%)`} value={acerto.comissaoBruta} bold isDoc={isDoc} />
          <DreLine label="(−) CORTESIAS" value={-acerto.cortesia} negative isDoc={isDoc} />
          <DreLine label="(−) DESCONTOS COMISSÃO" value={-acerto.descontoClienteTotal} negative isDoc={isDoc} />
          {acerto.descontosCliente.map((d) => (
            <div
              key={d.cliente}
              className="flex items-center justify-between py-0.5 pl-5 text-[11px]"
              style={{ color: isDoc ? "#6b7280" : undefined }}
            >
              <span className={`font-sans ${isDoc ? "" : "text-muted-foreground"}`}>↳ {d.cliente}</span>
              <span className={isDoc ? "" : "text-muted-foreground"}>{fmt(-d.valorDescontado)}</span>
            </div>
          ))}
          {acerto.ajustesManuais.map((a) => {
            const desc = a.descricao?.trim();
            const cli = a.cliente?.trim();
            const base = desc
              ? (cli ? `${desc} – ${cli}` : desc)
              : (cli ? `Desconto – ${cli}` : "Desconto Manual");
            return (
              <DreLine key={a.id} label={`(−) ${base}`} value={-a.valor} negative small isDoc={isDoc} />
            );
          })}

          {acerto.ajustesManuais.length === 0 && (
            <DreLine label="(−) DESCONTOS MANUAIS" value={0} negative isDoc={isDoc} />
          )}
          <DreDivider />
          {participaPremiacao ? (
            <>
              <div className={`text-[10px] font-sans font-semibold py-1 flex items-center justify-end gap-2 ${isDoc ? "text-gray-600" : "text-muted-foreground"}`}>
                <span className="uppercase tracking-wide">Acumulativas: {metasAcumulativas ? "SIM" : "NÃO"}</span>
              </div>
              {metas.map((mt) => {
                // Cores inline garantem renderização idêntica na tela e no PDF (html2canvas).
                const hitColor = "#16a34a"; // success (verde)
                const missColor = "#dc2626"; // destructive (vermelho)
                const labelColor = mt.atingida ? hitColor : missColor;
                return (
                  <div key={mt.nome} className="flex items-center justify-between py-1.5 text-xs">
                    <span className="flex items-center gap-2">
                      {mt.atingida ? (
                        <Check className="h-4 w-4 shrink-0" style={{ color: hitColor }} />
                      ) : (
                        <X className="h-4 w-4 shrink-0" style={{ color: missColor }} />
                      )}
                      <span className="font-semibold" style={{ color: labelColor }}>
                        {mt.nome} <span className="font-normal opacity-80">({fmt(mt.alvo)})</span>
                      </span>
                    </span>
                    <span>
                      {mt.tipo === "sim_nao" ? (
                        <span className="font-semibold" style={{ color: labelColor }}>
                          {mt.atingida ? "SIM" : "NÃO"}
                        </span>
                      ) : mt.tipo === "combustivel" ? (
                        mt.atingida ? (
                          <span className="font-semibold" style={{ color: hitColor }}>
                            {fmt(mt.premiacao)}
                          </span>
                        ) : (
                          <span className="font-semibold" style={{ color: missColor }}>
                            NÃO
                          </span>
                        )
                      ) : mt.atingida ? (
                        <span className="font-semibold" style={{ color: hitColor }}>
                          +{fmt(mt.premiacao)}
                        </span>
                      ) : (
                        <span className="font-semibold" style={{ color: missColor }}>
                          NÃO
                        </span>
                      )}
                    </span>
                  </div>
                );
              })}
            </>
          ) : (
            <div
              className={`text-[11px] font-sans italic py-2 ${isDoc ? "text-gray-500" : "text-muted-foreground"}`}
            >
              Vendedor não participa do Programa de Premiações neste mês — metas e bônus não são aplicados.
            </div>
          )}

          {(ajudaCusto > 0 || outrosCreditos.some((c) => (c.valor ?? 0) !== 0) || !!comissaoEquipe) && <DreDivider />}
          {comissaoEquipe && (
            <>
              <DreLine
                label={`(+) COMISSÃO EQUIPE (${comissaoEquipe.pct}%)`}
                value={comissaoEquipe.valor}
                isDoc={isDoc}
                positive
              />
              {comissaoEquipe.membros.map((mb) => (
                <div
                  key={mb.vendedor}
                  className="flex items-center justify-between py-0.5 pl-5 text-[11px]"
                  style={{ color: isDoc ? "#6b7280" : undefined }}
                >
                  <span className={`font-sans ${isDoc ? "" : "text-muted-foreground"}`}>
                    ↳ {mb.vendedor} — Faturamento líquido
                  </span>
                  <span className={isDoc ? "" : "text-muted-foreground"}>{fmt(mb.faturamentoLiquido)}</span>
                </div>
              ))}
              <div
                className="flex items-center justify-between py-0.5 pl-5 text-[11px] font-semibold"
                style={{ color: isDoc ? "#4b5563" : undefined }}
              >
                <span className={`font-sans ${isDoc ? "" : "text-muted-foreground"}`}>Base total</span>
                <span className={isDoc ? "" : "text-muted-foreground"}>{fmt(comissaoEquipe.base)}</span>
              </div>
              <div
                className="flex items-center justify-between py-0.5 pl-5 text-[11px] font-semibold"
                style={{ color: isDoc ? "#4b5563" : undefined }}
              >
                <span className={`font-sans ${isDoc ? "" : "text-muted-foreground"}`}>
                  {comissaoEquipe.pct}% da base
                </span>
                <span className={isDoc ? "" : "text-muted-foreground"}>{fmt(comissaoEquipe.valor)}</span>
              </div>
            </>
          )}
          {ajudaCusto > 0 && (
            <DreLine label="(+) AJUDA DE CUSTO" value={ajudaCusto} isDoc={isDoc} positive />
          )}
          {outrosCreditos
            .filter((c) => (c.valor ?? 0) !== 0)
            .map((c) => (
              <DreLine
                key={c.id}
                label={`(+) ${c.descricao || "Outro crédito"}`}
                value={c.valor}
                isDoc={isDoc}
                positive
                small
              />
            ))}



          {/* Faixa verde — Comissão líquida */}
          <div
            className="mt-4 rounded-md px-4 py-4"
            style={{ background: "#16a34a", color: "#ffffff" }}
          >
            <div className="text-xs opacity-90 font-sans">COMISSÃO LÍQUIDA</div>
            <div className="font-heading font-bold text-2xl mt-1 text-right">{fmt(acerto.comissaoLiquida)}</div>
          </div>

          {isDoc && (
            <div className="mt-8 pt-4 border-t text-[10px] text-gray-500 flex justify-between font-sans">
              <span>Documento gerado automaticamente — Pagamento Vendedores</span>
              <span>{new Date().toLocaleString("pt-BR")}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

function MissedRewardValue({ value, color }: { value: string; color: string }) {
  return (
    <span
      className="font-semibold"
      data-missed-reward-value="true"
      style={{
        color,
        display: "inline",
        whiteSpace: "nowrap",
        textDecorationLine: "line-through",
        textDecorationColor: color,
        textDecorationThickness: "2px",
        textDecorationSkipInk: "none",
      }}
    >
      {value}
    </span>
  );
}

function DreLine({
  label,
  value,
  bold,
  negative,
  positive,
  highlight,
  small,
  isDoc,
}: {
  label: string;
  value: number;
  bold?: boolean;
  negative?: boolean;
  positive?: boolean;
  highlight?: boolean;
  small?: boolean;
  isDoc?: boolean;
}) {
  const highlightStyle = highlight && isDoc ? { background: "#f3f4f6", padding: "0 8px", borderRadius: 4 } : undefined;
  const negativeStyle = negative ? { color: isDoc ? "#dc2626" : undefined } : undefined;
  const positiveStyle = positive ? { color: isDoc ? "#16a34a" : undefined } : undefined;
  return (
    <div
      className={`flex items-center justify-between py-1.5 ${bold ? "font-bold" : ""} ${highlight && !isDoc ? "bg-muted/50 px-2 rounded" : ""} ${small ? "text-xs" : ""}`}
      style={highlightStyle}
    >
      <span className="font-sans">{label}</span>
      <span
        className={!isDoc && negative ? "text-destructive" : !isDoc && positive ? "text-success" : ""}
        style={negativeStyle ?? positiveStyle}
      >
        {value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
      </span>
    </div>
  );
}

function DreDivider() {
  return <div className="my-1 border-t" />;
}
