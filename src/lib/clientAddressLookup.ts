// Busca de endereços/contatos de um cliente para preenchimento automático de formulários.
// Consulta a ficha (client_profiles) e, como retaguarda, a base de endereços
// importada do cadastro Sige (client_address_staging) — assim clientes que ainda
// não têm ficha também preenchem endereço automaticamente.

import { supabase } from "@/integrations/supabase/client";
import { docKey, nameKeyStrict } from "@/lib/clientAddressMatch";
import { formatPhone } from "@/lib/phoneFormatting";

export interface EnderecoOpcao {
  id: string;
  label: string;
  endereco: string;
  bairro: string;
  cidade: string;
  estado: string;
  contato: string;
  origem: "ficha" | "cadastro";
}

function juntarEndereco(p: {
  rua?: string | null;
  numero?: string | null;
  complemento?: string | null;
}): string {
  const base = [p.rua, p.numero].filter(Boolean).join(", ");
  return [base, p.complemento].filter(Boolean).join(" - ").trim();
}

function contatoDeFicha(p: any): string {
  const contatos = Array.isArray(p?.contatos) ? p.contatos : [];
  const principal = contatos[0];
  const nome = principal?.nome ?? "";
  const fone = principal?.telefone || principal?.whatsapp || p?.telefone || p?.whatsapp || "";
  const foneFmt = fone ? formatPhone(String(fone)) : "";
  return [nome, foneFmt].filter(Boolean).join(" · ");
}

function safeTerm(value: string) {
  return value.replace(/[%,()*]/g, " ").trim();
}

/** Todas as unidades/endereços conhecidos para um cliente. */
export async function fetchEnderecoOpcoes(nome: string, cnpj?: string | null): Promise<EnderecoOpcao[]> {
  const doc = docKey(cnpj);
  const termo = safeTerm(nome ?? "");
  const chave = nameKeyStrict(nome);
  const opcoes: EnderecoOpcao[] = [];

  const filtros: string[] = [];
  if (termo) filtros.push(`nome.ilike.%${termo}%`, `nome_fantasia.ilike.%${termo}%`);

  if (doc || filtros.length) {
    let q = (supabase as any).from("client_profiles").select("*").limit(20);
    q = doc ? q.or([`cnpj.ilike.%${doc}%`, ...filtros].join(",")) : q.or(filtros.join(","));
    const { data } = await q;
    for (const p of (data ?? []) as any[]) {
      opcoes.push({
        id: `ficha-${p.id}`,
        label: [p.nome_fantasia?.trim() || p.nome, p.bairro, p.cidade].filter(Boolean).join(" · "),
        endereco: juntarEndereco(p),
        bairro: p.bairro ?? "",
        cidade: p.cidade ?? "",
        estado: p.estado ?? "",
        contato: contatoDeFicha(p),
        origem: "ficha",
      });
    }
  }

  // Retaguarda: cadastro importado (clientes ainda sem ficha ou unidades extras)
  if (doc || termo) {
    let q = (supabase as any).from("client_address_staging").select("*").limit(20);
    const stagingFiltros = termo
      ? [`nome_fantasia.ilike.%${termo}%`, `razao_social.ilike.%${termo}%`]
      : [];
    q = doc ? q.or([`cnpj_cpf.ilike.%${doc}%`, ...stagingFiltros].join(",")) : q.or(stagingFiltros.join(","));
    const { data } = await q;
    for (const s of (data ?? []) as any[]) {
      const nomeReg = s.nome_fantasia || s.razao_social || "";
      if (chave && nameKeyStrict(nomeReg) !== chave && !doc) continue;
      const endereco = juntarEndereco(s);
      if (!endereco && !s.bairro && !s.cidade) continue;
      const duplicado = opcoes.some(
        (o) => o.endereco === endereco && o.bairro === (s.bairro ?? "") && o.cidade === (s.cidade ?? ""),
      );
      if (duplicado) continue;
      opcoes.push({
        id: `cadastro-${s.id}`,
        label: [nomeReg, s.bairro, s.cidade].filter(Boolean).join(" · "),
        endereco,
        bairro: s.bairro ?? "",
        cidade: s.cidade ?? "",
        estado: s.estado ?? "",
        contato: s.telefone ? formatPhone(String(s.telefone)) : "",
        origem: "cadastro",
      });
    }
  }

  return opcoes;
}

/** Extrai o número quando ele foi digitado dentro do campo de rua ("Rua X, 123"). */
export function extrairNumeroDaRua(rua?: string | null): string | null {
  const texto = String(rua ?? "").trim();
  if (!texto) return null;
  const m = texto.match(/(?:,|\s)\s*n?[ºo°]?\s*(\d{1,6}[A-Za-z]?)\s*$/);
  return m ? m[1] : null;
}

/**
 * Recupera o número do logradouro de um cliente a partir da base de endereços
 * importada (client_address_staging) quando a ficha ainda não tem esse dado.
 * Somente leitura — nunca altera os registros de origem.
 */
export async function fetchNumeroDoCadastro(
  nome: string,
  cnpj?: string | null,
): Promise<{ numero: string; origem: "cadastro" } | null> {
  const doc = docKey(cnpj);
  const termo = safeTerm(nome ?? "");
  const chave = nameKeyStrict(nome);
  if (!doc && !termo) return null;

  const filtros = termo
    ? [`nome_fantasia.ilike.%${termo}%`, `razao_social.ilike.%${termo}%`]
    : [];
  let q = (supabase as any).from("client_address_staging").select("*").limit(20);
  q = doc ? q.or([`cnpj_cpf.ilike.%${doc}%`, ...filtros].join(",")) : q.or(filtros.join(","));
  const { data } = await q;

  for (const s of (data ?? []) as any[]) {
    const nomeReg = s.nome_fantasia || s.razao_social || "";
    const mesmoDoc = doc ? docKey(s.cnpj_cpf) === doc : false;
    if (!mesmoDoc && chave && nameKeyStrict(nomeReg) !== chave) continue;
    const numero = String(s.numero ?? "").trim();
    if (numero) return { numero, origem: "cadastro" };
    const embutido = extrairNumeroDaRua(s.rua);
    if (embutido) return { numero: embutido, origem: "cadastro" };
  }
  return null;
}
