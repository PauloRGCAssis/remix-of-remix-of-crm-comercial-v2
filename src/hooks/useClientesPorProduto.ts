import { useMemo } from "react";
import {
  SaleRow,
  cleanProductName,
  extractProductCode,
  filterByDateRange,
  isCommercialProductDescription,
  productKey,
  shortVendedorName,
} from "@/hooks/useSalesData";
import { normalizeClientName } from "@/lib/clientNameNormalization";
import type { ClientProfile } from "@/types/clientProfile";

export type AnalysisMode = "any" | "all";

export interface ClientesPorProdutoFilters {
  inicio: string;
  fim: string;
  produtos: string[]; // canonical product names (productKey)
  vendedores: string[];
  modo: AnalysisMode;
}

export interface LinhaClienteProduto {
  cliente: string;
  clienteKey: string;
  codigoCliente: string;
  cidade: string;
  vendedor: string;
  produto: string;
  codigoProduto: string;
  quantidade: number;
  faturamento: number;
  precoMedio: number;
  numPedidos: number;
  ultimaCompra: string;
  frequenciaDias: number | null;
  // participações
  participacaoNoCliente: number; // % do produto no faturamento do cliente (no período, considerando só produtos filtrados)
  participacaoNoProduto: number; // % do cliente no faturamento total daquele produto (no período)
}

export interface ClienteAgregado {
  cliente: string;
  clienteKey: string;
  codigoCliente: string;
  cidade: string;
  vendedor: string;
  faturamentoFiltrado: number;
  faturamentoTotalCliente: number;
  quantidadeFiltrada: number;
  numPedidos: number;
  ultimaCompra: string;
  dependencia: number; // % filtrado / total cliente no período
  produtos: LinhaClienteProduto[];
}

export interface VendedorImpactado {
  vendedor: string;
  clientes: number;
  faturamento: number;
  quantidade: number;
  participacao: number;
}

export interface ProdutoRelacionado {
  produto: string;
  clientesEmComum: number;
  faturamento: number;
  quantidade: number;
}

export interface ClientesPorProdutoData {
  linhas: LinhaClienteProduto[];
  clientes: ClienteAgregado[];
  resumo: {
    clientesCompradores: number;
    faturamento: number;
    quantidade: number;
    ticketMedio: number;
    participacaoNoTotal: number;
    faturamentoTotalEmpresa: number;
  };
  impacto: {
    clientesImpactados: number;
    dependenciaAlta: number; // > 50%
    dependenciaBaixa: number; // < 5%
    faturamentoEmRisco: number;
    quantidadeEmRisco: number;
  };
  vendedoresImpactados: VendedorImpactado[];
  produtosRelacionados: ProdutoRelacionado[];
  distribuicaoDependencia: { faixa: string; clientes: number; color: string }[];
  fatPorVendedor: { vendedor: string; faturamento: number }[];
  pareto: { cliente: string; faturamento: number; acumuladoPct: number }[];
}

const dependenciaCor = (pct: number) => {
  if (pct > 50) return "hsl(0, 72%, 51%)";
  if (pct > 20) return "hsl(38, 92%, 50%)";
  return "hsl(142, 60%, 40%)";
};

