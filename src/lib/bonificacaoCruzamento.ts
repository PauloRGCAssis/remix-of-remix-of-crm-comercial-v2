// Motor de cruzamento do "Controle de Bonificações".
//
// Fontes (todas já importadas no CRM — esta tela NUNCA importa vendas):
//  - vendas (`sales_raw_rows` via useSalesData)  -> volume comprado + faturamento
//  - bonificações (`bonificacao_rows`)            -> bonificação entregue
//  - cadastro (`bonificacao_cadastro`)            -> % de negociação do cliente
//
// Regra comercial: % de negociação SEMPRE sobre o volume comprado.
//   10 kg comprados + 2 kg bonificados = 2 / 10 = 20%  (nunca 2 / 12)
//   Bonificação gerada = volume comprado × %

import {
  normKey,
  produtoFamilia,
  tokens,
  type BonificacaoCadastro,
  type BonificacaoRow,
  type ConferenciaStatus,
} from "./bonificacaoLogic";

export interface VendaFonte {
  data: string;
  codigo_venda: number | string | null;
  cliente: string;
  cnpj_cpf?: string | null;
  vendedor?: string | null;
  descricao: string;
  quantidade: number;
  preco_total: number;
}

export interface CompraDetalhe {
  data: string;
  codigoVenda: string | null;
  cliente: string;
  produto: string;
  kg: number;
  valor: number;
}

export type VinculoOrigem = "codigo" | "data" | "proximidade" | "manual" | "pendente" | "sem_pedido";

export interface EntregaDetalhe {
  /** id da linha em `bonificacao_rows` (usado no vínculo manual) */
  id: number;
  data: string | null;
  codigoVenda: string | null;
  cliente: string;
  produto: string;
  categoria: string;
  kg: number;
  /** como esta entrega foi vinculada a um pedido */
  vinculo?: VinculoOrigem;
}

/** Vínculo manual persistido: pedido escolhido pelo usuário (ou desvinculado). */
export interface VinculoManual {
  codigoVenda: string | null;
  desvinculado: boolean;
}


export interface MesBonificacao {
  mes: string;
  volumeComprado: number;
  faturamento: number;
  bonificacaoGerada: number;
  bonificacaoEntregue: number;
  saldo: number;
  pctReal: number;
}

export interface PedidoItem {
  produto: string;
  kg: number;
  valor: number;
}

/** Um pedido (código de venda) do cliente dentro do período, com auditoria da bonificação. */
export interface PedidoBonificacao {
  codigo: string | null;
  data: string | null;
  cliente: string;
  itens: PedidoItem[];
  kg: number;
  valor: number;
  /** volume × % de negociação */
  esperado: number;
  entregue: number;
  /** entregue - esperado (negativo = faltou) */
  diferenca: number;
  divergente: boolean;
  categorias: string[];
  entregas: EntregaDetalhe[];
  /** entrega sem pedido de compra correspondente */
  semCompra: boolean;
  /** bonificação que não pôde ser conciliada com segurança (vários pedidos no dia) */
  pendenteConciliacao?: boolean;
}


export interface LinhaClienteBonificacao {
  clienteKey: string;
  cliente: string;
  /** identificação curta da unidade/endereço (usada quando há nomes iguais) */
  unidade: string | null;
  vendedor: string | null;
  itens: BonificacaoCadastro[];
  produtos: string[];
  categorias: string[];
  nomesVendas: string[];
  /** % efetivo aplicado (20 = 20%) */
  pct: number;
  pctManual: boolean;
  /** % estimado pelo histórico completo (entregue ÷ comprado) */
  pctSugerido: number | null;
  volumeComprado: number;
  faturamento: number;
  bonificacaoGerada: number;
  bonificacaoEntregue: number;
  saldoAEntregar: number;
  status: ConferenciaStatus;
  compras: CompraDetalhe[];
  entregas: EntregaDetalhe[];
  pedidos: PedidoBonificacao[];
  qtdPedidos: number;
  historico: MesBonificacao[];
}


const TOLERANCIA = 0.05;

const digits = (v: unknown) => String(v ?? "").replace(/\D+/g, "");

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (!m || !n) return m || n;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

const tokenCache = new Map<string, string[]>();
function tokensCache(nome: string): string[] {
  let t = tokenCache.get(nome);
  if (!t) {
    t = tokens(nome);
    tokenCache.set(nome, t);
  }
  return t;
}

