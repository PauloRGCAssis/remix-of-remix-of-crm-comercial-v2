const STATUS_PREFIXES = ["inativo", "inadimplente"];
const TRAILING_TAGS = ["im", "gr"];

// Alias map: different trade names that refer to the same client
// Key: normalized lowercase name → canonical name
const CLIENT_ALIASES: Record<string, string> = {
  "rosana domingos martins master bebidas": "Master Bebidas - Nova Lima",
  "rosana domingos martins": "Master Bebidas - Nova Lima",
  "hotel tryp savassi": "Hotel Casino Tower Savassi",
  "hotel trip savassi": "Hotel Casino Tower Savassi",
  "hotel cassino tower savassi": "Hotel Casino Tower Savassi",
  "hotel casino tower savassi": "Hotel Casino Tower Savassi",
  "hotel casino towers": "Hotel Casino Tower Savassi",
  "hotel casino towers savassi": "Hotel Casino Tower Savassi",
  "lanchonete arena paris bar bh": "Arena Paris BH",
  "arena paris bar bh": "Arena Paris BH",
  "arena paris bh": "Arena Paris BH",
  "colegio magnum cid nova": "Colégio Magnum Cidade Nova",
  "colegio magnum cidade nova": "Colégio Magnum Cidade Nova",
  "conveniencia flexpoint": "Posto Vila da Serra - Conveniência Flexpoint",
  "posto vila da serra conveniencia flexpoint": "Posto Vila da Serra - Conveniência Flexpoint",
  "lanchonete praxis colegio alpha de sete lagoas sete lagoas": "Lanchonete Praxis - Colégio Alpha - Sete Lagoas",
  "lanchonete praxis colegio alpha sete lagoas": "Lanchonete Praxis - Colégio Alpha - Sete Lagoas",
  "lanchonete dri lanches corinto": "Lanchonete Dri Lanches - Corinto",
  "lanchonete uai sabor": "Lanchonete Uai Sabor - So Marcas Outlet Contagem",
  "emporio toscanini santa lucia": "Cafe Toscanini Century",
  "sacolao abc sion paraguai": "Sacolao ABC - Sion",
  "sacolao abc sionparaguai": "Sacolao ABC - Sion",
  "casa e jardim coffee brumadinho": "Casa e Jardim Coffee - Casa Branca",
  "cafeteria toscanini century tower building": "Cafe Toscanini Century",
  "adriana costa tavares lages": "Adriana Costa Tavares Lages - Clube do Pao de Queijo",
  "alice sojza": "Alice Souza",
  "dom helder restaurante universitario": "Dom Helder - Restaurante Universitário",
  "lanchonete faculdade dom helder camara": "Dom Helder - Restaurante Universitário",
  "lanchonete lourdes cafe faculdade dom helder": "Dom Helder - Restaurante Universitário",
  "lanchonete nossa cantina faculdade dom helder": "Dom Helder - Restaurante Universitário",
  "cafeteria nanart decora": "Taq Emporio - Brumadinho",
  "taq emporio brumadinho": "Taq Emporio - Brumadinho",
  "emporio danta alimentos": "Emporio Danta Alimentos - Confins",
  "emporio danta alimentos confins": "Emporio Danta Alimentos - Confins",
  "lanchonete pastel na feira": "Lanchonete Pastel na Feira - Alfredo Balena",
  "lanchonete pastel na feira alfredo balena": "Lanchonete Pastel na Feira - Alfredo Balena",
  "lanchonete pastel na feira alvares maciel": "Lanchonete Pastel na Feira - Alvares Maciel",
  "emporio delicias da roca": "Emporio Delicias da Roca - Ipatinga",
  "emporio delicias da roca ipatinga": "Emporio Delicias da Roca - Ipatinga",
  "emporio delicias da roca jardim vitoria": "Emporio Delicias da Roca - Ipatinga",
  "escola jose vilaca guimaraes": "Escola Jose Vilaca Guimaraes - Betim",
  "escola jose vilaca guimaraes betim": "Escola Jose Vilaca Guimaraes - Betim",
  "maria de lourdes barros andrade": "Maria de Lourdes Barros Andrade Silva",
  "maria de lourdes barros andrade silva": "Maria de Lourdes Barros Andrade Silva",
  "mariana de oliveira": "Mariana de Oliveira Santos",
  "mariana de oliveira santos": "Mariana de Oliveira Santos",
  "conveniencia sr posto ipiranga alphaville": "Posto Sr - AM/PM - Alphaville",
  "posto sr am pm alphaville": "Posto Sr - AM/PM - Alphaville",
  "conveniencia express select betim": "Posto Cidade Nova - Conveniencia Express Shell Select - Betim",
  "posto cidade nova conveniencia express shell select betim": "Posto Cidade Nova - Conveniencia Express Shell Select - Betim",
  // Empresas similares
  "mister black cafe shopping estacao": "Mister Black Cafe - Shopping Estação",
  "buffet linos eventos sete lagoas": "Linos Eventos e Serviços - Sete Lagoas",
  "linos eventos e servicos sete lagoas": "Linos Eventos e Serviços - Sete Lagoas",
  "lanches simone jardim filadelfia": "Simone Lanches - Jardim Filadelfia",
  "simone lanches jardim filadelfia": "Simone Lanches - Jardim Filadelfia",
  "escola antonio d assis martins betim": "Escola Municipal Antonio D'Assis Martins",
  "escola municipal antonio d assis martins": "Escola Municipal Antonio D'Assis Martins",
  // Pessoas físicas
  "jussara ferreira ferreira": "Jussara Ferreira",
  "jussara ferreira": "Jussara Ferreira",
  "isabella bueno de vasconcelos": "Isabella Bueno de Vasconcelos - Clube do Pao de Queijo",
  "isabella bueno de vasconcelos clube do pao de queijo": "Isabella Bueno de Vasconcelos - Clube do Pao de Queijo",
  "tatiana coelho": "Tatiana Coelho Jacomini",
  "tatiana coelho jacomini": "Tatiana Coelho Jacomini",
  "ana luisa": "Ana Luisa Facchini",
  "ana luisa facchini": "Ana Luisa Facchini",
  // CNPJ e variações de nome
  "54009163000164 atelie do pao de queijo cabo frio rj": "Atelie do Pao de Queijo - Cabo Frio/RJ",
  "atelie do pao de queijo cabo frio rj": "Atelie do Pao de Queijo - Cabo Frio/RJ",
  "alexandre construtora versatil via permuta": "Construtora Versatil - Via Permuta",
  "construtora versatil via permuta": "Construtora Versatil - Via Permuta",
  "empresa jing jin jardim canada": "Jing Jin Brasil - Jardim Canada",
  "jing jin brasil jardim canada": "Jing Jin Brasil - Jardim Canada",
  "padaria mm": "Padaria MM - Ibirite",
  "padaria mm ibirite": "Padaria MM - Ibirite",
  "restaurante porto fino": "Restaurante Porto Fino - Shopping Boulevard",
  "restaurante porto fino shopping boulevard": "Restaurante Porto Fino - Shopping Boulevard",
  // Diferenças de caixa alta/baixa (normalização automática)
  "ana beatriz figueiredo lanza dias machado": "Ana Beatriz Figueiredo Lanza Dias Machado",
  "dalva terra": "Dalva Terra",
  "eliana rodrigues": "Eliana Rodrigues",
  "elisangela chagas da cruz coelho": "Elisangela Chagas da Cruz Coelho",
  "josiane tavares": "Josiane Tavares",
  "kessia ghisleni": "Kessia Ghisleni",
  "rosilene lopes oliveira": "Rosilene Lopes Oliveira",
  "fernanda f fernandes de oliveira serrano": "Fernanda Fernandes de Oliveira Serrano",
  "fernanda fernandes de oliveira serrano": "Fernanda Fernandes de Oliveira Serrano",
};

