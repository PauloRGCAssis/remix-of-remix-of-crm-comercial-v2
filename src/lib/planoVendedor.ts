/**
 * FONTE ÚNICA do "plano de esforço" por vendedor.
 *
 * A maioria dos vendedores tem sua meta diária calculada por DIAS OPERACIONAIS
 * (dias úteis restantes do mês + 2 dias úteis da janela de entrega).
 *
 * Vendedores configurados como "por rotas" (ex.: Ednei — rota semanal para
 * Sete Lagoas às segundas-feiras) têm o esforço calculado por ROTAS RESTANTES:
 *   - todas as rotas do mês (dia da semana configurado) que ainda não
 *     ocorreram até "hoje"
 *   - + a rota do mês seguinte apenas quando cair DENTRO da janela de 2 dias
 *     úteis de entrega após o último dia do mês.
 *
 * A configuração está definida em `VENDEDOR_PLANO_CONFIG` abaixo. Adicionar
 * novo vendedor por rota é apenas incluir uma entrada nesse mapa.
 */
import { calcDiasOperacionais, formatDiaMes } from "@/lib/diasOperacionais";

export type TipoPlano = "dias" | "rotas";

export interface PlanoRotaConfig {
  tipo: "rotas";
  /** 0=domingo, 1=segunda, ..., 6=sábado */
  diaSemana: number;
  cidade?: string;
  descricao?: string;
}

export interface PlanoDiasConfig {
  tipo: "dias";
}

export type PlanoConfig = PlanoRotaConfig | PlanoDiasConfig;

/** Configuração por vendedor (chave = nome curto usado em `shortVendedorName`). */
export const VENDEDOR_PLANO_CONFIG: Record<string, PlanoConfig> = {
  Ednei: {
    tipo: "rotas",
    diaSemana: 1, // segunda-feira
    cidade: "Sete Lagoas",
    descricao: "rotas de segunda-feira para Sete Lagoas",
  },
};

export function getPlanoConfig(vendedorShort?: string | null): PlanoConfig {
  if (!vendedorShort) return { tipo: "dias" };
  return VENDEDOR_PLANO_CONFIG[vendedorShort] ?? { tipo: "dias" };
}

export interface PlanoEsforco {
  tipo: TipoPlano;
  /** Rótulo da unidade no singular ("dia" ou "rota"). */
  unidadeSingular: string;
  /** Rótulo da unidade no plural ("dias" ou "rotas"). */
  unidadePlural: string;
  /** Quantidade de unidades restantes para bater a meta (divisor). */
  unidadesRestantes: number;
  /** Total de unidades no ciclo (mês + eventual rota da janela de entrega). */
  unidadesTotais: number;
  /** Próximas datas (rotas restantes) — usadas na apresentação. Vazio em modo "dias". */
  proximasDatas: Date[];
  /** Nota curta explicativa (contagem). */
  notaCalendario: string;
  /** Descrição operacional (tooltip). */
  explicacao: string;
}

const isBusinessDay = (d: Date, holidays?: Set<string>) => {
  const dow = d.getDay();
  if (dow === 0 || dow === 6) return false;
  if (holidays) {
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    if (holidays.has(key)) return false;
  }
  return true;
};

/** Retorna todas as datas do mês de `refDate` que caem em `diaSemana`. */
function datasDoMesNoDiaSemana(refDate: Date, diaSemana: number): Date[] {
  const y = refDate.getFullYear();
  const m = refDate.getMonth();
  const last = new Date(y, m + 1, 0).getDate();
  const out: Date[] = [];
  for (let d = 1; d <= last; d++) {
    const date = new Date(y, m, d);
    if (date.getDay() === diaSemana) out.push(date);
  }
  return out;
}

/**
 * Todas as rotas do ciclo de `refDate` (rotas do mês + eventual rota do mês
 * seguinte que caia na janela de entrega). Retorna [] para vendedores que não
 * trabalham por rotas. FONTE ÚNICA da lista de rotas.
 */
