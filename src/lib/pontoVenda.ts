// Regras centrais da tela "Ponto de Venda".
// Reaproveita exclusivamente os dados de vendas já importados (sales_raw_rows)
// e o cadastro principal de clientes (client_profiles).

import { cleanProductName, extractProductCode, type SaleRow } from "@/hooks/useSalesData";
import { normalizeClientName } from "@/lib/clientNameNormalization";
import type { ClientProfile } from "@/types/clientProfile";

export const TIPOS_PONTO_VENDA = [
  "Supermercado",
  "Padaria",
  "Empório",
  "Sacolão",
  "Loja de conveniência",
  "Atacado",
  "Restaurante",
  "Outro",
] as const;

export type TipoPontoVenda = (typeof TIPOS_PONTO_VENDA)[number];

/** CPF/CNPJ normalizado (somente dígitos). Vazio quando inválido/ausente. */
export function normalizeDoc(value: string | null | undefined): string {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.length >= 11 ? digits : "";
}

export function isValidDoc(value: string | null | undefined): boolean {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.length === 11 || digits.length === 14;
}

/** Chave canônica por nome (alias-aware, sem acentos/pontuação). */
export function nameKey(value: string | null | undefined): string {
  return normalizeClientName(String(value ?? ""))
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizePhone(value: string | null | undefined): string {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("55")) return digits;
  if (digits.length <= 9) return `5531${digits}`;
  return `55${digits}`;
}

