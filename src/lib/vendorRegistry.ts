export interface VendorSaleLike {
  data: string;
  vendedor: string;
}

export interface ValidVendorRecord {
  nome_exibicao: string;
  origem: "lista base" | "venda 2026" | "lista base + venda 2026" | "historico";
  ativo_no_filtro: boolean;
  esta_na_lista_base: boolean;
  tem_venda_em_2026: boolean;
  chave_normalizada: string;
  nomes_origem: string[];
}

export const FILTER_VENDOR_SALES_YEAR = 2026;

export const OFFICIAL_VENDOR_BASE_RAW = [
  "Ti Delso",
  "Alexandre Julio Goncalves",
  "Distribuidora Portal RP - Rio de Janeiro/RJ (IM)",
  "Ednei Juliano da Conceicao",
  "Fabio Paschoal Martins",
  "Haroldo Henrique Madureira",
  "João Paulo Codo",
  "Jorge Andre Santiago Rebelo",
  "Juliano Carneiro Meira Freitas",
  "Loja Virtual - compretidelso.com.br",
  "Moretti Representações - Marcelo Pinto Moretti",
  "Raiane Pereira Batista",
  "Renato Dutra Salgado",
  "Vinicius Gomes Menez",
] as const;

export function normalizeVendorText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeVendorKey(value: string): string {
  return normalizeVendorText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function sortVendorNames(values: Iterable<string>): string[] {
  return [...values].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

export function shortVendedorName(fullName: string): string {
  const cleaned = normalizeVendorText(fullName).replace(/^\*+|\*+$/g, "");
  const normalized = normalizeVendorKey(cleaned);

  const map: Array<[RegExp, string]> = [
    [/^juliano carneiro\b/, "Juliano"],
    [/^ednei juliano\b/, "Ednei"],
    [/^haroldo henrique\b/, "Henrique"],
    [/^joao paulo\b/, "João Paulo"],
    [/^ti delso\b/, "Ti Delso"],
    [/^raiane\b/, "Raiane"],
    [/^jorge andre\b/, "Jorge"],
    [/^renato dutra\b/, "Renato"],
    [/^moretti\b/, "Moretti"],
    [/^loja virtual\b/, "Loja Virtual"],
    [/^vinicius\b/, "Vinicius"],
    [/^representante\b/, "Vinicius"],
    [/vinicius gomes/, "Vinicius"],
    [/^alexandre julio\b/, "Alexandre"],
    [/^alexandre\b/, "Alexandre"],
    [/^fabio paschoal\b/, "Fabio"],
    [/^fabio\b/, "Fabio"],
    [/^distribuidora portal\b/, "Portal RP"],
    [/^distribuidor portal\b/, "Portal RP"],
    [/^portal rp\b/, "Portal RP"],
  ];

  for (const [pattern, short] of map) {
    if (pattern.test(normalized)) {
      return short;
    }
  }

  return cleaned.split(" ")[0] || cleaned;
}

export const ACTIVE_VENDEDORES = sortVendorNames(
  new Set(OFFICIAL_VENDOR_BASE_RAW.map((name) => shortVendedorName(name))),
);

export function buildValidVendorRegistry<T extends VendorSaleLike>(sales: T[], now = new Date()): ValidVendorRecord[] {
  const registry = new Map<string, {
    estaNaListaBase: boolean;
    temVendaEm2026: boolean;
    nomesOrigem: Set<string>;
  }>();

  const ensureEntry = (displayName: string) => {
    const normalizedDisplay = normalizeVendorText(displayName);
    if (!registry.has(normalizedDisplay)) {
      registry.set(normalizedDisplay, {
        estaNaListaBase: false,
        temVendaEm2026: false,
        nomesOrigem: new Set<string>(),
      });
    }
    return registry.get(normalizedDisplay)!;
  };

  OFFICIAL_VENDOR_BASE_RAW.forEach((rawName) => {
    const displayName = shortVendedorName(rawName);
    const entry = ensureEntry(displayName);
    entry.estaNaListaBase = true;
    entry.nomesOrigem.add(rawName);
  });

  const yearStart = new Date(FILTER_VENDOR_SALES_YEAR, 0, 1).getTime();
  const nowTimestamp = now.getTime();

  sales.forEach((sale) => {
    const rawName = normalizeVendorText(String(sale.vendedor ?? ""));
    if (!rawName) return;

    const displayName = shortVendedorName(rawName);
    const entry = ensureEntry(displayName);
    entry.nomesOrigem.add(rawName);

    const saleTimestamp = new Date(sale.data).getTime();
    if (!Number.isNaN(saleTimestamp) && saleTimestamp >= yearStart && saleTimestamp <= nowTimestamp) {
      entry.temVendaEm2026 = true;
    }
  });

  return [...registry.entries()]
    .map(([displayName, entry]) => {
      const ativoNoFiltro = entry.estaNaListaBase || entry.temVendaEm2026;
      const origem = entry.estaNaListaBase
        ? entry.temVendaEm2026
          ? "lista base + venda 2026"
          : "lista base"
        : entry.temVendaEm2026
          ? "venda 2026"
          : "historico";

      return {
        nome_exibicao: displayName,
        origem,
        ativo_no_filtro: ativoNoFiltro,
        esta_na_lista_base: entry.estaNaListaBase,
        tem_venda_em_2026: entry.temVendaEm2026,
        chave_normalizada: normalizeVendorKey(displayName),
        nomes_origem: sortVendorNames(entry.nomesOrigem),
      } satisfies ValidVendorRecord;
    })
    .sort((a, b) => a.nome_exibicao.localeCompare(b.nome_exibicao, "pt-BR"));
}

export function getValidVendorOptions<T extends VendorSaleLike>(sales: T[], now = new Date()): string[] {
  return buildValidVendorRegistry(sales, now)
    .filter((record) => record.ativo_no_filtro)
    .map((record) => record.nome_exibicao);
}

export function getValidVendorNameSet<T extends VendorSaleLike>(sales: T[], now = new Date()): Set<string> {
  return new Set(getValidVendorOptions(sales, now));
}