/**
 * Um token do cadastro casa com o nome de venda?
 * Tolera erros de digitação ("Armazen" x "Armazem") e nomes de filial extras.
 */
function tokenCasa(token: string, alvo: string[]): boolean {
  return alvo.some((a) => {
    if (a === token) return true;
    if (token.length >= 4 && (a.startsWith(token) || token.startsWith(a))) return true;
    if (token.length >= 5 && Math.abs(a.length - token.length) <= 2) return levenshtein(a, token) <= 1;
    return false;
  });
}

function casaTokens(cadastro: string[], alvo: string[]): boolean {
  if (!cadastro.length || !alvo.length) return false;
  return cadastro.every((token) => tokenCasa(token, alvo));
}

/** O nome da venda/bonificação pertence a este cliente do cadastro? */
export function clienteCasa(nomeCadastro: string, nomeBase: string): boolean {
  return casaTokens(tokensCache(nomeCadastro), tokensCache(nomeBase));
}


/**
 * Padroniza a % para os percentuais comerciais usados na operação
 * (10%, 15%, 20%, 25%, 30%...). Evita exibir 16,7% ou 9,09%.
 */
export function padronizarPct(pct: number): number {
  if (!Number.isFinite(pct) || pct <= 0) return 0;
  const multiplo = Math.round(pct / 5) * 5;
  if (multiplo > 0 && Math.abs(pct - multiplo) <= 4) return multiplo;
  return Math.round(pct);
}

/** % de negociação = kg bonificados ÷ kg comprados × 100 */
export function pctSobreCompra(kgBonificado: number, kgComprado: number): number {
  if (!kgComprado || kgComprado <= 0) return 0;
  return (kgBonificado / kgComprado) * 100;
}

export function statusLinha(comprado: number, gerada: number, entregue: number): ConferenciaStatus {
  if (comprado <= 0) return "sem_compra";
  if (gerada <= 0) return entregue > 0 ? "acima" : "sem_compra";
  if (entregue <= 0) return "sem_bonificacao";
  const saldo = gerada - entregue;
  if (Math.abs(saldo) <= gerada * TOLERANCIA) return "ok";
  return saldo > 0 ? "abaixo" : "acima";
}

const mesDeIso = (d: string | null | undefined) => String(d ?? "").slice(0, 7);
const diaDeIso = (d: string | null | undefined) => String(d ?? "").slice(0, 10);

interface Params {
  cadastro: BonificacaoCadastro[];
  vendas: VendaFonte[];
  bonificacoes: BonificacaoRow[];
  /** categorias de bonificação selecionadas (vazio = todas) */
  categorias: string[];
  inicio: string;
  fim: string;
  /** meses exibidos no histórico do cliente */
  janela: string[];
  /** vínculos manuais bonificação -> pedido (por id de `bonificacao_rows`) */
  vinculos?: Map<number, VinculoManual>;

}

/**
 * Cruza automaticamente vendas + bonificações + cadastro, agrupando por CLIENTE.
 * Nenhum dado é importado aqui: tudo vem das bases já existentes no CRM.
 */
