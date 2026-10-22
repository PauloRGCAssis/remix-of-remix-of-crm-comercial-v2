import { BONIFICACAO_VALUE_COLUMN, isBonificacao, TIPO_LABEL, type CommissionRow, type CommissionTipo } from "./commissionImport";

export interface ClienteDesconto {
  cliente: string;
  pctAcordado: number;
}

export interface AjusteManual {
  id: string;
  descricao: string;
  valor: number;
  observacao?: string;
  cliente?: string;
}

export interface AcertoInput {
  vendedor: string;
  rows: CommissionRow[];
  pctPadrao: number;
  /** Categorias de bonificação a descontar do FATURAMENTO BRUTO (antes da comissão) */
  tiposDescontoFaturamento: string[];
  /** Categorias de bonificação a descontar da COMISSÃO BRUTA (linha Cortesia) */
  tiposDescontoComissao: string[];
  descontosClientes: ClienteDesconto[];
  ajustesManuais: AjusteManual[];
  /** Soma das premiações que ENTRAM na comissão líquida (Meta 0,5% + Meta 1%) */
  premiacaoComissao: number;
}

export interface DescontoClienteCalculado {
  cliente: string;
  pctPadrao: number;
  pctAcordado: number;
  pctDesconto: number;
  faturamentoCliente: number;
  valorDescontado: number;
}

export interface ClientePorFat { cliente: string; faturamento: number; }

export interface BonifCategoriaResumo {
  categoria: string;
  total: number;
  count: number;
  colunaUsada: typeof BONIFICACAO_VALUE_COLUMN;
}

export interface AcertoResult {
  vendedor: string;
  vendasRows: CommissionRow[];
  bonificacoesRows: CommissionRow[];
  bonificacoesResumoPorTipo: BonifCategoriaResumo[];
  categoriasDisponiveis: string[];
  faturamentoBruto: number;
  bonificacoesDescontadas: number;
  faturamentoLiquido: number;
  comissaoBruta: number;
  cortesia: number;
  descontosCliente: DescontoClienteCalculado[];
  descontoClienteTotal: number;
  ajustesManuais: AjusteManual[];
  ajustesManuaisTotal: number;
  premiacaoComissao: number;
  comissaoLiquida: number;
  clientes: ClientePorFat[];
}

export function bonifCategoria(r: CommissionRow): string {
  const raw = (r.categoriaVenda || r.tipoRaw || "").trim();
  if (raw) {
    return raw;
  }
  const map: Partial<Record<CommissionTipo, string>> = {
    BONIFICACAO_BRINDE: "Brinde",
    BONIFICACAO_CORTESIA: "Cortesia",
    BONIFICACAO_DEGUSTACAO: "Degustação",
    BONIFICACAO_INTRODUCAO: "Introdução",
    BONIFICACAO_PRECO_FINAL: "Preço Final",
    BONIFICACAO_OUTRAS: "Outras",
    CORTESIA: "Cortesia",
  };
  return map[r.tipo] ?? TIPO_LABEL[r.tipo] ?? "Outras";
}

export function faturamentoPorCliente(rows: CommissionRow[]): ClientePorFat[] {
  const map = new Map<string, number>();
  for (const r of rows) {
    if (r.tipo !== "VENDA") continue;
    map.set(r.cliente, (map.get(r.cliente) || 0) + r.valor);
  }
  return [...map.entries()]
    .map(([cliente, faturamento]) => ({ cliente, faturamento }))
    .sort((a, b) => b.faturamento - a.faturamento);
}

export function calcularAcerto(input: AcertoInput): AcertoResult {
  const rows = input.rows.filter((r) => r.vendedor === input.vendedor);
  const vendasRows = rows.filter((r) => r.tipo === "VENDA");
  const bonificacoesRows = rows
    .filter((r) => isBonificacao(r.tipo) || r.tipo === "CORTESIA")
    .map((r) => ({
      ...r,
      valor: Number(r.custo ?? 0),
      valorFonte: BONIFICACAO_VALUE_COLUMN,
    }));

  const faturamentoBruto = vendasRows.reduce((s, r) => s + r.valor, 0);

  // Agrupamento por categoria
  const resumoMap = new Map<string, BonifCategoriaResumo>();
  for (const r of bonificacoesRows) {
    const cat = bonifCategoria(r);
    const cur = resumoMap.get(cat) || { categoria: cat, total: 0, count: 0, colunaUsada: BONIFICACAO_VALUE_COLUMN };
    cur.total += Number(r.custo ?? 0);
    cur.count += 1;
    resumoMap.set(cat, cur);
  }
  const bonificacoesResumoPorTipo = [...resumoMap.values()].sort((a, b) => b.total - a.total);
  const categoriasDisponiveis = bonificacoesResumoPorTipo.map((r) => r.categoria);

  const fatSet = new Set(input.tiposDescontoFaturamento);
  const comSet = new Set(input.tiposDescontoComissao);

  const bonificacoesDescontadas = bonificacoesRows
    .filter((r) => fatSet.has(bonifCategoria(r)))
    .reduce((s, r) => s + Number(r.custo ?? 0), 0);

  const cortesia = bonificacoesRows
    .filter((r) => comSet.has(bonifCategoria(r)))
    .reduce((s, r) => s + Number(r.custo ?? 0), 0);

  const faturamentoLiquido = faturamentoBruto - bonificacoesDescontadas;
  const comissaoBruta = faturamentoLiquido * (input.pctPadrao / 100);

  const clientes = faturamentoPorCliente(rows);
  const clienteFatMap = new Map(clientes.map((c) => [c.cliente, c.faturamento]));

  const descontosCliente: DescontoClienteCalculado[] = input.descontosClientes
    .filter((d) => d.cliente && d.pctAcordado < input.pctPadrao)
    .map((d) => {
      const faturamentoCliente = clienteFatMap.get(d.cliente) || 0;
      const pctDesconto = input.pctPadrao - d.pctAcordado;
      return {
        cliente: d.cliente,
        pctPadrao: input.pctPadrao,
        pctAcordado: d.pctAcordado,
        pctDesconto,
        faturamentoCliente,
        valorDescontado: faturamentoCliente * (pctDesconto / 100),
      };
    });

  const descontoClienteTotal = descontosCliente.reduce((s, d) => s + d.valorDescontado, 0);
  const ajustesManuais = input.ajustesManuais ?? [];
  const ajustesManuaisTotal = ajustesManuais.reduce((s, a) => s + (a.valor || 0), 0);

  const comissaoLiquida =
    comissaoBruta -
    cortesia -
    descontoClienteTotal -
    ajustesManuaisTotal +
    input.premiacaoComissao;

  return {
    vendedor: input.vendedor,
    vendasRows,
    bonificacoesRows,
    bonificacoesResumoPorTipo,
    categoriasDisponiveis,
    faturamentoBruto,
    bonificacoesDescontadas,
    faturamentoLiquido,
    comissaoBruta,
    cortesia,
    descontosCliente,
    descontoClienteTotal,
    ajustesManuais,
    ajustesManuaisTotal,
    premiacaoComissao: input.premiacaoComissao,
    comissaoLiquida,
    clientes,
  };
}
