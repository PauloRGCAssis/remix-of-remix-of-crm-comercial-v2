// Motor de cálculo do módulo "Controle de Bonificações".
//
// Regras principais:
//  - Bonificação de PREÇO: qualquer categoria cuja descrição contenha "preço".
//  - Fórmula comercial: a cada 10 kg comprados o cliente recebe N kg bonificados.
//    Preço final do cliente = (preço atual * 10) / (10 + N)
//  - A planilha é sempre a fonte oficial. Nada é reinterpretado.

export interface BonificacaoCadastro {
  id: string;
  vendedor: string | null;
  cliente: string;
  cliente_key: string;
  cnpj_cpf: string | null;
  produto: string;
  produto_key: string;
  preco_anterior: number | null;
  preco_atual: number;
  produtos_bonificados: number;
  /** % de negociação sobre o volume comprado (20 = 20%). Manual, prevalece sobre a estimativa. */
  pct_negociacao: number | null;
  categoria: string;
  observacoes: string | null;
  origem: string | null;
  ativo: boolean;
}


export interface BonificacaoRow {
  id: number;
  import_key: string;
  categoria: string;
  cliente: string;
  cliente_key: string;
  cnpj_cpf: string | null;
  codigo_venda: string | null;
  data: string | null;
  produto: string;
  produto_key: string;
  quantidade: number;
  custo: number;
  vendedor: string | null;
  source_file: string | null;
}

