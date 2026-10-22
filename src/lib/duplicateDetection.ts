// Duplicate detection for leads — matches by similar name or same address

function normalize(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Remove common suffixes/prefixes for better matching
function normalizeCompanyName(name: string): string {
  let n = normalize(name);
  // Remove location suffixes like "- Lourdes", "- Betim", etc.
  n = n.replace(/\s*-\s*[a-z\s]+$/, '').trim();
  // Remove common prefixes
  n = n.replace(/^(padaria|cafeteria|lanchonete|restaurante|hotel|emporio|supermercado|confeitaria)\s+/, '').trim();
  return n;
}

function similarity(a: string, b: string): number {
  if (a === b) return 1;
  const longer = a.length > b.length ? a : b;
  const shorter = a.length > b.length ? b : a;
  if (longer.length === 0) return 1;
  
  // Check if one contains the other
  if (longer.includes(shorter) && shorter.length > 3) {
    return shorter.length / longer.length + 0.3; // Boost containment
  }
  
  // Levenshtein-based
  const costs: number[] = [];
  for (let i = 0; i <= longer.length; i++) {
    let lastValue = i;
    for (let j = 0; j <= shorter.length; j++) {
      if (i === 0) {
        costs[j] = j;
      } else if (j > 0) {
        let newValue = costs[j - 1];
        if (longer[i - 1] !== shorter[j - 1]) {
          newValue = Math.min(newValue, lastValue, costs[j]) + 1;
        }
        costs[j - 1] = lastValue;
        lastValue = newValue;
      }
    }
    if (i > 0) costs[shorter.length] = lastValue;
  }
  return (longer.length - costs[shorter.length]) / longer.length;
}

function normalizeAddress(addr: string): string {
  return normalize(addr)
    .replace(/\b(rua|r|av|avenida|alameda|praca|travessa)\b\.?/g, '')
    .replace(/\b(n|no|num|numero)\b\.?\s*/g, '')
    .replace(/\b(loja|sala|apt|apto|bloco|bl)\b\.?\s*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface DuplicateMatch {
  lead_id: string;
  lead_nome: string;
  match_type: 'nome' | 'endereco' | 'ambos';
  similarity_score: number;
}

export function findDuplicates(
  nome: string,
  endereco: string | undefined,
  existingLeads: { id: string; nome_fantasia: string; endereco?: string }[]
): DuplicateMatch[] {
  const results: DuplicateMatch[] = [];
  const normName = normalizeCompanyName(nome);
  const normAddr = endereco ? normalizeAddress(endereco) : '';

  for (const lead of existingLeads) {
    const leadNormName = normalizeCompanyName(lead.nome_fantasia);
    const nameSim = similarity(normName, leadNormName);
    
    const leadNormAddr = lead.endereco ? normalizeAddress(lead.endereco) : '';
    const addrMatch = normAddr && leadNormAddr && normAddr.length > 5 && leadNormAddr.length > 5
      ? similarity(normAddr, leadNormAddr) >= 0.85
      : false;

    const nameMatch = nameSim >= 0.75;

    if (nameMatch && addrMatch) {
      results.push({ lead_id: lead.id, lead_nome: lead.nome_fantasia, match_type: 'ambos', similarity_score: nameSim });
    } else if (nameMatch) {
      results.push({ lead_id: lead.id, lead_nome: lead.nome_fantasia, match_type: 'nome', similarity_score: nameSim });
    } else if (addrMatch) {
      results.push({ lead_id: lead.id, lead_nome: lead.nome_fantasia, match_type: 'endereco', similarity_score: 0.85 });
    }
  }

  return results.sort((a, b) => b.similarity_score - a.similarity_score);
}