export function montarLinhasClientes({
  cadastro,
  vendas,
  bonificacoes,
  categorias,
  inicio,
  fim,
  janela,
  vinculos,

}: Params): LinhaClienteBonificacao[] {
  const catSel = new Set(categorias);

  // ---- índices por nome normalizado -------------------------------------
  const vendasPorNome = new Map<string, VendaFonte[]>();
  const cnpjPorNome = new Map<string, Set<string>>();
  for (const v of vendas) {
    const key = normKey(v.cliente);
    const arr = vendasPorNome.get(key);
    if (arr) arr.push(v);
    else vendasPorNome.set(key, [v]);
    const cn = digits(v.cnpj_cpf);
    if (cn.length >= 11) {
      const set = cnpjPorNome.get(key) ?? new Set<string>();
      set.add(cn);
      cnpjPorNome.set(key, set);
    }
  }

  const bonifPorNome = new Map<string, BonificacaoRow[]>();
  for (const b of bonificacoes) {
    if (catSel.size && !catSel.has(b.categoria)) continue;
    const key = normKey(b.cliente);
    const arr = bonifPorNome.get(key);
    if (arr) arr.push(b);
    else bonifPorNome.set(key, [b]);
  }

  const nomesVendas = [...vendasPorNome.keys()].map((n) => ({ nome: n, tk: tokensCache(n) }));
  const nomesBonif = [...bonifPorNome.keys()].map((n) => ({ nome: n, tk: tokensCache(n) }));


  // ---- agrupa o cadastro por cliente -------------------------------------
  // Unidades diferentes do mesmo nome comercial são separadas pelo CNPJ.
  const grupos = new Map<string, BonificacaoCadastro[]>();
  const cnpjsPorBase = new Map<string, Set<string>>();
  for (const c of cadastro) {
    const base = c.cliente_key || normKey(c.cliente);
    const cn = digits(c.cnpj_cpf);
    if (cn.length >= 11) {
      const s = cnpjsPorBase.get(base) ?? new Set<string>();
      s.add(cn);
      cnpjsPorBase.set(base, s);
    }
  }
  for (const c of cadastro) {
    const base = c.cliente_key || normKey(c.cliente);
    const cn = digits(c.cnpj_cpf);
    // sem CNPJ: só entra na chave do CNPJ único quando o cadastro tem 1 unidade
    const unico = cnpjsPorBase.get(base);
    const key =
      cn.length >= 11 ? `${base}#${cn}` : unico && unico.size === 1 ? `${base}#${[...unico][0]}` : base;
    const arr = grupos.get(key);
    if (arr) arr.push(c);
    else grupos.set(key, [c]);
  }

  const dentro = (d: string | null | undefined) => {
    const dia = diaDeIso(d);
    if (!dia) return false;
    if (inicio && dia < inicio) return false;
    if (fim && dia > fim) return false;
    return true;
  };

  const linhas: LinhaClienteBonificacao[] = [];

  for (const [grupoKey, itens] of grupos) {
    const principal = itens[0];
    const familias = new Set(itens.map((i) => produtoFamilia(i.produto)));
    const cnpjCadastro = new Set(itens.map((i) => digits(i.cnpj_cpf)).filter((d) => d.length >= 11));

    const casaPorCnpj = (nome: string) => {
      if (!cnpjCadastro.size) return false;
      const set = cnpjPorNome.get(nome);
      if (!set) return false;
      for (const cn of set) if (cnpjCadastro.has(cn)) return true;
      return false;
    };

    const tkCadastro = tokensCache(principal.cliente);
    const alvosVendas = nomesVendas
      .filter((n) => (cnpjCadastro.size ? casaPorCnpj(n.nome) : false) || casaTokens(tkCadastro, n.tk))
      .map((n) => n.nome);
    const alvosBonif = nomesBonif.filter((n) => casaTokens(tkCadastro, n.tk)).map((n) => n.nome);

    // ---- separa UNIDADES (mesmo nome comercial, cadastros diferentes) -----
    interface Unidade {
      key: string;
      nomes: string[];
      cnpjs: Set<string>;
      label: string;
      tk: string[];
    }
    const unidades = new Map<string, Unidade>();
    for (const nome of alvosVendas) {
      const cnpjs = cnpjPorNome.get(nome) ?? new Set<string>();
      const cnpj = cnpjs.size ? [...cnpjs].sort()[0] : "";
      const key = cnpj || nome;
      const atual = unidades.get(key);
      const raw = vendasPorNome.get(nome)?.[0]?.cliente ?? nome;
      if (atual) {
        atual.nomes.push(nome);
        for (const c of cnpjs) atual.cnpjs.add(c);
      } else {
        unidades.set(key, { key, nomes: [nome], cnpjs: new Set(cnpjs), label: raw, tk: tokensCache(nome) });
      }
    }
    if (unidades.size === 0) {
      unidades.set(grupoKey, {
        key: grupoKey,
        nomes: [],
        cnpjs: new Set(cnpjCadastro),
        label: principal.cliente,
        tk: tkCadastro,
      });
    }
    const listaUnidades = [...unidades.values()];
    const multiplas = listaUnidades.length > 1;

    // ---- distribui as bonificações entre as unidades ----------------------
    const entregasPorUnidade = new Map<string, EntregaDetalhe[]>();
    for (const u of listaUnidades) entregasPorUnidade.set(u.key, []);
    for (const nome of alvosBonif) {
      for (const b of bonifPorNome.get(nome) ?? []) {
        if (!familias.has(produtoFamilia(b.produto))) continue;
        const cn = digits(b.cnpj_cpf);
        let alvo = listaUnidades[0];
        if (multiplas) {
          const porCnpj = cn.length >= 11 ? listaUnidades.find((u) => u.cnpjs.has(cn)) : undefined;
          if (porCnpj) alvo = porCnpj;
          else {
            const tk = tokensCache(nome);
            let melhor = -1;
            for (const u of listaUnidades) {
              const score = u.tk.filter((t) => tk.includes(t)).length;
              if (score > melhor) {
                melhor = score;
                alvo = u;
              }
            }
          }
        }
        entregasPorUnidade.get(alvo.key)!.push({
          id: Number(b.id),
          data: b.data,
          codigoVenda: b.codigo_venda ?? null,

          cliente: b.cliente,
          produto: b.produto,
          categoria: b.categoria,
          kg: Number(b.quantidade) || 0,
        });
      }
    }

    for (const u of listaUnidades) {
      // ---- compras (vendas) da unidade ------------------------------------
      const comprasTodas: CompraDetalhe[] = [];
      for (const nome of u.nomes) {
        for (const v of vendasPorNome.get(nome) ?? []) {
          if (!familias.has(produtoFamilia(v.descricao))) continue;
          comprasTodas.push({
            data: v.data,
            codigoVenda: v.codigo_venda != null ? String(v.codigo_venda) : null,
            cliente: v.cliente,
            produto: v.descricao,
            kg: Number(v.quantidade) || 0,
            valor: Number(v.preco_total) || 0,
          });
        }
      }
      const entregasTodas = entregasPorUnidade.get(u.key) ?? [];

      // ---- % de negociação -------------------------------------------------
      const kgHistCompra = comprasTodas.reduce((a, c) => a + c.kg, 0);
      const kgHistEntrega = entregasTodas.reduce((a, e) => a + e.kg, 0);
      const pctSugerido =
        kgHistCompra > 0 && kgHistEntrega > 0 ? padronizarPct(pctSobreCompra(kgHistEntrega, kgHistCompra)) : null;

      const manual = itens.map((i) => i.pct_negociacao).find((p) => p != null && Number(p) > 0);
      const pctManual = manual != null;
      const pctRegra = (Number(principal.produtos_bonificados) || 0) * 10; // 2 kg/10 kg = 20%
      const pct = pctManual ? Number(manual) : (pctSugerido ?? padronizarPct(pctRegra));

      // ---- recorte do período ---------------------------------------------
      const compras = comprasTodas.filter((c) => dentro(c.data)).sort((a, b) => a.data.localeCompare(b.data));
      const entregas = entregasTodas
        .filter((e) => dentro(e.data))
        .sort((a, b) => String(a.data ?? "").localeCompare(String(b.data ?? "")));

      const volumeComprado = compras.reduce((a, c) => a + c.kg, 0);
      const faturamento = compras.reduce((a, c) => a + c.valor, 0);
      const bonificacaoEntregue = entregas.reduce((a, e) => a + e.kg, 0);
      const bonificacaoGerada = volumeComprado * (pct / 100);

      const pedidos = montarPedidos(compras, entregas, pct, vinculos);

      // ---- histórico mensal -------------------------------------------------
      const historico: MesBonificacao[] = janela.map((mes) => {
        let vol = 0;
        let fat = 0;
        for (const c of comprasTodas) {
          if (mesDeIso(c.data) !== mes) continue;
          vol += c.kg;
          fat += c.valor;
        }
        let ent = 0;
        for (const e of entregasTodas) if (mesDeIso(e.data) === mes) ent += e.kg;
        const ger = vol * (pct / 100);
        return {
          mes,
          volumeComprado: vol,
          faturamento: fat,
          bonificacaoGerada: ger,
          bonificacaoEntregue: ent,
          saldo: ger - ent,
          pctReal: pctSobreCompra(ent, vol),
        };
      });

      linhas.push({
        clienteKey: multiplas ? `${grupoKey}::${u.key}` : grupoKey,
        cliente: multiplas ? u.label : principal.cliente,
        unidade: multiplas ? unidadeCurta(u.label, principal.cliente) : null,
        vendedor: itens.map((i) => i.vendedor).find(Boolean) ?? null,
        itens,
        produtos: [...new Set(itens.map((i) => i.produto))],
        categorias: [...new Set(itens.map((i) => i.categoria).filter(Boolean))],
        nomesVendas: [...new Set(compras.map((c) => c.cliente))],
        pct,
        pctManual,
        pctSugerido,
        volumeComprado,
        faturamento,
        bonificacaoGerada,
        bonificacaoEntregue,
        saldoAEntregar: bonificacaoGerada - bonificacaoEntregue,
        status: statusLinha(volumeComprado, bonificacaoGerada, bonificacaoEntregue),
        compras,
        entregas,
        pedidos,
        qtdPedidos: pedidos.filter((p) => !p.semCompra).length,
        historico,
      });
    }
  }

  return linhas.sort((a, b) => b.faturamento - a.faturamento);
}