function normalizeSpaces(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function toAliasKey(value: string): string {
  return normalizeSpaces(
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " "),
  );
}

// Marcadores de sistema/status que NUNCA fazem parte do nome do cliente.
// Removidos de qualquer posição: (IM), (GR), (TD), (INATIVO), (INADIMPLENTE)...
const MARCADORES = ["im", "gr", "td", "inativo", "inadimplente", "matriz", "filial"];
const MARCADOR_PATTERN = new RegExp(`\\(\\s*(?:${MARCADORES.join("|")})\\s*\\)`, "gi");

export function stripClientMarkers(value: string): string {
  return normalizeSpaces(String(value ?? "").replace(MARCADOR_PATTERN, " "));
}

/** Extrai canal/status embutidos no nome, mantendo o nome limpo. */
export function extractClientMetadata(rawName: string): {
  nome: string;
  marcadores: string[];
} {
  const original = normalizeSpaces(rawName || "");
  const marcadores = (original.match(MARCADOR_PATTERN) ?? []).map((m) =>
    m.replace(/[()\s]/g, "").toUpperCase(),
  );
  return { nome: normalizeClientName(original), marcadores };
}

function stripParenthesesAtEdges(value: string): string {
  let current = stripClientMarkers(value);

  while (true) {
    const next = normalizeSpaces(
      current
        .replace(/^\s*\([^)]*\)\s*/g, "")
        .replace(/\s*\([^)]*\)\s*$/g, ""),
    );

    if (next === current) return next;
    current = next;
  }
}


