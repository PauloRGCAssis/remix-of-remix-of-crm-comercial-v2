import { matchBairroRegional } from '@/lib/bairroNormalization';
// Mapping of bairros to regionais (BH and surroundings)
export const BAIRRO_REGIONAL_MAP: Record<string, string> = {
  // Regional Centro-Sul
  'Centro': 'Centro-Sul',
  'Savassi': 'Centro-Sul',
  'Funcionários': 'Centro-Sul',
  'Lourdes': 'Centro-Sul',
  'Santo Agostinho': 'Centro-Sul',
  'São Pedro': 'Centro-Sul',
  'Barro Preto': 'Centro-Sul',
  'Afonso Pena': 'Centro-Sul',
  'Mangabeiras': 'Centro-Sul',
  'Serra': 'Centro-Sul',
  'Anchieta': 'Centro-Sul',
  'Cruzeiro': 'Centro-Sul',
  'Carmo': 'Centro-Sul',
  'São Lucas': 'Centro-Sul',

  // Regional Oeste
  'Gutierrez': 'Oeste',
  'Prado': 'Oeste',
  'Calafate': 'Oeste',
  'Gameleira': 'Oeste',
  'Nova Suíça': 'Oeste',
  'Estoril': 'Oeste',
  'Buritis': 'Oeste',
  'Nova Granada': 'Oeste',
  'Nova Cintra': 'Oeste',
  'Betânia': 'Oeste',

  // Regional Pampulha
  'Pampulha': 'Pampulha',
  'Ouro Preto': 'Pampulha',
  'Castelo': 'Pampulha',
  'São Luiz': 'Pampulha',
  'Bandeirantes': 'Pampulha',
  'Jaraguá': 'Pampulha',
  'Itapoã': 'Pampulha',
  'São José': 'Pampulha',
  'Santa Amélia': 'Pampulha',
  'Dona Clara': 'Pampulha',
  'Liberdade': 'Pampulha',

  // Regional Barreiro
  'Barreiro': 'Barreiro',
  'Diamante': 'Barreiro',
  'Lindéia': 'Barreiro',
  'Jatobá': 'Barreiro',
  'Milionários': 'Barreiro',

  // Regional Nordeste
  'São Benedito': 'Nordeste',
  'Santa Efigênia': 'Nordeste',
  'Sagrada Família': 'Nordeste',
  'Floresta': 'Nordeste',
  'Santa Teresa': 'Nordeste',
  'Horto': 'Nordeste',
  'Lagoinha': 'Nordeste',

  // Regional Noroeste
  'Carlos Prates': 'Noroeste',
  'Padre Eustáquio': 'Noroeste',
  'Caiçara': 'Noroeste',
  'Dom Cabral': 'Noroeste',
  'Coração Eucarístico': 'Noroeste',
  'Glória': 'Noroeste',

  // Regional Norte
  'Venda Nova': 'Norte',
  'São Bernardo': 'Norte',
  'Tupi': 'Norte',
  'Primeiro de Maio': 'Norte',
  'Planalto': 'Norte',

  // Regional Leste
  'Pompéia': 'Leste',
  'São Geraldo': 'Leste',
  'Vera Cruz': 'Leste',
  'Taquaril': 'Leste',
  'Alto Vera Cruz': 'Leste',

  // Outros / Grande BH
  'Vale do Sol': 'Norte',
  'São Bento': 'Norte',
  'Realengo': 'Outros',
};

export const REGIONAIS = [
  'Barreiro', 'Centro-Sul', 'Leste', 'Nordeste', 'Noroeste', 'Norte', 'Oeste', 'Pampulha', 'Venda Nova'
];

const normKey = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();

export function getRegionalByBairro(bairro?: string): string {
  if (!bairro || !bairro.trim()) return 'Não definida';
  // Fonte oficial: tabela completa de bairros de BH (normalizada + fuzzy)
  const m = matchBairroRegional(bairro);
  if (m.regional) return m.regional;
  if (m.regional_status === 'AUTO_AMBIGUO' && m.matches[0]) return m.matches[0].regional;
  // Retaguarda: mapa curto legado, comparado sem acento/caixa
  const k = normKey(bairro);
  for (const [nome, reg] of Object.entries(BAIRRO_REGIONAL_MAP)) {
    if (normKey(nome) === k && REGIONAIS.includes(reg)) return reg;
  }
  return 'Outros';
}