export function normKey(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Categoria de bonificação de PREÇO (filtro padrão da tela). */
export function isBonificacaoPreco(categoria: string | null | undefined): boolean {
  return normKey(categoria).includes("preco");
}

const STOP_TOKENS = new Set(["de", "da", "do", "das", "dos", "e", "-", "a", "o"]);

export function tokens(value: string): string[] {
  return normKey(value)
    .replace(/[^a-z0-9 ]/g, " ")
    .split(" ")
    .filter((t) => t.length > 1 && !STOP_TOKENS.has(t));
}

/**
 * Família canônica do produto — permite cruzar os nomes curtos do cadastro
 * ("Tradicional Requeijão") com as descrições completas da planilha de vendas
 * ("102 - Pão de Queijo Tradicional Recheado Requeijão Ti Delso 1 kg").
 */
export function produtoFamilia(nome: string): string {
  const n = normKey(nome).replace(/^\d+[\w-]*\s*-\s*/, "");

  const marca = n.includes("lozinha")
    ? "lozinha"
    : n.includes("taua")
      ? "taua"
      : n.includes("cambui")
        ? "cambuiense"
        : n.includes("atalaia")
          ? "atalaia"
          : /\bsj\b/.test(n)
            ? "sj"
            : "tidelso";

  const formato = n.includes("empanado")
    ? n.includes("big")
      ? "empanado big"
      : "empanado"
    : n.includes("coquetel")
      ? "coquetel"
      : n.includes("palito")
        ? "palito"
        : n.includes("mini")
          ? "mini"
          : n.includes("super lanche")
            ? "super lanche"
            : n.includes("big lanche") || (n.includes("big") && n.includes("lanche"))
              ? "big lanche"
              : n.includes("lanchinho")
                ? "lanchinho"
                : n.includes("lanche")
                  ? "lanche"
                  : "tradicional";

  const recheio = n.includes("frango")
    ? "frango"
    : n.includes("requeijao")
      ? "requeijao"
      : n.includes("goiabada")
        ? "goiabada"
        : n.includes("lombinho")
          ? "lombinho"
          : n.includes("tres queijos") || n.includes("3 queijos")
            ? "tres queijos"
            : n.includes("blend")
              ? "blend"
              : "puro";

  // "Palito Mini" é um item específico do cadastro
  if (n.includes("palito") && n.includes("mini")) return `${marca}|palito mini|puro`;
  return `${marca}|${formato}|${recheio}`;
}

/** Um nome de cliente da planilha corresponde ao cadastro? (todos os tokens presentes) */
export function clienteCorresponde(cadastroCliente: string, clientePlanilha: string): boolean {
  const alvo = normKey(clientePlanilha);
  if (!alvo) return false;
  const t = tokens(cadastroCliente);
  if (t.length === 0) return false;
  return t.every((token) => alvo.includes(token));
}

export function precoFinalCliente(precoAtual: number, produtosBonificados: number): number {
  const n = Number(produtosBonificados) || 0;
  const p = Number(precoAtual) || 0;
  if (n <= 0) return p;
  return (p * 10) / (10 + n);
}

export function pctBonificacao(produtosBonificados: number): number {
  const n = Number(produtosBonificados) || 0;
  if (n <= 0) return 0;
  return n / (10 + n);
}

export type ConferenciaStatus = "ok" | "abaixo" | "acima" | "sem_bonificacao" | "sem_compra";

export interface ConferenciaMes {
  mes: string; // YYYY-MM
  kgComprado: number;
  kgBonificado: number;
  kgEsperado: number;
  saldo: number;
  pctReal: number;
  status: ConferenciaStatus;
}

export const STATUS_META: Record<ConferenciaStatus, { label: string; icon: string; className: string }> = {
  ok: { label: "Correto", icon: "✅", className: "bg-success/20 text-success border-success/50" },
  abaixo: { label: "Abaixo do combinado", icon: "⚠️", className: "bg-warning/25 text-warning border-warning/60" },
  acima: { label: "Acima do combinado", icon: "🔺", className: "bg-info/20 text-info border-info/50" },
  sem_bonificacao: { label: "Sem bonificação enviada", icon: "❌", className: "bg-destructive/20 text-destructive border-destructive/50" },
  sem_compra: { label: "Sem compra no período", icon: "⏸️", className: "bg-muted text-muted-foreground border-border" },
};

const TOLERANCIA = 0.05; // 5%

export function avaliarConferencia(
  mes: string,
  kgComprado: number,
  kgBonificado: number,
  produtosBonificados: number,
): ConferenciaMes {
  const kgEsperado = (Number(kgComprado) || 0) * ((Number(produtosBonificados) || 0) / 10);
  const saldo = kgBonificado - kgEsperado;
  const pctReal = kgComprado > 0 ? kgBonificado / kgComprado : 0;

  let status: ConferenciaStatus;
  if (kgComprado <= 0) status = "sem_compra";
  else if (kgEsperado <= 0) status = kgBonificado > 0 ? "acima" : "sem_compra";
  else if (kgBonificado <= 0) status = "sem_bonificacao";
  else if (Math.abs(saldo) <= kgEsperado * TOLERANCIA) status = "ok";
  else status = saldo < 0 ? "abaixo" : "acima";

  return { mes, kgComprado, kgBonificado, kgEsperado, saldo, pctReal, status };
}

/**
 * Sugestão inteligente: percentual médio efetivamente praticado nos meses com
 * compra + bonificação. Convertido de volta para "produtos bonificados" (N/10).
 */
export interface SugestaoBonificacao {
  pctMedio: number;
  produtosSugeridos: number;
  mesesConsiderados: number;
  divergeDoCadastro: boolean;
}

export function calcularSugestao(historico: ConferenciaMes[], produtosBonificados: number): SugestaoBonificacao | null {
  const validos = historico.filter((h) => h.kgComprado > 0 && h.kgBonificado > 0);
  if (validos.length < 2) return null;
  const pctMedio = validos.reduce((acc, h) => acc + h.pctReal, 0) / validos.length;
  const produtosSugeridos = Math.round(pctMedio * 10 * 2) / 2; // meio kg
  return {
    pctMedio,
    produtosSugeridos,
    mesesConsiderados: validos.length,
    divergeDoCadastro: Math.abs(produtosSugeridos - (Number(produtosBonificados) || 0)) >= 0.5,
  };
}

export function mesDe(dataIso: string | null | undefined): string {
  return String(dataIso ?? "").slice(0, 7);
}

export function ultimosMeses(mesFinal: string, quantidade: number): string[] {
  const [y, m] = mesFinal.split("-").map(Number);
  const out: string[] = [];
  for (let i = quantidade - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Conta-corrente de bonificações (compra -> direito gerado -> entrega alocada)
// ---------------------------------------------------------------------------

export interface CompraEvento {
  data: string;          // ISO
  codigoVenda: string | null;
  cliente: string;
  produto: string;
  kg: number;
}

export interface EntregaEvento {
  data: string | null;   // ISO
  codigoVenda: string | null;
  cliente: string;
  produto: string;
  kg: number;
}

export interface AlocacaoEntrega {
  data: string | null;
  codigoVenda: string | null;
  produto: string;
  kg: number;            // kg desta entrega alocados a esta compra
}

export interface CompraLedger extends CompraEvento {
  gerado: number;                   // kg de bonificação gerados por esta compra
  entregue: number;                 // kg já alocados (mesmo que entregues depois)
  saldo: number;                    // gerado - entregue
  alocacoes: AlocacaoEntrega[];
}

export interface LedgerBonificacao {
  compras: CompraLedger[];
  entregas: EntregaEvento[];
  entregasNaoAlocadas: number;      // entregas sem compra correspondente
}

/**
 * Aloca as entregas (ordem cronológica) às compras (ordem cronológica), FIFO.
 * Assim uma bonificação gerada em julho e entregue em agosto aparece como
 * ENTREGUE ao consultar julho — o vínculo é compra -> entrega, não a data.
 */
export function construirLedger(
  compras: CompraEvento[],
  entregas: EntregaEvento[],
  produtosBonificados: number,
): LedgerBonificacao {
  const taxa = (Number(produtosBonificados) || 0) / 10;
  const ts = (d: string | null) => (d ? new Date(d).getTime() : 0);

  const buckets: CompraLedger[] = [...compras]
    .sort((a, b) => ts(a.data) - ts(b.data))
    .map((c) => ({ ...c, gerado: (Number(c.kg) || 0) * taxa, entregue: 0, saldo: 0, alocacoes: [] }));

  const fila = [...entregas].sort((a, b) => ts(a.data) - ts(b.data));

  let idx = 0;
  let naoAlocadas = 0;
  for (const entrega of fila) {
    let restante = Number(entrega.kg) || 0;
    while (restante > 1e-9 && idx < buckets.length) {
      const bucket = buckets[idx];
      const capacidade = bucket.gerado - bucket.entregue;
      if (capacidade <= 1e-9) {
        idx += 1;
        continue;
      }
      const usado = Math.min(capacidade, restante);
      bucket.entregue += usado;
      bucket.alocacoes.push({
        data: entrega.data,
        codigoVenda: entrega.codigoVenda,
        produto: entrega.produto,
        kg: usado,
      });
      restante -= usado;
    }
    if (restante > 1e-9) naoAlocadas += restante;
  }

  for (const b of buckets) b.saldo = b.gerado - b.entregue;

  return { compras: buckets, entregas: fila, entregasNaoAlocadas: naoAlocadas };
}

export interface ResumoPeriodo {
  volumeComprado: number;
  bonificacaoGerada: number;
  bonificacaoEntregue: number;
  saldoAEntregar: number;
  compras: CompraLedger[];
  entregasNoPeriodo: EntregaEvento[];
}

/** Recorta o ledger por período (baseado na data da COMPRA que gerou o direito). */
export function resumirPeriodo(
  ledger: LedgerBonificacao,
  inicio: string,
  fim: string,
): ResumoPeriodo {
  const dentro = (d: string | null) => {
    const dia = String(d ?? "").slice(0, 10);
    if (!dia) return false;
    if (inicio && dia < inicio) return false;
    if (fim && dia > fim) return false;
    return true;
  };

  const compras = ledger.compras.filter((c) => dentro(c.data));
  const resumo: ResumoPeriodo = {
    volumeComprado: 0,
    bonificacaoGerada: 0,
    bonificacaoEntregue: 0,
    saldoAEntregar: 0,
    compras,
    entregasNoPeriodo: ledger.entregas.filter((e) => dentro(e.data)),
  };
  for (const c of compras) {
    resumo.volumeComprado += c.kg;
    resumo.bonificacaoGerada += c.gerado;
    resumo.bonificacaoEntregue += c.entregue;
  }
  resumo.saldoAEntregar = resumo.bonificacaoGerada - resumo.bonificacaoEntregue;
  return resumo;
}

export function statusDoPeriodo(resumo: ResumoPeriodo): ConferenciaStatus {
  if (resumo.volumeComprado <= 0) return "sem_compra";
  if (resumo.bonificacaoGerada <= 0) return resumo.bonificacaoEntregue > 0 ? "acima" : "sem_compra";
  if (resumo.bonificacaoEntregue <= 0) return "sem_bonificacao";
  const saldo = resumo.saldoAEntregar;
  if (Math.abs(saldo) <= resumo.bonificacaoGerada * TOLERANCIA) return "ok";
  return saldo > 0 ? "abaixo" : "acima";
}