export function formatPhone(value: string | null | undefined): string {
  const d = String(value ?? "").replace(/\D/g, "").replace(/^55/, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return String(value ?? "");
}

export interface PdvOrderItem {
  codigoProduto: string;
  produto: string;
  quantidade: number;
  valor: number;
}

export interface PdvOrder {
  codigoVenda: number;
  data: string;
  valor: number;
  kg: number;
  vendedor: string;
  itens: PdvOrderItem[];
}

export interface PdvProdutoResumo {
  codigoProduto: string;
  produto: string;
  quantidadeTotal: number;
  ultimaCompra: string | null;
  quantidadeUltimoPedido: number;
  pedidos: number;
}

export interface PdvStats {
  pedidos: number;
  kg: number;
  faturamento: number;
  ultimoPedido: string | null;
  vendedor: string | null;
  produtos: PdvProdutoResumo[];
  orders: PdvOrder[];
}

export const EMPTY_STATS: PdvStats = {
  pedidos: 0,
  kg: 0,
  faturamento: 0,
  ultimoPedido: null,
  vendedor: null,
  produtos: [],
  orders: [],
};

export interface PdvSalesIndex {
  byKey: Map<string, PdvStats>;
  docToKey: Map<string, string>;
  keys: string[];
  labelByKey: Map<string, string>;
}

/**
 * Agrega as vendas por cliente.
 * IMPORTANTE: os itens são agrupados por código único do pedido ANTES de
 * calcular pedidos/faturamento, evitando duplicar pedidos por item.
 */
export function buildPdvSalesIndex(sales: SaleRow[]): PdvSalesIndex {
  const ordersByKey = new Map<string, Map<number, PdvOrder>>();
  const docToKey = new Map<string, string>();
  const labelByKey = new Map<string, string>();

  for (const sale of sales) {
    const cliente = normalizeClientName(String(sale.cliente ?? ""));
    const key = nameKey(cliente);
    if (!key) continue;
    if (!labelByKey.has(key)) labelByKey.set(key, cliente);

    const doc = normalizeDoc(sale.cnpj_cpf);
    if (doc && !docToKey.has(doc)) docToKey.set(doc, key);

    let orders = ordersByKey.get(key);
    if (!orders) {
      orders = new Map<number, PdvOrder>();
      ordersByKey.set(key, orders);
    }
    const codigo = Number(sale.codigo_venda ?? 0);
    let order = orders.get(codigo);
    if (!order) {
      order = {
        codigoVenda: codigo,
        data: String(sale.data ?? ""),
        valor: 0,
        kg: 0,
        vendedor: String(sale.vendedor ?? ""),
        itens: [],
      };
      orders.set(codigo, order);
    }
    if (String(sale.data ?? "") > order.data) order.data = String(sale.data ?? "");
    const quantidade = Number(sale.quantidade ?? 0);
    const valor = Number(sale.preco_total ?? 0);
    order.valor += valor;
    order.kg += quantidade;
    order.itens.push({
      codigoProduto: extractProductCode(sale.descricao),
      produto: cleanProductName(String(sale.descricao ?? "")),
      quantidade,
      valor,
    });
  }

  const byKey = new Map<string, PdvStats>();
  for (const [key, orders] of ordersByKey) {
    const list = [...orders.values()].sort((a, b) => b.data.localeCompare(a.data));
    const faturamento = list.reduce((s, o) => s + o.valor, 0);
    const kg = list.reduce((s, o) => s + o.kg, 0);
    const ultimo = list[0] ?? null;

    const produtosMap = new Map<string, PdvProdutoResumo>();
    for (const order of list) {
      const vistosNoPedido = new Set<string>();
      for (const item of order.itens) {
        const pk = `${item.codigoProduto}|${item.produto}`;
        const entry = produtosMap.get(pk) ?? {
          codigoProduto: item.codigoProduto,
          produto: item.produto,
          quantidadeTotal: 0,
          ultimaCompra: null,
          quantidadeUltimoPedido: 0,
          pedidos: 0,
        };
        entry.quantidadeTotal += item.quantidade;
        if (!entry.ultimaCompra || order.data > entry.ultimaCompra) {
          entry.ultimaCompra = order.data;
          entry.quantidadeUltimoPedido = 0;
        }
        if (entry.ultimaCompra === order.data) entry.quantidadeUltimoPedido += item.quantidade;
        if (!vistosNoPedido.has(pk)) {
          entry.pedidos += 1;
          vistosNoPedido.add(pk);
        }
        produtosMap.set(pk, entry);
      }
    }

    byKey.set(key, {
      pedidos: list.length,
      kg,
      faturamento,
      ultimoPedido: ultimo?.data ?? null,
      vendedor: ultimo?.vendedor ?? null,
      produtos: [...produtosMap.values()].sort((a, b) => b.quantidadeTotal - a.quantidadeTotal),
      orders: list,
    });
  }

  return { byKey, docToKey, keys: [...byKey.keys()], labelByKey };
}

/** Resolve as estatísticas de um cliente priorizando CPF/CNPJ e depois o nome. */
export function resolvePdvStats(index: PdvSalesIndex, profile: ClientProfile): PdvStats {
  const doc = normalizeDoc(profile.cnpj);
  if (doc) {
    const key = index.docToKey.get(doc);
    if (key) return index.byKey.get(key) ?? EMPTY_STATS;
  }
  const byNome = index.byKey.get(nameKey(profile.nome));
  if (byNome) return byNome;
  if (profile.nome_fantasia) {
    const byFantasia = index.byKey.get(nameKey(profile.nome_fantasia));
    if (byFantasia) return byFantasia;
  }
  return EMPTY_STATS;
}

export function diasSemComprar(ultimoPedido: string | null | undefined): number | null {
  if (!ultimoPedido) return null;
  const d = new Date(ultimoPedido);
  if (Number.isNaN(d.getTime())) return null;
  const hoje = new Date();
  const diff = Math.floor((hoje.getTime() - d.getTime()) / 86_400_000);
  return Math.max(diff, 0);
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

export function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatKg(value: number): string {
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} kg`;
}

export function shortAddress(p: ClientProfile): string {
  return [p.rua, p.numero, p.complemento].filter(Boolean).join(", ") || "—";
}

export function fullAddress(p: ClientProfile): string {
  return (
    [
      [p.rua, p.numero].filter(Boolean).join(", "),
      p.complemento,
      p.bairro,
      [p.cidade, p.estado].filter(Boolean).join(" / "),
      p.cep,
    ]
      .filter(Boolean)
      .join(" - ") || "—"
  );
}

/** Telefone principal: campo direto do cadastro ou primeiro contato preenchido. */
export function profilePhone(p: ClientProfile): string {
  if (p.telefone) return p.telefone;
  return p.contatos?.find((c) => c.telefone)?.telefone ?? "";
}

export function profileWhatsapp(p: ClientProfile): string {
  if (p.whatsapp) return p.whatsapp;
  return p.contatos?.find((c) => c.whatsapp)?.whatsapp ?? "";
}

/* ------------------------------------------------- vínculo cadastro x vendas */

export type PdvVinculo = "vinculado" | "aguardando" | "duplicidade" | "revisao";

export const VINCULO_LABEL: Record<PdvVinculo, string> = {
  vinculado: "Cadastro vinculado aos dados de vendas",
  aguardando: "Aguardando primeira venda importada",
  duplicidade: "Possível duplicidade",
  revisao: "Vínculo precisa de revisão",
};

export const VINCULO_SHORT: Record<PdvVinculo, string> = {
  vinculado: "Vinculado",
  aguardando: "Aguardando venda",
  duplicidade: "Possível duplicidade",
  revisao: "Revisar vínculo",
};

/**
 * Status do vínculo entre a ficha cadastral e os dados comerciais importados.
 * - vinculado: existem pedidos associados;
 * - duplicidade: outro cadastro concorre pelo mesmo cliente;
 * - revisao: há identificadores (código/CNPJ) mas nenhuma venda encontrada por eles;
 * - aguardando: cadastro novo, sem venda importada ainda.
 */
export function pdvVinculo(
  profile: ClientProfile,
  stats: PdvStats,
  duplicados = 0,
): PdvVinculo {
  if (duplicados > 0) return "duplicidade";
  if (stats.pedidos > 0) return "vinculado";
  const temIdentificador = Boolean(normalizeDoc(profile.cnpj) || String(profile.codigo_cliente ?? "").trim());
  const cadastradoHaMuitoTempo =
    profile.created_at && Date.now() - new Date(profile.created_at).getTime() > 60 * 86_400_000;
  if (temIdentificador && cadastradoHaMuitoTempo) return "revisao";
  return "aguardando";
}

export interface DuplicateHint {
  profile: ClientProfile;
  motivo: string;
}

export interface PdvIdentity {
  id?: string;
  codigo_cliente?: string;
  cnpj?: string;
  nome?: string;
  nome_fantasia?: string;
  cidade?: string;
}

/**
 * Possíveis duplicidades antes de criar um novo ponto de venda:
 * mesmo código, mesmo CPF/CNPJ, mesma razão social ou mesmo nome fantasia + cidade.
 */
export function findPossibleDuplicates(profiles: ClientProfile[], values: PdvIdentity): DuplicateHint[] {
  const codigo = String(values.codigo_cliente ?? "").trim();
  const doc = normalizeDoc(values.cnpj);
  const razao = nameKey(values.nome);
  const fantasia = nameKey(values.nome_fantasia);
  const cidade = nameKey(values.cidade);
  const out: DuplicateHint[] = [];
  for (const p of profiles) {
    if (values.id && p.id === values.id) continue;
    let motivo = "";
    if (codigo && String(p.codigo_cliente ?? "").trim() === codigo) motivo = "mesmo código do cliente";
    else if (doc && normalizeDoc(p.cnpj) === doc) motivo = "mesmo CPF/CNPJ";
    else if (razao && nameKey(p.nome) === razao) motivo = "mesma razão social";
    else if (fantasia && nameKey(p.nome_fantasia) === fantasia && (!cidade || nameKey(p.cidade) === cidade))
      motivo = "mesmo nome fantasia e cidade";
    if (motivo) out.push({ profile: p, motivo });
  }
  return out;
}