export function listarRotasDoCiclo(
  vendedorShort: string | null | undefined,
  refDate: Date,
  holidays?: Set<string>,
): Date[] {
  const cfg = getPlanoConfig(vendedorShort);
  if (cfg.tipo !== "rotas") return [];
  const op = calcDiasOperacionais(refDate, holidays);
  const rotasMes = datasDoMesNoDiaSemana(refDate, cfg.diaSemana);
  const rotasEntrega = op.diasEntrega.filter((d) => d.getDay() === cfg.diaSemana);
  return [...rotasMes, ...rotasEntrega];
}

/**
 * Calcula o plano de esforço para o vendedor no mês de `refDate`.
 * Se o vendedor for do tipo "rotas", inclui a rota do mês seguinte apenas
 * quando a data dessa rota estiver dentro da janela de 2 dias úteis de
 * entrega após o último dia do mês.
 */
export function calcPlanoEsforco(
  vendedorShort: string | null | undefined,
  refDate: Date,
  today: Date = new Date(),
  holidays?: Set<string>,
): PlanoEsforco {
  const cfg = getPlanoConfig(vendedorShort);
  const op = calcDiasOperacionais(refDate, holidays, today);

  if (cfg.tipo === "dias") {
    return {
      tipo: "dias",
      unidadeSingular: "dia",
      unidadePlural: "dias",
      unidadesRestantes: op.diasOperacionaisRestantes,
      unidadesTotais: op.diasUteisTotal + op.diasEntrega.length,
      proximasDatas: [],
      notaCalendario: `${op.diasUteisRestantes} dias úteis até ${formatDiaMes(op.ultimoDiaMes)} + ${op.diasEntrega.length} dias úteis para entrega: ${op.diasEntrega.map(formatDiaMes).join(" e ")}.`,
      explicacao: `Para a meta mensal, são considerados os pedidos tirados até ${formatDiaMes(op.ultimoDiaMes)}. Esses pedidos podem ser entregues nos dois dias úteis seguintes, ${op.diasEntrega.map(formatDiaMes).join(" e ")}.`,
    };
  }

  // Modo "rotas"
  const rotasMes = datasDoMesNoDiaSemana(refDate, cfg.diaSemana);
  // Rota da janela de entrega: procurar `diaSemana` dentro dos `diasEntrega`.
  const rotasEntrega = op.diasEntrega.filter((d) => d.getDay() === cfg.diaSemana);
  const todasRotas = [...rotasMes, ...rotasEntrega];

  const todayYmd = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const rotasRestantes = todasRotas.filter((d) => d > todayYmd);

  const proximasFmt = rotasRestantes.map(formatDiaMes);
  const rotasStr =
    proximasFmt.length === 0
      ? ""
      : proximasFmt.length === 1
      ? proximasFmt[0]
      : `${proximasFmt.slice(0, -1).join(", ")} e ${proximasFmt[proximasFmt.length - 1]}`;

  const nota =
    rotasRestantes.length > 0
      ? `${rotasRestantes.length} rota(s) restante(s) — próximas: ${rotasStr}.`
      : `Nenhuma rota restante neste ciclo.`;

  const explicacao =
    `O planejamento é calculado por ${cfg.descricao ?? "rotas semanais"}, e não por dias úteis. ` +
    `Rotas do mês: ${rotasMes.map(formatDiaMes).join(", ") || "—"}.` +
    (rotasEntrega.length > 0
      ? ` Inclui a rota de ${rotasEntrega.map(formatDiaMes).join(", ")} porque está dentro da janela de entrega (${op.diasEntrega.map(formatDiaMes).join(" e ")}).`
      : ` Nenhuma rota do mês seguinte cai na janela de entrega (${op.diasEntrega.map(formatDiaMes).join(" e ")}).`);

  return {
    tipo: "rotas",
    unidadeSingular: "rota",
    unidadePlural: "rotas",
    unidadesRestantes: rotasRestantes.length,
    unidadesTotais: todasRotas.length,
    proximasDatas: rotasRestantes,
    notaCalendario: nota,
    explicacao,
  };
}
