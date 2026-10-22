/**
 * Camada de dados consolidada para o CRM Comercial.
 *
 * Regras:
 * - Itens_Venda  → granularidade de item (cada linha da planilha)
 * - Pedidos_Agregados → granularidade de pedido (agrupado por codigo_venda)
 * - Clientes → granularidade de cliente
 * - Produtos → granularidade de produto
 *
 * Cada dashboard deve usar a tabela certa para o tipo de métrica.
 */

import type { SaleRow } from "@/hooks/useSalesData";
import { cleanProductName, isProdutoAcabado, shortVendedorName } from "@/hooks/useSalesData";

// ======================== Tipos ========================

export interface PedidoAgregado {
  codigoVenda: number;
  data: string;
  cliente: string;
  vendedor: string;
  valorPedido: number;
  volumePedido: number;
  itensNoPedido: number;
}

export interface ClienteConsolidado {
  nome: string;
  vendedor: string;
  primeiroPedido: Date;
  ultimoPedido: Date;
  quantidadePedidos: number;
  faturamentoTotal: number;
  volumeTotal: number;
}

export interface ProdutoConsolidado {
  nome: string;
  quantidadeTotalVendida: number;
  faturamentoTotal: number;
  numeroPedidos: number;
}

export interface AuditInfo {
  linhasFiltradas: number;
  pedidosUnicos: number;
  clientesUnicos: number;
  faturamentoTotal: number;
  volumeTotal: number;
  ticketMedio: number;
  precoMedioKg: number;
  formulas: {
    faturamento: string;
    pedidos: string;
    clientesAtivos: string;
    volume: string;
    ticketMedio: string;
    precoMedioKg: string;
  };
}

export interface ConsolidatedData {
  pedidos: PedidoAgregado[];
  clientes: ClienteConsolidado[];
  produtos: ProdutoConsolidado[];
  audit: AuditInfo;
}

// ======================== Aggregation ========================

export function buildPedidosAgregados(items: SaleRow[]): PedidoAgregado[] {
  const orderMap = new Map<number, { rows: SaleRow[] }>();

  for (const item of items) {
    const entry = orderMap.get(item.codigo_venda);
    if (entry) {
      entry.rows.push(item);
    } else {
      orderMap.set(item.codigo_venda, { rows: [item] });
    }
  }

  const pedidos: PedidoAgregado[] = [];
  for (const [codigoVenda, { rows }] of orderMap) {
    const first = rows[0];
    let valorPedido = 0;
    let volumePedido = 0;
    for (const r of rows) {
      valorPedido += Number(r.preco_total);
      volumePedido += Number(r.quantidade);
    }
    pedidos.push({
      codigoVenda,
      data: first.data,
      cliente: first.cliente,
      vendedor: shortVendedorName(first.vendedor),
      valorPedido,
      volumePedido,
      itensNoPedido: rows.length,
    });
  }

  return pedidos.sort((a, b) => new Date(a.data).getTime() - new Date(b.data).getTime());
}