// Aliases dinâmicos carregados em runtime (tabela client_aliases do Supabase).
let DYNAMIC_ALIASES: Record<string, string> = {};

// Sentinela usada para marcar clientes que devem ser ocultados de todas as análises.
// Quando um alias mapeia para este valor, o cliente é tratado como excluído.
export const EXCLUDED_CANONICAL = "__EXCLUIDO__";

export function isExcludedClientName(name: string | null | undefined): boolean {
  return (name ?? "") === EXCLUDED_CANONICAL;
}

export function setDynamicAliases(map: Record<string, string>): void {
  const next: Record<string, string> = {};
  for (const [aliasRaw, canonical] of Object.entries(map || {})) {
    if (!aliasRaw || !canonical) continue;
    next[toAliasKey(aliasRaw)] = canonical;
  }
  DYNAMIC_ALIASES = next;
}

export function getDynamicAliases(): Record<string, string> {
  return DYNAMIC_ALIASES;
}

export function normalizeClientName(rawName: string): string {
  const original = normalizeSpaces(rawName || "");
  if (!original) return "";

  // Alias dinâmico sobre o nome bruto (precisão máxima)
  const dynRaw = DYNAMIC_ALIASES[toAliasKey(original)];
  if (dynRaw) return dynRaw;

  let cleaned = stripParenthesesAtEdges(original);

  const statusPattern = new RegExp(`^(?:${STATUS_PREFIXES.join("|")})\\b[\\s:-]*`, "i");
  while (statusPattern.test(cleaned)) {
    cleaned = normalizeSpaces(cleaned.replace(statusPattern, ""));
  }

  const trailingTagPattern = new RegExp(`\\s+(?:${TRAILING_TAGS.join("|")})$`, "i");
  while (trailingTagPattern.test(cleaned)) {
    cleaned = normalizeSpaces(cleaned.replace(trailingTagPattern, ""));
  }

  cleaned = stripParenthesesAtEdges(cleaned);

  const result = cleaned || original;

  // Alias dinâmico sobre o nome limpo
  const dynClean = DYNAMIC_ALIASES[toAliasKey(result)];
  if (dynClean) return dynClean;

  // Aliases estáticos legados
  const alias = CLIENT_ALIASES[toAliasKey(result)];
  return alias || result;
}