export function useClientesPorProduto(
  sales: SaleRow[] | undefined,
  profiles: ClientProfile[] | undefined,
  filters: ClientesPorProdutoFilters,
): ClientesPorProdutoData {
  return useMemo(() => {
    const empty: ClientesPorProdutoData = {
      linhas: [],
      clientes: [],
      resumo: {
        clientesCompradores: 0,
        faturamento: 0,
        quantidade: 0,
        ticketMedio: 0,
        participacaoNoTotal: 0,
        faturamentoTotalEmpresa: 0,
      },
      impacto: {
        clientesImpactados: 0,
        dependenciaAlta: 0,
        dependenciaBaixa: 0,
        faturamentoEmRisco: 0,
        quantidadeEmRisco: 0,
      },
      vendedoresImpactados: [],
      produtosRelacionados: [],
      distribuicaoDependencia: [
        { faixa: "Até 20%", clientes: 0, color: "hsl(142, 60%, 40%)" },
        { faixa: "20% a 50%", clientes: 0, color: "hsl(38, 92%, 50%)" },
        { faixa: "Acima de 50%", clientes: 0, color: "hsl(0, 72%, 51%)" },
      ],
      fatPorVendedor: [],
      pareto: [],
    };

    if (!sales || sales.length === 0) return empty;
    if (!filters.inicio || !filters.fim) return empty;

    const noPeriodo = filterByDateRange(sales, filters.inicio, filters.fim)
      .filter((s) => isCommercialProductDescription(s.descricao));

    const vendFilter = new Set(filters.vendedores.map((v) => v.toLowerCase()));
    const prodSet = new Set(filters.produtos);

    // Perfis por clienteKey (normalizado)
    const profileByKey = new Map<string, ClientProfile>();
    for (const p of profiles ?? []) {
      const key = normalizeClientName(String(p.nome ?? ""));
      if (key && !profileByKey.has(key)) profileByKey.set(key, p);
    }

    // Linhas filtradas por vendedor (filtragem global do período para participações)
    const linhasNoPeriodo = noPeriodo.filter((s) => {
      if (vendFilter.size === 0) return true;
      return vendFilter.has(shortVendedorName(String(s.vendedor ?? "")).toLowerCase());
    });

    const faturamentoTotalEmpresa = linhasNoPeriodo.reduce((acc, r) => acc + Number(r.preco_total ?? 0), 0);

    // Faturamento total por cliente no período (qualquer produto comercial)
    const fatTotalPorCliente = new Map<string, number>();
    for (const r of linhasNoPeriodo) {
      const k = r.cliente;
      fatTotalPorCliente.set(k, (fatTotalPorCliente.get(k) ?? 0) + Number(r.preco_total ?? 0));
    }

    // Restringe às linhas dos produtos selecionados
    const linhasProdutos = filters.produtos.length === 0
      ? linhasNoPeriodo
      : linhasNoPeriodo.filter((s) => prodSet.has(productKey(s.descricao)));

    if (linhasProdutos.length === 0) {
      return {
        ...empty,
        resumo: { ...empty.resumo, faturamentoTotalEmpresa },
      };
    }

    // Para o modo ALL precisamos saber, para cada cliente, quais produtos
    // selecionados ele comprou.
    const produtosPorCliente = new Map<string, Set<string>>();
    for (const r of linhasProdutos) {
      const pk = productKey(r.descricao);
      let set = produtosPorCliente.get(r.cliente);
      if (!set) {
        set = new Set();
        produtosPorCliente.set(r.cliente, set);
      }
      set.add(pk);
    }

    const clientesValidos = new Set<string>();
    if (filters.modo === "all" && filters.produtos.length > 1) {
      for (const [cli, set] of produtosPorCliente.entries()) {
        if (filters.produtos.every((p) => set.has(p))) clientesValidos.add(cli);
      }
    } else {
      for (const cli of produtosPorCliente.keys()) clientesValidos.add(cli);
    }

    const linhasFinais = linhasProdutos.filter((r) => clientesValidos.has(r.cliente));

    // Faturamento por produto (somente clientes válidos) — usado p/ participação cliente x produto
    const fatPorProduto = new Map<string, number>();
    for (const r of linhasFinais) {
      const pk = productKey(r.descricao);
      fatPorProduto.set(pk, (fatPorProduto.get(pk) ?? 0) + Number(r.preco_total ?? 0));
    }

    // Agrega por (cliente, produto)
    interface Bucket {
      qtd: number;
      fat: number;
      pedidos: Set<number>;
      datas: number[];
      codigo: string;
      produto: string;
      cliente: string;
      vendedor: string;
    }
    const bucket = new Map<string, Bucket>();
    for (const r of linhasFinais) {
      const pk = productKey(r.descricao);
      const key = `${r.cliente}||${pk}`;
      let b = bucket.get(key);
      if (!b) {
        b = {
          qtd: 0,
          fat: 0,
          pedidos: new Set(),
          datas: [],
          codigo: extractProductCode(String(r.descricao ?? "")),
          produto: pk,
          cliente: r.cliente,
          vendedor: shortVendedorName(String(r.vendedor ?? "")),
        };
        bucket.set(key, b);
      }
      b.qtd += Number(r.quantidade ?? 0);
      b.fat += Number(r.preco_total ?? 0);
      b.pedidos.add(Number(r.codigo_venda ?? 0));
      const t = new Date(r.data).getTime();
      if (Number.isFinite(t)) b.datas.push(t);
      // Mantém o vendedor mais recente
      const recente = b.datas.length > 0 ? Math.max(...b.datas) : 0;
      if (t >= recente) b.vendedor = shortVendedorName(String(r.vendedor ?? ""));
    }

    // Faturamento "filtrado" por cliente (soma só dos produtos selecionados)
    const fatFiltradoPorCliente = new Map<string, number>();
    const qtdFiltradaPorCliente = new Map<string, number>();
    for (const b of bucket.values()) {
      fatFiltradoPorCliente.set(b.cliente, (fatFiltradoPorCliente.get(b.cliente) ?? 0) + b.fat);
      qtdFiltradaPorCliente.set(b.cliente, (qtdFiltradaPorCliente.get(b.cliente) ?? 0) + b.qtd);
    }

    const linhas: LinhaClienteProduto[] = [];
    for (const b of bucket.values()) {
      const datasOrdenadas = [...b.datas].sort((a, c) => a - c);
      const ultima = datasOrdenadas[datasOrdenadas.length - 1];
      const ultimaCompra = ultima ? new Date(ultima).toISOString().slice(0, 10) : "";
      let freq: number | null = null;
      if (datasOrdenadas.length >= 2) {
        const diffs: number[] = [];
        for (let i = 1; i < datasOrdenadas.length; i++) {
          diffs.push((datasOrdenadas[i] - datasOrdenadas[i - 1]) / (1000 * 60 * 60 * 24));
        }
        freq = diffs.reduce((s, x) => s + x, 0) / diffs.length;
      }
      const profile = profileByKey.get(b.cliente);
      const fatTotalCli = fatTotalPorCliente.get(b.cliente) ?? 0;
      const fatProd = fatPorProduto.get(b.produto) ?? 0;
      linhas.push({
        cliente: profile?.nome_fantasia || profile?.nome || b.cliente,
        clienteKey: b.cliente,
        codigoCliente: profile?.cnpj ?? "",
        cidade: profile?.cidade ?? "",
        vendedor: profile?.vendedor || b.vendedor || "",
        produto: b.produto,
        codigoProduto: b.codigo,
        quantidade: b.qtd,
        faturamento: b.fat,
        precoMedio: b.qtd > 0 ? b.fat / b.qtd : 0,
        numPedidos: b.pedidos.size,
        ultimaCompra,
        frequenciaDias: freq,
        participacaoNoCliente: fatTotalCli > 0 ? (b.fat / fatTotalCli) * 100 : 0,
        participacaoNoProduto: fatProd > 0 ? (b.fat / fatProd) * 100 : 0,
      });
    }

    linhas.sort((a, b) => b.faturamento - a.faturamento);

    // Agregação por cliente
    const mapCli = new Map<string, ClienteAgregado>();
    for (const l of linhas) {
      let c = mapCli.get(l.clienteKey);
      if (!c) {
        const fatTotalCli = fatTotalPorCliente.get(l.clienteKey) ?? 0;
        const fatFiltCli = fatFiltradoPorCliente.get(l.clienteKey) ?? 0;
        c = {
          cliente: l.cliente,
          clienteKey: l.clienteKey,
          codigoCliente: l.codigoCliente,
          cidade: l.cidade,
          vendedor: l.vendedor,
          faturamentoFiltrado: fatFiltCli,
          faturamentoTotalCliente: fatTotalCli,
          quantidadeFiltrada: qtdFiltradaPorCliente.get(l.clienteKey) ?? 0,
          numPedidos: 0,
          ultimaCompra: "",
          dependencia: fatTotalCli > 0 ? (fatFiltCli / fatTotalCli) * 100 : 0,
          produtos: [],
        };
        mapCli.set(l.clienteKey, c);
      }
      c.produtos.push(l);
      c.numPedidos = Math.max(c.numPedidos, l.numPedidos);
      if (!c.ultimaCompra || (l.ultimaCompra && l.ultimaCompra > c.ultimaCompra)) {
        c.ultimaCompra = l.ultimaCompra;
      }
    }
    const clientes = [...mapCli.values()].sort((a, b) => b.faturamentoFiltrado - a.faturamentoFiltrado);

    // Resumo
    const faturamento = linhas.reduce((s, l) => s + l.faturamento, 0);
    const quantidade = linhas.reduce((s, l) => s + l.quantidade, 0);
    const totalPedidos = new Set(linhasFinais.map((r) => r.codigo_venda)).size;
    const resumo = {
      clientesCompradores: clientes.length,
      faturamento,
      quantidade,
      ticketMedio: totalPedidos > 0 ? faturamento / totalPedidos : 0,
      participacaoNoTotal: faturamentoTotalEmpresa > 0 ? (faturamento / faturamentoTotalEmpresa) * 100 : 0,
      faturamentoTotalEmpresa,
    };

    // Impacto
    const impacto = {
      clientesImpactados: clientes.length,
      dependenciaAlta: clientes.filter((c) => c.dependencia > 50).length,
      dependenciaBaixa: clientes.filter((c) => c.dependencia < 5).length,
      faturamentoEmRisco: faturamento,
      quantidadeEmRisco: quantidade,
    };

    // Vendedores impactados
    const vendMap = new Map<string, { clientes: Set<string>; fat: number; qtd: number }>();
    for (const c of clientes) {
      const v = c.vendedor || "(sem vendedor)";
      let e = vendMap.get(v);
      if (!e) {
        e = { clientes: new Set(), fat: 0, qtd: 0 };
        vendMap.set(v, e);
      }
      e.clientes.add(c.clienteKey);
      e.fat += c.faturamentoFiltrado;
      e.qtd += c.quantidadeFiltrada;
    }
    const vendedoresImpactados: VendedorImpactado[] = [...vendMap.entries()]
      .map(([vendedor, e]) => ({
        vendedor,
        clientes: e.clientes.size,
        faturamento: e.fat,
        quantidade: e.qtd,
        participacao: faturamento > 0 ? (e.fat / faturamento) * 100 : 0,
      }))
      .sort((a, b) => b.faturamento - a.faturamento);

    // Produtos relacionados — quem comprou os produtos selecionados também comprou:
    const clientesValidosSet = new Set(clientes.map((c) => c.clienteKey));
    const relMap = new Map<string, { clientes: Set<string>; fat: number; qtd: number }>();
    for (const r of linhasNoPeriodo) {
      if (!clientesValidosSet.has(r.cliente)) continue;
      const pk = productKey(r.descricao);
      if (prodSet.has(pk)) continue;
      let e = relMap.get(pk);
      if (!e) {
        e = { clientes: new Set(), fat: 0, qtd: 0 };
        relMap.set(pk, e);
      }
      e.clientes.add(r.cliente);
      e.fat += Number(r.preco_total ?? 0);
      e.qtd += Number(r.quantidade ?? 0);
    }
    const produtosRelacionados: ProdutoRelacionado[] = [...relMap.entries()]
      .map(([produto, e]) => ({
        produto,
        clientesEmComum: e.clientes.size,
        faturamento: e.fat,
        quantidade: e.qtd,
      }))
      .sort((a, b) => b.clientesEmComum - a.clientesEmComum || b.faturamento - a.faturamento)
      .slice(0, 10);

    // Distribuição de dependência
    let baixa = 0, media = 0, alta = 0;
    for (const c of clientes) {
      if (c.dependencia > 50) alta++;
      else if (c.dependencia > 20) media++;
      else baixa++;
    }
    const distribuicaoDependencia = [
      { faixa: "Até 20%", clientes: baixa, color: "hsl(142, 60%, 40%)" },
      { faixa: "20% a 50%", clientes: media, color: "hsl(38, 92%, 50%)" },
      { faixa: "Acima de 50%", clientes: alta, color: "hsl(0, 72%, 51%)" },
    ];

    const fatPorVendedor = vendedoresImpactados.map((v) => ({ vendedor: v.vendedor, faturamento: v.faturamento }));

    // Pareto
    const top = clientes.slice(0, 30);
    let acc = 0;
    const pareto = top.map((c) => {
      acc += c.faturamentoFiltrado;
      return {
        cliente: c.cliente,
        faturamento: c.faturamentoFiltrado,
        acumuladoPct: faturamento > 0 ? (acc / faturamento) * 100 : 0,
      };
    });

    return {
      linhas,
      clientes,
      resumo,
      impacto,
      vendedoresImpactados,
      produtosRelacionados,
      distribuicaoDependencia,
      fatPorVendedor,
      pareto,
    };
  }, [sales, profiles, filters.inicio, filters.fim, filters.produtos.join("|"), filters.vendedores.join("|"), filters.modo]);
}

export { dependenciaCor };