export function buildClientesConsolidados(pedidos: PedidoAgregado[]): ClienteConsolidado[] {
  const map = new Map<string, {
    vendedor: string;
    primeiroPedido: Date;
    ultimoPedido: Date;
    quantidadePedidos: number;
    faturamentoTotal: number;
    volumeTotal: number;
  }>();

  for (const p of pedidos) {
    const d = new Date(p.data);
    const entry = map.get(p.cliente);
    if (!entry) {
      map.set(p.cliente, {
        vendedor: p.vendedor,
        primeiroPedido: d,
        ultimoPedido: d,
        quantidadePedidos: 1,
        faturamentoTotal: p.valorPedido,
        volumeTotal: p.volumePedido,
      });
    } else {
      if (d < entry.primeiroPedido) entry.primeiroPedido = d;
      if (d > entry.ultimoPedido) entry.ultimoPedido = d;
      entry.quantidadePedidos++;
      entry.faturamentoTotal += p.valorPedido;
      entry.volumeTotal += p.volumePedido;
      entry.vendedor = p.vendedor; // most recent
    }
  }

  return [...map.entries()].map(([nome, v]) => ({
    nome,
    ...v,
  })).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

export function buildProdutosConsolidados(items: SaleRow[]): ProdutoConsolidado[] {
  const map = new Map<string, {
    quantidadeTotalVendida: number;
    faturamentoTotal: number;
    pedidos: Set<number>;
  }>();

  for (const item of items) {
    const nome = cleanProductName(item.descricao);
    if (!isProdutoAcabado(item)) continue;
    const entry = map.get(nome);
    if (!entry) {
      map.set(nome, {
        quantidadeTotalVendida: Number(item.quantidade),
        faturamentoTotal: Number(item.preco_total),
        pedidos: new Set([item.codigo_venda]),
      });
    } else {
      entry.quantidadeTotalVendida += Number(item.quantidade);
      entry.faturamentoTotal += Number(item.preco_total);
      entry.pedidos.add(item.codigo_venda);
    }
  }

  return [...map.entries()].map(([nome, v]) => ({
    nome,
    quantidadeTotalVendida: v.quantidadeTotalVendida,
    faturamentoTotal: v.faturamentoTotal,
    numeroPedidos: v.pedidos.size,
  })).sort((a, b) => b.faturamentoTotal - a.faturamentoTotal);
}

// ======================== KPI Calculations ========================

/** Faturamento: SUM(preco_total) a partir dos itens, sem duplicação */
export function calcFaturamento(items: SaleRow[]): number {
  return items.reduce((sum, r) => sum + Number(r.preco_total), 0);
}

/** Pedidos: COUNT DISTINCT codigo_venda */
export function calcPedidos(items: SaleRow[]): number {
  return new Set(items.map(r => r.codigo_venda)).size;
}

/** Clientes ativos: COUNT DISTINCT cliente */
export function calcClientesAtivos(items: SaleRow[]): number {
  return new Set(items.map(r => r.cliente)).size;
}

/** Volume: SUM(quantidade) */
export function calcVolume(items: SaleRow[]): number {
  return items.reduce((sum, r) => sum + Number(r.quantidade), 0);
}

/** Ticket médio: faturamento / pedidos */
export function calcTicketMedio(faturamento: number, pedidos: number): number {
  return pedidos > 0 ? faturamento / pedidos : 0;
}

/** Preço médio por kg: faturamento / volume */
export function calcPrecoMedioKg(faturamento: number, volume: number): number {
  return volume > 0 ? faturamento / volume : 0;
}

// ======================== Full consolidation ========================

export function consolidateData(items: SaleRow[]): ConsolidatedData {
  const pedidos = buildPedidosAgregados(items);
  const clientes = buildClientesConsolidados(pedidos);
  const produtos = buildProdutosConsolidados(items);

  const faturamento = calcFaturamento(items);
  const qtdPedidos = pedidos.length;
  const qtdClientes = clientes.length;
  const volume = calcVolume(items);
  const ticketMedio = calcTicketMedio(faturamento, qtdPedidos);
  const precoMedioKg = calcPrecoMedioKg(faturamento, volume);

  return {
    pedidos,
    clientes,
    produtos,
    audit: {
      linhasFiltradas: items.length,
      pedidosUnicos: qtdPedidos,
      clientesUnicos: qtdClientes,
      faturamentoTotal: faturamento,
      volumeTotal: volume,
      ticketMedio,
      precoMedioKg,
      formulas: {
        faturamento: "SUM(Preço Venda Total R$)",
        pedidos: "COUNT DISTINCT Código Venda",
        clientesAtivos: "COUNT DISTINCT Cliente",
        volume: "SUM(Quantidade)",
        ticketMedio: "Faturamento / Pedidos",
        precoMedioKg: "Faturamento / Volume",
      },
    },
  };
}

// ======================== Validation ========================

export interface ValidationResult {
  valid: boolean;
  issues: string[];
}

export function validateKpis(items: SaleRow[], audit: AuditInfo): ValidationResult {
  const issues: string[] = [];

  const sumPrecoTotal = items.reduce((s, r) => s + Number(r.preco_total), 0);
  if (Math.abs(sumPrecoTotal - audit.faturamentoTotal) > 0.01) {
    issues.push(`Faturamento inconsistente: calculado ${sumPrecoTotal.toFixed(2)} ≠ exibido ${audit.faturamentoTotal.toFixed(2)}`);
  }

  const distinctOrders = new Set(items.map(r => r.codigo_venda)).size;
  if (distinctOrders !== audit.pedidosUnicos) {
    issues.push(`Pedidos inconsistentes: calculado ${distinctOrders} ≠ exibido ${audit.pedidosUnicos}`);
  }

  const distinctClients = new Set(items.map(r => r.cliente)).size;
  if (distinctClients !== audit.clientesUnicos) {
    issues.push(`Clientes inconsistentes: calculado ${distinctClients} ≠ exibido ${audit.clientesUnicos}`);
  }

  const expectedTicket = audit.pedidosUnicos > 0 ? audit.faturamentoTotal / audit.pedidosUnicos : 0;
  if (Math.abs(expectedTicket - audit.ticketMedio) > 0.01) {
    issues.push(`Ticket médio inconsistente: esperado ${expectedTicket.toFixed(2)} ≠ exibido ${audit.ticketMedio.toFixed(2)}`);
  }

  const expectedPreco = audit.volumeTotal > 0 ? audit.faturamentoTotal / audit.volumeTotal : 0;
  if (Math.abs(expectedPreco - audit.precoMedioKg) > 0.01) {
    issues.push(`Preço médio/kg inconsistente: esperado ${expectedPreco.toFixed(2)} ≠ exibido ${audit.precoMedioKg.toFixed(2)}`);
  }

  return { valid: issues.length === 0, issues };
}
