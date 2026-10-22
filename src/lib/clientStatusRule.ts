/**
 * Régua oficial e única de classificação automática de clientes
 * com base nos dias sem comprar.
 *
 * Regra global do sistema (CRM):
 *   - 0 a 15 dias  → "ativo"   (Em dia, verde)
 *   - 16 a 59 dias → "atencao" (Atenção, amarelo/laranja)
 *   - >= 60 dias   → "critico" (Crítico, vermelho)
 *
 * Esta função NÃO considera override manual. O status manual é
 * tratado em uma camada separada (useClientStatusOverride) e
 * prevalece sobre o cálculo automático quando definido.
 */

export type AutoClientStatus = "ativo" | "atencao" | "critico";

export function calcularStatusCliente(diasSemCompra: number): AutoClientStatus {
  const d = Math.max(0, Math.floor(diasSemCompra));
  if (d <= 15) return "ativo";
  if (d <= 59) return "atencao";
  return "critico";
}

export function statusLabel(status: AutoClientStatus | "inativo"): string {
  if (status === "ativo") return "Em dia";
  if (status === "atencao") return "Atenção";
  if (status === "critico") return "Crítico";
  return "Inativo";
}
