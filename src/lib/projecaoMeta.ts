/**
 * FONTE ÚNICA da PROJEÇÃO DE FECHAMENTO x META.
 *
 * Toda a comunicação dos cards de metas ("Projeção fim do mês",
 * "Projeção bate / não bate", "necessário por dia/rota", "pedidos por dia")
 * DEVE usar esta função. Nenhum componente pode recalcular localmente.
 *
 * Regras canônicas:
 *  • unidade de esforço = a MESMA usada no "necessário por unidade"
 *    (dias operacionais restantes = dias úteis restantes + janela de entrega,
 *     ou rotas restantes para vendedores por rota).
 *  • mediaPorUnidade = realizado / unidades já decorridas.
 *  • projecaoFechamento = realizado + (mediaPorUnidade × unidadesRestantes).
 *  • projetaBate = meta já batida OU projecaoFechamento >= meta
 *                  OU mediaPorUnidade >= necessarioPorUnidade.
 *    (a última condição é uma trava lógica: mantendo o ritmo atual a meta
 *     é matematicamente atingida, então nunca pode exibir "não bate").
 */

const EPS = 0.005; // tolerância de centavo para comparações de moeda

export interface ProjecaoMetaInput {
  meta: number;
  realizado: number;
  /** Unidades de esforço restantes (dias operacionais ou rotas). */
  unidadesRestantes: number;
  /** Unidades de esforço já decorridas no ciclo. */
  unidadesDecorridas: number;
}

export interface ProjecaoMetaResultado {
  meta: number;
  realizado: number;
  falta: number;
  unidadesRestantes: number;
  unidadesDecorridas: number;
  /** Média realizada por unidade de esforço (dia operacional ou rota). */
  mediaPorUnidade: number;
  /** Quanto precisa faturar por unidade para bater a meta. */
  necessarioPorUnidade: number;
  /** realizado + média × unidades restantes. */
  projecaoFechamento: number;
  /** Meta já atingida pelo realizado. */
  batido: boolean;
  /** Projeção alcança a meta mantendo o ritmo atual. */
  projetaBate: boolean;
  /** Quanto a projeção fica acima da meta (0 se abaixo). */
  excedenteProjetado: number;
  /** Quanto falta à projeção para alcançar a meta (0 se acima). */
  deficitProjetado: number;
  /** % da meta que a projeção representa. */
  pctProjetado: number;
  /** % projetado ACIMA da meta (0 se abaixo). */
  pctExcedenteProjetado: number;
}

export function calcProjecaoMeta({
  meta,
  realizado,
  unidadesRestantes,
  unidadesDecorridas,
}: ProjecaoMetaInput): ProjecaoMetaResultado {
  const restantes = Math.max(0, unidadesRestantes);
  const decorridas = Math.max(0, unidadesDecorridas);

  const falta = Math.max(0, meta - realizado);
  const batido = meta > 0 && realizado >= meta - EPS;

  const mediaPorUnidade = decorridas > 0 ? realizado / decorridas : 0;
  const necessarioPorUnidade = restantes > 0 && falta > 0 ? falta / restantes : 0;

  const projecaoFechamento = realizado + mediaPorUnidade * restantes;

  const ritmoSuficiente =
    !batido &&
    restantes > 0 &&
    falta > 0 &&
    mediaPorUnidade >= necessarioPorUnidade - EPS;

  const projetaBate =
    batido || (meta > 0 && projecaoFechamento >= meta - EPS) || ritmoSuficiente;

  const excedenteProjetado = Math.max(0, projecaoFechamento - meta);
  const deficitProjetado = Math.max(0, meta - projecaoFechamento);
  const pctProjetado = meta > 0 ? (projecaoFechamento / meta) * 100 : 0;
  const pctExcedenteProjetado = meta > 0 ? (excedenteProjetado / meta) * 100 : 0;

  return {
    meta,
    realizado,
    falta,
    unidadesRestantes: restantes,
    unidadesDecorridas: decorridas,
    mediaPorUnidade,
    necessarioPorUnidade,
    projecaoFechamento,
    batido,
    projetaBate,
    excedenteProjetado,
    deficitProjetado,
    pctProjetado,
    pctExcedenteProjetado,
  };
}
