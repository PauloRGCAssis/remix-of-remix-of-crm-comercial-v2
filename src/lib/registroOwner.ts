/**
 * Regra global de PROPRIEDADE de registro operacional.
 *
 * Todo registro possui um USUÁRIO CRIADOR (`criado_por`) e um VENDEDOR
 * RESPONSÁVEL (`vendedor`). A visibilidade segue o criador: registros
 * históricos criados pelo administrador continuam pertencendo a ele e não
 * aparecem para outros logins, mesmo quando o vendedor responsável é outro.
 *
 * Registros sem qualquer evidência de dono (ambíguos) ficam visíveis apenas
 * para o administrador — nunca são atribuídos automaticamente a alguém.
 */
export interface RegistroComDono {
  criado_por?: string | null;
  agendado_por?: string | null;
  vendedor?: string | null;
}

/** Dono efetivo do registro (ou `null` quando ambíguo). */
export function donoDoRegistro(registro: RegistroComDono): string | null {
  const dono = registro.criado_por ?? registro.agendado_por ?? registro.vendedor ?? null;
  const limpo = (dono ?? "").trim();
  return limpo || null;
}