/** "Pastel na Feira - Alfredo Balena" + base "Pastel na Feira" -> "Alfredo Balena" */
function unidadeCurta(nomeCompleto: string, base: string): string | null {
  const partes = String(nomeCompleto).split(/\s+[-–—/]\s+/);
  if (partes.length > 1) return partes.slice(1).join(" · ").trim() || null;
  const rest = normKey(nomeCompleto).replace(normKey(base), "").trim();
  return rest ? nomeCompleto.slice(-rest.length).trim() : null;
}

/** janela (dias) para conciliar bonificação sem pedido na mesma data */
const JANELA_DIAS = 7;

const diasEntre = (a: string | null | undefined, b: string | null | undefined) => {
  const da = Date.parse(`${diaDeIso(a)}T00:00:00Z`);
  const db = Date.parse(`${diaDeIso(b)}T00:00:00Z`);
  if (!Number.isFinite(da) || !Number.isFinite(db)) return Number.POSITIVE_INFINITY;
  return Math.round((da - db) / 86400000);
};

function novoPedido(base: Partial<PedidoBonificacao>): PedidoBonificacao {
  return {
    codigo: null,
    data: null,
    cliente: "",
    itens: [],
    kg: 0,
    valor: 0,
    esperado: 0,
    entregue: 0,
    diferenca: 0,
    divergente: false,
    categorias: [],
    entregas: [],
    semCompra: false,
    ...base,
  };
}

