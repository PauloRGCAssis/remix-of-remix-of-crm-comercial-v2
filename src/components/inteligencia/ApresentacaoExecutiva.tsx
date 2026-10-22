import { useMemo } from "react";
import type { AnaliseEstruturada, AnaliseSlide } from "@/hooks/useCentralAnalise";
import { Card, CardContent } from "@/components/ui/card";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const CORES = ["hsl(32, 90%, 50%)", "hsl(210, 70%, 45%)", "hsl(142, 55%, 38%)", "hsl(0, 72%, 51%)"];

function Grafico({ g }: { g: NonNullable<AnaliseSlide["grafico"]> }) {
  const dados = useMemo(
    () =>
      (g.categorias ?? []).map((cat, i) => {
        const linha: Record<string, string | number> = { categoria: cat };
        for (const s of g.series ?? []) linha[s.nome] = s.valores?.[i] ?? 0;
        return linha;
      }),
    [g],
  );
  if (!dados.length) return null;
  const horizontal = (g.categorias ?? []).some((c) => String(c).length > 22);
  return (
    <div className="h-[360px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        {g.tipo === "linha" ? (
          <LineChart data={dados} margin={{ left: 8, right: 16, top: 8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="categoria" tick={{ fontSize: 12 }} interval={0} angle={dados.length > 8 ? -25 : 0} textAnchor={dados.length > 8 ? "end" : "middle"} height={dados.length > 8 ? 70 : 30} />
            <YAxis tick={{ fontSize: 12 }} width={80} />
            <Tooltip />
            <Legend />
            {(g.series ?? []).map((s, i) => (
              <Line key={s.nome} type="monotone" dataKey={s.nome} stroke={CORES[i % CORES.length]} strokeWidth={2.5} dot />
            ))}
          </LineChart>
        ) : horizontal ? (
          <BarChart data={dados} layout="vertical" margin={{ left: 24, right: 24, top: 8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis type="number" tick={{ fontSize: 12 }} />
            <YAxis type="category" dataKey="categoria" tick={{ fontSize: 12 }} width={280} />
            <Tooltip />
            <Legend />
            {(g.series ?? []).map((s, i) => (
              <Bar key={s.nome} dataKey={s.nome} fill={CORES[i % CORES.length]} radius={[0, 4, 4, 0]} />
            ))}
          </BarChart>
        ) : (
          <BarChart data={dados} margin={{ left: 8, right: 16, top: 8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="categoria" tick={{ fontSize: 12 }} interval={0} angle={dados.length > 6 ? -20 : 0} textAnchor={dados.length > 6 ? "end" : "middle"} height={dados.length > 6 ? 80 : 30} />
            <YAxis tick={{ fontSize: 12 }} width={80} />
            <Tooltip />
            <Legend />
            {(g.series ?? []).map((s, i) => (
              <Bar key={s.nome} dataKey={s.nome} fill={CORES[i % CORES.length]} radius={[4, 4, 0, 0]} />
            ))}
          </BarChart>
        )}
      </ResponsiveContainer>
      {g.unidade && <p className="text-xs text-muted-foreground text-right pr-2">Unidade: {g.unidade}</p>}
    </div>
  );
}

function Slide({ slide, indice, total }: { slide: AnaliseSlide; indice: number; total: number }) {
  const capa = slide.tipo === "capa";
  return (
    <Card
      className={`overflow-hidden border-2 ${capa ? "border-primary bg-primary/5" : "border-border"} print:break-after-page`}
    >
      <CardContent className={`p-8 md:p-10 space-y-6 ${capa ? "min-h-[360px] flex flex-col justify-center" : ""}`}>
        <div className="space-y-1">
          <h3 className={`font-bold leading-tight ${capa ? "text-4xl md:text-5xl" : "text-2xl md:text-3xl"}`}>
            {slide.titulo}
          </h3>
          {slide.subtitulo && (
            <p className={`text-muted-foreground ${capa ? "text-lg" : "text-base"}`}>{slide.subtitulo}</p>
          )}
          {!capa && <div className="h-1 w-24 bg-primary rounded-full mt-3" />}
        </div>

        {slide.texto && (
          <div className="space-y-3 text-base md:text-lg leading-relaxed text-foreground/90">
            {slide.texto.split("\n").filter((l) => l.trim()).map((l, i) => (
              <p key={i}>{l.replace(/\*\*/g, "").replace(/^[-*•]\s*/, "")}</p>
            ))}
          </div>
        )}

        {!!slide.kpis?.length && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {slide.kpis.map((k, i) => (
              <div key={i} className="rounded-lg border bg-card p-5">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">{k.label}</p>
                <p className="text-3xl font-bold mt-1 leading-tight">{k.valor}</p>
                {(k.variacao || k.sub) && (
                  <p
                    className={`text-sm mt-1 ${
                      k.sentido === "positivo" ? "text-green-600" : k.sentido === "negativo" ? "text-destructive" : "text-muted-foreground"
                    }`}
                  >
                    {[k.variacao, k.sub].filter(Boolean).join(" · ")}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        {!!slide.bullets?.length && (
          <ul className="space-y-3 text-base md:text-lg">
            {slide.bullets.map((b, i) => (
              <li key={i} className="flex gap-3">
                <span className="text-primary font-bold">•</span>
                <span className="leading-relaxed">{b.replace(/\*\*/g, "")}</span>
              </li>
            ))}
          </ul>
        )}

        {slide.tabela && slide.tabela.linhas?.length > 0 && (
          <div className="border rounded-lg overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/60">
                  {slide.tabela.colunas.map((c, i) => (
                    <TableHead key={i} className="text-sm font-semibold text-foreground py-3">{c}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {slide.tabela.linhas.map((linha, i) => (
                  <TableRow key={i}>
                    {linha.map((cel, j) => (
                      <TableCell key={j} className={`text-sm py-2.5 ${j === 0 ? "font-medium" : "tabular-nums"}`}>
                        {cel}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {slide.grafico && <Grafico g={slide.grafico} />}

        {!!slide.perguntas?.length && (
          <div className="space-y-4">
            {slide.perguntas.map((p, i) => (
              <div key={i} className="rounded-lg border-l-4 border-primary bg-muted/30 p-4">
                <p className="font-semibold text-base">{i + 1}. {p.pergunta}</p>
                <p className="text-base text-foreground/90 mt-1 leading-relaxed">{p.resposta}</p>
              </div>
            ))}
          </div>
        )}

        {!capa && <p className="text-xs text-muted-foreground text-right pt-2">{indice} / {total}</p>}
      </CardContent>
    </Card>
  );
}

export function ApresentacaoExecutiva({ analise, fonte }: { analise: AnaliseEstruturada; fonte: string }) {
  const slides = useMemo<AnaliseSlide[]>(() => {
    const base = analise.apresentacao?.slides ?? [];
    if (base.length) return base;
    // fallback determinístico caso a IA não tenha montado a apresentação
    const gerados: AnaliseSlide[] = [
      { tipo: "capa", titulo: analise.titulo, subtitulo: analise.comparacao_descricao || analise.periodo_descricao },
      { tipo: "resumo", titulo: "Resumo executivo", texto: analise.resumo_executivo },
    ];
    for (const b of analise.blocos ?? []) {
      gerados.push({
        tipo: b.tabela ? "tabela" : b.grafico ? "grafico" : b.kpis ? "kpis" : "texto",
        titulo: b.titulo,
        texto: b.texto,
        kpis: b.kpis,
        tabela: b.tabela,
        grafico: b.grafico,
      });
    }
    if (analise.plano_acao?.length) gerados.push({ tipo: "lista", titulo: "Plano de ação", bullets: analise.plano_acao });
    if (analise.perguntas_diretoria?.length)
      gerados.push({ tipo: "perguntas", titulo: "Respostas objetivas para a diretoria", perguntas: analise.perguntas_diretoria });
    if (analise.leitura_gerencial) gerados.push({ tipo: "texto", titulo: "Conclusão", texto: analise.leitura_gerencial });
    return gerados;
  }, [analise]);

  const visiveis = slides.filter(
    (s) =>
      s.texto?.trim() ||
      s.bullets?.length ||
      s.kpis?.length ||
      s.tabela?.linhas?.length ||
      s.grafico?.categorias?.length ||
      s.perguntas?.length ||
      s.tipo === "capa",
  );

  return (
    <div className="space-y-6">
      <p className="text-xs text-muted-foreground">{fonte}</p>
      {visiveis.map((s, i) => (
        <Slide key={i} slide={s} indice={i + 1} total={visiveis.length} />
      ))}
    </div>
  );
}
