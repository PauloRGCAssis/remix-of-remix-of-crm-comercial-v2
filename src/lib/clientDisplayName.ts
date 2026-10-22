// Regra global de exibição: priorizar Nome Fantasia, com fallback para Razão Social.
export function getClientDisplayName(profile: {
  nome?: string | null;
  nome_fantasia?: string | null;
}): string {
  const fantasia = (profile.nome_fantasia ?? "").trim();
  if (fantasia) return fantasia;
  return (profile.nome ?? "").trim();
}