/**
 * Concilia PEDIDOS DE COMPRA x BONIFICAÇÕES.
 *
 * A bonificação raramente carrega o mesmo número de pedido da compra, então a
 * associação é feita em cascata:
 *   1. vínculo manual salvo pelo usuário;
 *   2. mesmo código de venda;
 *   3. mesmo cliente + mesma data (somando várias bonificações do dia);
 *   4. vários pedidos no mesmo dia -> desempate por produto/quantidade;
 *   5. pedido mais próximo dentro de 7 dias;
 *   6. sem nenhum pedido compatível -> "bonificação sem pedido de compra".
 *
 * Divergências NÃO alteram a % de negociação do cliente.
 */
export function montarPedidos(
  compras: CompraDetalhe[],
  entregas: EntregaDetalhe[],
  pct: number,
  vinculos?: Map<number, VinculoManual>,
): PedidoBonificacao[] {
  const mapa = new Map<string, PedidoBonificacao>();
  const chaveCompra = (codigo: string | null, data: string | null | undefined) =>
    codigo ? `c:${codigo}` : `d:${diaDeIso(data)}`;

  for (const c of compras) {
    const k = chaveCompra(c.codigoVenda, c.data);
    let p = mapa.get(k);
    if (!p) {
      p = novoPedido({ codigo: c.codigoVenda, data: c.data, cliente: c.cliente });
      mapa.set(k, p);
    }
    p.itens.push({ produto: c.produto, kg: c.kg, valor: c.valor });
    p.kg += c.kg;
    p.valor += c.valor;
  }

  const pedidosCompra = [...mapa.values()];
  const porCodigo = new Map<string, PedidoBonificacao>();
  const porDia = new Map<string, PedidoBonificacao[]>();
  for (const p of pedidosCompra) {
    if (p.codigo) porCodigo.set(String(p.codigo), p);
    const dia = diaDeIso(p.data);
    const arr = porDia.get(dia);
    if (arr) arr.push(p);
    else porDia.set(dia, [p]);
  }

  const anexar = (p: PedidoBonificacao, e: EntregaDetalhe, origem: VinculoOrigem) => {
    p.entregas.push({ ...e, vinculo: origem });
    p.entregue += e.kg;
    if (e.categoria && !p.categorias.includes(e.categoria)) p.categorias.push(e.categoria);
  };

  const avulsos: PedidoBonificacao[] = [];

  for (const e of entregas) {
    const manual = vinculos?.get(e.id);

    // 1. vínculo manual
    if (manual) {
      if (manual.desvinculado) {
        avulsos.push(
          novoPedido({
            codigo: e.codigoVenda,
            data: e.data,
            cliente: e.cliente,
            semCompra: true,
            entregas: [{ ...e, vinculo: "sem_pedido" }],
            entregue: e.kg,
            categorias: e.categoria ? [e.categoria] : [],
          }),
        );
        continue;
      }
      const alvo = manual.codigoVenda ? porCodigo.get(String(manual.codigoVenda)) : undefined;
      if (alvo) {
        anexar(alvo, e, "manual");
        continue;
      }
    }

    // 2. mesmo código de venda
    if (e.codigoVenda && porCodigo.has(String(e.codigoVenda))) {
      anexar(porCodigo.get(String(e.codigoVenda))!, e, "codigo");
      continue;
    }

    // 3/4. mesma data
    const doDia = porDia.get(diaDeIso(e.data)) ?? [];
    if (doDia.length === 1) {
      anexar(doDia[0], e, "data");
      continue;
    }
    if (doDia.length > 1) {
      const familia = produtoFamilia(e.produto);
      const compativeis = doDia.filter((p) => p.itens.some((i) => produtoFamilia(i.produto) === familia));
      const candidatos = compativeis.length ? compativeis : doDia;
      if (candidatos.length === 1) {
        anexar(candidatos[0], e, "data");
        continue;
      }
      // desempate por quantidade esperada mais próxima, só quando é claramente melhor
      const ranked = candidatos
        .map((p) => ({ p, dist: Math.abs(p.kg * (pct / 100) - e.kg) }))
        .sort((a, b) => a.dist - b.dist);
      if (ranked.length > 1 && ranked[1].dist - ranked[0].dist > 0.5) {
        anexar(ranked[0].p, e, "data");
        continue;
      }
      avulsos.push(
        novoPedido({
          codigo: e.codigoVenda,
          data: e.data,
          cliente: e.cliente,
          semCompra: true,
          pendenteConciliacao: true,
          entregas: [{ ...e, vinculo: "pendente" }],
          entregue: e.kg,
          categorias: e.categoria ? [e.categoria] : [],
        }),
      );
      continue;
    }

    // 5. pedido mais próximo dentro da janela (bonificação lançada em outro dia)
    const familia = produtoFamilia(e.produto);
    let melhor: { p: PedidoBonificacao; dist: number } | null = null;
    for (const p of pedidosCompra) {
      const dist = Math.abs(diasEntre(e.data, p.data));
      if (dist > JANELA_DIAS) continue;
      const combina = p.itens.some((i) => produtoFamilia(i.produto) === familia);
      const score = dist + (combina ? 0 : 0.5);
      if (!melhor || score < melhor.dist) melhor = { p, dist: score };
    }
    if (melhor) {
      anexar(melhor.p, e, "proximidade");
      continue;
    }

    // 6. nenhum pedido compatível
    avulsos.push(
      novoPedido({
        codigo: e.codigoVenda,
        data: e.data,
        cliente: e.cliente,
        semCompra: true,
        entregas: [{ ...e, vinculo: "sem_pedido" }],
        entregue: e.kg,
        categorias: e.categoria ? [e.categoria] : [],
      }),
    );
  }

  const lista = [...pedidosCompra, ...avulsos];
  for (const p of lista) {
    p.esperado = p.kg * (pct / 100);
    p.diferenca = p.entregue - p.esperado;
    const tolerancia = Math.max(p.esperado * TOLERANCIA, 0.01);
    p.divergente = Math.abs(p.diferenca) > tolerancia;
  }

  return lista.sort((a, b) => String(a.data ?? "").localeCompare(String(b.data ?? "")));
}


